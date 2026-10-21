import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import type { Plugin } from 'vite';
import crypto from 'node:crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import {
  createSession,
  extractBearerToken,
  getUserByToken,
  loginUser,
  registerUser,
  revokeSession,
} from './server/authStore.js';
import { deleteWord, getWordbook, importWords, resolveUserId, upsertWord } from './server/wordbookStore.js';
import {
  appendPracticeRecord,
  addMistakeWords,
  getProfileStats,
  listFavorites,
  listMistakes,
  listPracticeRecords,
  removeFavorite,
  upsertFavorite,
} from './server/profileStore.js';

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

function extractJsonPayload(text: string): any {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/```$/, '')
    .trim();

  if (!cleaned) return null;

  try {
    return JSON.parse(cleaned);
  } catch {}

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    try {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    } catch {}
  }

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    try {
      return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
    } catch {}
  }

  return null;
}

function parseAiSentences(content: string, count: number): Array<{ sentence: string; translation?: string }> {
  const parsed = extractJsonPayload(content);
  const normalize = (arr: any[]) =>
    arr
      .slice(0, count)
      .map((it: any) => {
        if (typeof it === 'string') return { sentence: it };
        if (!it || typeof it !== 'object') return { sentence: '' };
        const eng = String(it.english ?? it.en ?? it.sentence ?? '');
        const zh = it.chinese ?? it.zh ?? it.cn ?? it.translation ?? '';
        return { sentence: eng, translation: typeof zh === 'string' ? zh : '' };
      })
      .filter((s: { sentence: string }) => s.sentence);

  if (Array.isArray(parsed)) return normalize(parsed);
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.sentences)) return normalize(parsed.sentences);
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) return normalize(parsed.data);
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.example_sentences)) return normalize(parsed.example_sentences);
  if (parsed && typeof parsed === 'object' && (parsed.english || parsed.chinese)) {
    const one = {
      sentence: String(parsed.english || ''),
      translation: typeof parsed.chinese === 'string' ? parsed.chinese : '',
    };
    return one.sentence ? [one] : [];
  }
  if (typeof parsed === 'string') return [{ sentence: parsed }];
  return [];
}

function buildExampleMessages(word: string, _count: number, hard: string) {
  const scene = hard || '通用';
  return [
    {
      role: 'system',
      content: `# 角色
你是英语口语例句生成器，专为零基础到初级的中国学习者服务。

# 任务
根据输入的单词和场景，生成10条超简单、超短的口语化例句，附中文翻译。

# 核心规则
1. 必须是日常说话的方式，不是教科书、不是书面语
2. 句子尽量短，5-8个词为佳，不超过10个词
3. 用口语表达，不用正式表达：
   - 用 "I'm gonna" 不用 "I am going to"
   - 用 "Sounds good" 不用 "That sounds like a good idea"
   - 用 "It's kind of" 不用 "It is somewhat"
   - 用 "I don't know" 不用 "I am unaware"
4. 允许出现口语高频词：like、kind of、stuff、actually、basically、you know、I mean
5. 中文翻译也要口语化，说人话，不要翻译腔

# 禁止
- 禁止教科书腔（"How do you do?" "I am fine, thank you."）
- 禁止书面语（"Furthermore" "Nevertheless" "It is worth noting that"）
- 禁止超过10个词的长句
- 禁止脱离生活的抽象例句

# 输出要求
只返回 JSON，不要输出 Markdown 代码块、解释或额外文本。`,
    },
    {
      role: 'user',
      content: `# 输入
单词：${word}
场景：${scene}

# 输出格式
{
  "sentences": [
    { "sentence": "英文例句", "translation": "中文翻译" }
  ]
}`,
    },
  ];
}

function deepseekExamplesPlugin(env: Record<string, string>): Plugin {
  const DEEPSEEK_BASE_URL = (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim();
  const DEEPSEEK_MODEL = (env.DEEPSEEK_MODEL || 'deepseek-chat').trim();
  return {
    name: 'deepseek-examples-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai/examples', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const word = String(payload.word || '').trim();
            const count = Math.max(1, Math.min(10, Number(payload.count || 5)));
            const devToken = typeof payload.dev_token === 'string' ? payload.dev_token.trim() : '';
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
            const apiKey = devToken || (env.DEEPSEEK_API_KEY || '').trim();
            if (!apiKey) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ sentences: [], source: 'env_missing' }));
            }
            const url = `${DEEPSEEK_BASE_URL.replace(/\/$/, '')}/chat/completions`;
            const resp = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages: buildExampleMessages(word, count, hard),
                temperature: 0.7,
                stream: false,
              }),
            });
            const raw = await resp.text();
            let latestContent = '';
            try {
              const data = JSON.parse(raw);
              latestContent = String(data?.choices?.[0]?.message?.content || '').trim();
            } catch {}
            const sentences = parseAiSentences(latestContent, count);
            const masked = (s: string) => (s.length > 12 ? `${s.slice(0,6)}...${s.slice(-6)}` : s);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              sentences,
              source: resp.ok ? 'deepseek' : 'deepseek_error',
              latestContent,
              raw,
              debug: {
                url,
                model: DEEPSEEK_MODEL,
                token_source: devToken ? 'payload' : 'env',
                token_head: masked(apiKey),
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

function edgeTtsPlugin(): Plugin {
  return {
    name: 'edge-tts-proxy',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res, next) => {
        if (req.method !== 'GET') return next();

        let text = '';
        let voice = 'en-US-AriaNeural';
        try {
          const u = new URL(req.url || '', 'http://local');
          text = (u.searchParams.get('text') || '').trim();
          voice = (u.searchParams.get('voice') || voice).trim();
        } catch {}

        if (!text) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'text is required' }));
        }

        try {
          const tts = new MsEdgeTTS();
          await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

          const chunks: Buffer[] = [];
          const { audioStream } = tts.toStream(text.slice(0, 1000));

          await new Promise<void>((resolve, reject) => {
            audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
            audioStream.on('end', () => resolve());
            audioStream.on('error', (err: Error) => reject(err));
          });

          const audioBuffer = Buffer.concat(chunks);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Length', String(audioBuffer.length));
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('X-Voice', voice);
          return res.end(audioBuffer);
        } catch (error) {
          console.error('Edge TTS error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'TTS synthesis failed' }));
        }
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

      server.middlewares.use('/api/profile/stats', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          const url = new URL(req.url || '', 'http://local');
          const resolved = await resolveRequestUserId(req, url.searchParams.get('userId'));
          if (!resolved) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'unauthorized' }));
          }
          const today = (url.searchParams.get('date') || '').trim();
          const stats = await getProfileStats(resolved.userId, { today });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(stats));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'profile_stats_failed' }));
        }
      });

      server.middlewares.use('/api/profile/records', async (req, res, next) => {
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
            const limit = Number(url.searchParams.get('limit') || 20);
            const offset = Number(url.searchParams.get('offset') || 0);
            const result = await listPracticeRecords(resolved.userId, { limit, offset });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(result));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'profile_records_failed' }));
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
            const record = await appendPracticeRecord(resolved.userId, payload.record);
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ userId: resolved.userId, record }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'profile_record_save_failed' }));
          }
        });
      });

      server.middlewares.use('/api/profile/favorites', async (req, res, next) => {
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
            const sentence = (url.searchParams.get('sentence') || '').trim();
            const limit = Number(url.searchParams.get('limit') || 20);
            const offset = Number(url.searchParams.get('offset') || 0);
            const result = await listFavorites(resolved.userId, { sentence, limit, offset });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(result));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'profile_favorites_failed' }));
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
            const result = await upsertFavorite(resolved.userId, payload.favorite);
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ userId: resolved.userId, ...result }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'profile_favorite_save_failed' }));
          }
        });
      });

      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.method !== 'DELETE' || !req.url?.startsWith('/api/profile/favorites/')) return next();
        try {
          const url = new URL(req.url || '', 'http://local');
          const favoriteId = decodeURIComponent(url.pathname.replace(/^\/api\/profile\/favorites\//, ''));
          const resolved = await resolveRequestUserId(req, url.searchParams.get('userId'));
          if (!resolved) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'unauthorized' }));
          }
          const result = await removeFavorite(resolved.userId, favoriteId);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'profile_favorite_delete_failed' }));
        }
      });

      server.middlewares.use('/api/profile/mistakes', async (req, res, next) => {
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
            const limit = Number(url.searchParams.get('limit') || 20);
            const offset = Number(url.searchParams.get('offset') || 0);
            const result = await listMistakes(resolved.userId, { limit, offset });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(result));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'profile_mistakes_failed' }));
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
            await addMistakeWords(resolved.userId, payload.words);
            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ userId: resolved.userId, ok: true }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'profile_mistake_save_failed' }));
          }
        });
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
    edgeTtsPlugin(),
    deepseekExamplesPlugin(env),
    tsconfigPaths()
  ],
}
})
