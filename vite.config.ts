import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import type { Plugin } from 'vite';
import crypto from 'node:crypto';
import { resolveCozeAuthHeader } from './server/cozeOAuth.js';
import {
  createSession,
  extractBearerToken,
  getUserByToken,
  loginUser,
  registerUser,
  revokeSession,
} from './server/authStore.js';
import { deleteWord, getWordbook, importWords, resolveUserId, upsertWord } from './server/wordbookStore.js';

function extractDictTranslation(data: any): string {
  let translation = '';
  try {
    const trs = data.ec?.word?.[0]?.trs?.[0]?.tr?.[0]?.l?.i?.[0];
    if (trs) translation = trs;
  } catch {}

  if (!translation && data.web_trans?.['web-translation']?.[0]?.trans?.[0]?.value) {
    translation = data.web_trans['web-translation'][0].trans[0].value;
  }

  if (!translation && data.fanyi?.tran) {
    translation = data.fanyi.tran;
  }

  return translation;
}

function truncate(text: string): string {
  if (text.length <= 20) return text;
  return `${text.slice(0, 10)}${text.length}${text.slice(-10)}`;
}

async function fetchSentenceTranslation(q: string): Promise<string> {
  const body = new URLSearchParams({
    i: q,
    from: 'en',
    to: 'zh-CHS',
    smartresult: 'dict',
    client: 'fanyideskweb',
    doctype: 'json',
    version: '2.1',
    keyfrom: 'fanyi.web',
    action: 'FY_BY_REALTIME',
  });

  const resp = await fetch('https://fanyi.youdao.com/translate_o?smartresult=dict&smartresult=rule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://fanyi.youdao.com/',
      Origin: 'https://fanyi.youdao.com',
    },
    body: body.toString(),
  });

  const data = await resp.json();
  const lines = Array.isArray(data?.translateResult) ? data.translateResult : [];
  return lines.flat().map((item: any) => item?.tgt || '').join('').trim();
}

function cozeExamplesPlugin(env: Record<string, string>): Plugin {
  const COZE_BASE_URL = (env.COZE_BASE_URL || 'https://api.coze.cn').trim();
  const COZE_WORKFLOW_ID = (env.COZE_WORKFLOW_ID || '').trim();
  return {
    name: 'coze-examples-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai/examples', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const word = String(payload.word || '').trim();
            const count = Number(payload.count || 5);
            const devToken = typeof payload.dev_token === 'string' ? payload.dev_token.trim() : '';
            const nonce = typeof payload.nonce === 'number' ? payload.nonce : Date.now();
            let hard = '';
            try {
              const u = new URL(req.url || '', 'http://local');
              hard = (u.searchParams.get('hard') || '').trim();
            } catch {}
            if (!hard && typeof payload.hard === 'string') {
              hard = payload.hard.trim();
            }
            if (!word) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'word_required' }));
            }
            const auth = await resolveCozeAuthHeader({ env, devToken });
            if (!auth.token || !COZE_WORKFLOW_ID) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ sentences: [], source: 'env_missing' }));
            }
            const url = `${COZE_BASE_URL}/v1/workflow/stream_run`;
            // Construct a prompt to enforce JSON format
            const prompt = `单词：${word}
场景：${hard}
数量：${count}
请生成 ${count} 个例句。
输出格式要求：请严格返回 JSON 格式，不要包含 Markdown 代码块标记。
JSON 结构如下：
{
  "sentences": [
    { "sentence": "英文例句", "translation": "中文翻译" },
    ...
  ]
}`;
            const resp = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${auth.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                workflow_id: COZE_WORKFLOW_ID,
                parameters: { input: prompt, nonce, hard },
              }),
            });
            const raw = await resp.text();
            let latestContent = '';
            const lines = raw.split('\n');
            for (const line of lines) {
              const l = line.trim();
              try {
                if (l.startsWith('data:')) {
                  const obj = JSON.parse(l.slice(5).trim());
                  if (obj?.content) latestContent = obj.content;
                } else if (l.startsWith('{')) {
                  const obj = JSON.parse(l);
                  if (obj?.content) latestContent = obj.content;
                } else if (l.includes('content :')) {
                  // loose format like: content : {"output":"..."}
                  const idx = l.indexOf('content :');
                  const part = l.slice(idx + 'content :'.length).trim();
                  try {
                    const obj = JSON.parse(part);
                    if (obj?.output) latestContent = JSON.stringify(obj);
                  } catch {}
                }
              } catch {}
            }
            let sentences: Array<{ sentence: string; translation?: string }> = [];
            try {
              let outputStr: string | undefined;
              if (latestContent) {
                // latestContent may be a JSON string or an object-like string
                let outer: any = latestContent;
                if (typeof outer === 'string') {
                  try { outer = JSON.parse(outer); } catch {}
                }
                if (outer && typeof outer === 'object' && typeof outer.output === 'string') {
                  outputStr = outer.output;
                }
              } else {
                // fallback: try parse entire raw for output
                try {
                  const maybe = JSON.parse(raw);
                  if (maybe?.output && typeof maybe.output === 'string') {
                    outputStr = maybe.output;
                  } else if (maybe?.content) {
                    let outer2: any = maybe.content;
                    if (typeof outer2 === 'string') {
                      try { outer2 = JSON.parse(outer2); } catch {}
                    }
                    if (outer2?.output && typeof outer2.output === 'string') {
                      outputStr = outer2.output;
                    }
                  }
                } catch {}
              }
              if (outputStr) {
                let cleaned = String(outputStr).trim();
                if (cleaned.startsWith('```')) {
                  cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
                }
                let inner: any;
                try {
                  inner = JSON.parse(cleaned);
                } catch {
                  const a = cleaned.indexOf('[');
                  const b = cleaned.lastIndexOf(']');
                  if (a !== -1 && b !== -1 && b > a) {
                    const arrStr = cleaned.slice(a, b + 1);
                    try { inner = JSON.parse(arrStr); } catch {}
                  }
                  if (!inner) {
                    const c = cleaned.indexOf('{');
                    const d = cleaned.lastIndexOf('}');
                    if (c !== -1 && d !== -1 && d > c) {
                      const objStr = cleaned.slice(c, d + 1);
                      try { inner = JSON.parse(objStr); } catch {}
                    }
                  }
                }
                if (Array.isArray(inner)) {
                  const arr = inner;
                  sentences = arr.slice(0, count).map((it: any) => {
                    if (typeof it === 'string') return { sentence: it };
                    if (it && typeof it === 'object') {
                      if (it.english || it.chinese) {
                        return { sentence: String(it.english || ''), translation: typeof it.chinese === 'string' ? it.chinese : '' };
                      }
                      return { sentence: String(it.sentence || ''), translation: typeof it.translation === 'string' ? it.translation : '' };
                    }
                    return { sentence: '' };
                  }).filter((s: { sentence: string }) => s.sentence);
                } else if (Array.isArray(inner.sentences)) {
                  const arr = inner.sentences;
                  sentences = arr.slice(0, count).map((it: any) => {
                    if (typeof it === 'string') return { sentence: it };
                    if (it && typeof it === 'object') {
                      if (it.english || it.chinese) {
                        return { sentence: String(it.english || ''), translation: typeof it.chinese === 'string' ? it.chinese : '' };
                      }
                      return { sentence: String(it.sentence || ''), translation: typeof it.translation === 'string' ? it.translation : '' };
                    }
                    return { sentence: '' };
                  }).filter((s: { sentence: string }) => s.sentence);
                } else if (inner && typeof inner === 'object' && Array.isArray(inner.data)) {
                  const arr = inner.data;
                  sentences = arr.slice(0, count).map((it: any) => {
                    if (typeof it === 'string') return { sentence: it };
                    if (it && typeof it === 'object') {
                      const eng = String(it.english ?? it.en ?? it.sentence ?? '');
                      const zh = it.chinese ?? it.zh ?? it.cn ?? it.translation ?? '';
                      return { sentence: eng, translation: typeof zh === 'string' ? zh : '' };
                    }
                    return { sentence: '' };
                  }).filter((s: { sentence: string }) => s.sentence);
                } else if (inner && typeof inner === 'object' && Array.isArray(inner.example_sentences)) {
                  const arr = inner.example_sentences;
                  sentences = arr.slice(0, count).map((it: any) => {
                    if (typeof it === 'string') return { sentence: it };
                    if (it && typeof it === 'object') {
                      const eng = String(it.english ?? it.en ?? it.sentence ?? '');
                      const zh = it.chinese ?? it.zh ?? it.cn ?? it.translation ?? '';
                      return { sentence: eng, translation: typeof zh === 'string' ? zh : '' };
                    }
                    return { sentence: '' };
                  }).filter((s: { sentence: string }) => s.sentence);
                } else if (inner && typeof inner === 'object' && (inner.english || inner.chinese)) {
                  const item = { sentence: String(inner.english || ''), translation: typeof inner.chinese === 'string' ? inner.chinese : '' };
                  sentences = item.sentence ? [item] : [];
                } else if (typeof inner === 'string') {
                  sentences = [{ sentence: inner }];
                }
              }
            } catch {}
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            const masked = (s: string) => (s.length > 12 ? `${s.slice(0,6)}...${s.slice(-6)}` : s);
            return res.end(JSON.stringify({
              sentences,
              source: 'coze',
              latestContent,
              raw,
              debug: {
                url,
                workflow: COZE_WORKFLOW_ID,
                token_source: auth.source,
                token_head: masked(auth.token),
                status: resp.status,
                statusText: resp.statusText
              }
            }));
          } catch {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ sentences: [], source: 'internal_error' }));
          }
        });
      });
    },
  };
}

function youdaoTranslatePlugin(env: Record<string, string>): Plugin {
  const YOUDAO_APP_KEY = (env.YOUDAO_APP_KEY || '').trim();
  const YOUDAO_APP_SECRET = (env.YOUDAO_APP_SECRET || '').trim();
  return {
    name: 'youdao-translate-proxy',
    configureServer(server) {
      server.middlewares.use('/api/youdao/translate', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const q = String(payload.q || '').trim();
            const mode = String(payload.mode || 'translate').trim();
            if (!q) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'q_required' }));
            }

            if (mode !== 'dict' && (!YOUDAO_APP_KEY || !YOUDAO_APP_SECRET)) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ translation: '', source: 'env_missing' }));
            }

            if (mode !== 'dict') {
              const salt = `${Date.now()}`;
              const curtime = `${Math.floor(Date.now() / 1000)}`;
              const sign = crypto
                .createHash('sha256')
                .update(`${YOUDAO_APP_KEY}${truncate(q)}${salt}${curtime}${YOUDAO_APP_SECRET}`)
                .digest('hex');

              const officialResp = await fetch('https://openapi.youdao.com/api', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  q,
                  from: 'en',
                  to: 'zh-CHS',
                  appKey: YOUDAO_APP_KEY,
                  salt,
                  sign,
                  signType: 'v3',
                  curtime,
                }).toString(),
              });
              const officialData = await officialResp.json();
              const officialTranslation = Array.isArray(officialData?.translation)
                ? officialData.translation.join(' ').trim()
                : '';

              if (officialTranslation) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ translation: officialTranslation, raw: officialData, source: 'youdao_official' }));
              }
            }
            
            // Switch to Youdao Web API for better dictionary data
            const apiUrl = `http://dict.youdao.com/jsonapi?q=${encodeURIComponent(q)}`;
            console.log(`Proxying to: ${apiUrl}`);
            
            const resp = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const data = await resp.json();
            console.log('Youdao Web API Response for:', q);
            // console.log(JSON.stringify(data, null, 2));

            let translation = extractDictTranslation(data);
            let source = 'youdao_web';

            if (!translation) {
              try {
                translation = await fetchSentenceTranslation(q);
                if (translation) source = 'youdao_sentence';
              } catch (fallbackError) {
                console.error('Youdao sentence fallback error:', fallbackError);
              }
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ translation, raw: data, source }));
          } catch (e) {
            console.error('Proxy Error:', e);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ translation: '', source: 'internal_error' }));
          }
        });
      });
    },
  };
}

function wordbookApiPlugin(): Plugin {
  const resolveRequestUserId = async (req: any, fallbackUserId?: string | null) => {
    const token = extractBearerToken(req.headers?.authorization);
    if (!token) {
      return {
        userId: resolveUserId(fallbackUserId),
        authenticated: false,
      };
    }

    const user = await getUserByToken(token);
    if (!user) return null;

    return {
      userId: user.id,
      user,
      authenticated: true,
    };
  };

  return {
    name: 'wordbook-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/auth/register', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const user = await registerUser(payload.username, payload.password);
            if (!user) {
              throw new Error('register_failed');
            }
            const session = await createSession(user.id);
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(session));
          } catch (error: any) {
            const code = error?.message === 'username_exists' ? 409 : 400;
            res.statusCode = code;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: error?.message || 'register_failed' }));
          }
        });
      });

      server.middlewares.use('/api/auth/login', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const user = await loginUser(payload.username, payload.password);
            if (!user) {
              throw new Error('login_failed');
            }
            const session = await createSession(user.id);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(session));
          } catch (error: any) {
            res.statusCode = error?.message === 'invalid_credentials' ? 401 : 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: error?.message || 'login_failed' }));
          }
        });
      });

      server.middlewares.use('/api/auth/me', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const token = extractBearerToken(req.headers?.authorization);
        const user = await getUserByToken(token);
        res.statusCode = user ? 200 : 401;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(user ? { user } : { error: 'unauthorized' }));
      });

      server.middlewares.use('/api/auth/logout', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        const token = extractBearerToken(req.headers?.authorization);
        if (token) {
          await revokeSession(token);
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: true }));
      });

      server.middlewares.use('/api/health', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: true, service: 'words-api-dev' }));
      });

      server.middlewares.use('/api/wordbook/import', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const resolved = await resolveRequestUserId(req, payload.userId);
            if (!resolved) {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'unauthorized' }));
            }
            const result = await importWords(resolved.userId, payload.words);
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(result));
          } catch (error) {
            console.error('Wordbook import error:', error);
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'wordbook_import_failed' }));
          }
        });
      });

      server.middlewares.use('/api/wordbook', async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'POST') return next();

        if (req.method === 'GET') {
          try {
            const url = new URL(req.url || '', 'http://local');
            const resolved = await resolveRequestUserId(req, url.searchParams.get('userId'));
            if (!resolved) {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'unauthorized' }));
            }
            const result = await getWordbook(resolved.userId);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(result));
          } catch (error) {
            console.error('Wordbook get error:', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'wordbook_load_failed' }));
          }
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const resolved = await resolveRequestUserId(req, payload.userId);
            if (!resolved) {
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'unauthorized' }));
            }
            const word = await upsertWord(resolved.userId, payload.word);
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ userId: resolved.userId, word }));
          } catch (error) {
            console.error('Wordbook save error:', error);
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'wordbook_save_failed' }));
          }
        });
      });

      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.method !== 'DELETE' || !req.url?.startsWith('/api/wordbook/')) return next();
        try {
          const url = new URL(req.url || '', 'http://local');
          const word = decodeURIComponent(url.pathname.replace(/^\/api\/wordbook\//, ''));
          const resolved = await resolveRequestUserId(req, url.searchParams.get('userId'));
          if (!resolved) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'unauthorized' }));
          }
          const result = await deleteWord(resolved.userId, word);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(result));
        } catch (error) {
          console.error('Wordbook delete error:', error);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'wordbook_delete_failed' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  build: {
    sourcemap: 'hidden',
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }), 
    wordbookApiPlugin(),
    youdaoTranslatePlugin(env),
    cozeExamplesPlugin(env),
    tsconfigPaths()
  ],
}
})
