import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { resolveCozeAuthHeader, forceRefreshCozeToken } from './server/cozeOAuth.js';
import {
  createSession,
  extractBearerToken,
  getAuthDataFilePath,
  getUserByToken,
  loginUser,
  registerUser,
  revokeSession,
} from './server/authStore.js';
import {
  deleteWord,
  getWordbook,
  getWordbookDataFilePath,
  importWords,
  resolveUserId,
  upsertWord,
} from './server/wordbookStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envLocalPath = path.resolve(__dirname, '.env.local');
const envPath = path.resolve(__dirname, '.env');

dotenv.config({ path: envLocalPath });
dotenv.config({ path: envPath });

console.log('Environment variables loaded from:', envLocalPath, 'and', envPath);
console.log('COZE OAuth configured:', !!process.env.COZE_OAUTH_CLIENT_ID && !!process.env.COZE_OAUTH_KID);
console.log('COZE_TOKEN set:', !!process.env.COZE_TOKEN);
console.log('COZE_WORKFLOW_ID set:', !!process.env.COZE_WORKFLOW_ID);

// Node 18+ has native fetch, but if using older node, might need polyfill.
// We assume Node 20 in Dockerfile, so global fetch is available.

const app = express();
const PORT = process.env.PORT || 80;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'words-api',
    dataFile: getWordbookDataFilePath(),
    authFile: getAuthDataFilePath(),
  });
});

async function resolveRequestUserId(req, fallbackUserId) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return {
      userId: resolveUserId(fallbackUserId),
      authenticated: false,
    };
  }

  const user = await getUserByToken(token);
  if (!user) {
    return null;
  }

  return {
    userId: user.id,
    user,
    authenticated: true,
  };
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const user = await registerUser(req.body?.username, req.body?.password);
    const session = await createSession(user.id);
    res.status(201).json(session);
  } catch (error) {
    if (error instanceof Error && error.message === 'username_exists') {
      res.status(409).json({ error: 'username_exists' });
      return;
    }
    if (error instanceof Error && (error.message === 'invalid_username' || error.message === 'invalid_password')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Failed to register user:', error);
    res.status(400).json({ error: 'register_failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const user = await loginUser(req.body?.username, req.body?.password);
    const session = await createSession(user.id);
    res.json(session);
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_credentials') {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    console.error('Failed to login user:', error);
    res.status(400).json({ error: 'login_failed' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    const user = await getUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error('Failed to get current user:', error);
    res.status(401).json({ error: 'unauthorized' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (token) {
      await revokeSession(token);
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to logout:', error);
    res.status(400).json({ error: 'logout_failed' });
  }
});

app.get('/api/wordbook', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.query.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const result = await getWordbook(resolved.userId);
    res.json(result);
  } catch (error) {
    console.error('Failed to load wordbook:', error);
    res.status(500).json({ error: 'wordbook_load_failed' });
  }
});

app.post('/api/wordbook', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.body?.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const word = await upsertWord(resolved.userId, req.body?.word);
    res.status(201).json({ userId: resolved.userId, word });
  } catch (error) {
    console.error('Failed to save word:', error);
    res.status(400).json({ error: 'wordbook_save_failed' });
  }
});

app.post('/api/wordbook/import', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.body?.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const result = await importWords(resolved.userId, req.body?.words);
    res.status(201).json(result);
  } catch (error) {
    console.error('Failed to import wordbook:', error);
    res.status(400).json({ error: 'wordbook_import_failed' });
  }
});

app.delete('/api/wordbook/:word', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.query.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const word = decodeURIComponent(String(req.params.word || ''));
    const result = await deleteWord(resolved.userId, word);
    res.json(result);
  } catch (error) {
    console.error('Failed to delete word:', error);
    res.status(400).json({ error: 'wordbook_delete_failed' });
  }
});

function extractDictTranslation(data) {
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

function truncate(text) {
  if (text.length <= 20) return text;
  return `${text.slice(0, 10)}${text.length}${text.slice(-10)}`;
}

async function fetchSentenceTranslation(q) {
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
  return lines.flat().map(item => item?.tgt || '').join('').trim();
}

// Youdao Proxy
const YOUDAO_APP_KEY = (process.env.YOUDAO_APP_KEY || '').trim();
const YOUDAO_APP_SECRET = (process.env.YOUDAO_APP_SECRET || '').trim();

app.post('/api/youdao/translate', async (req, res) => {
  try {
    const payload = req.body || {};
    const q = String(payload.q || '').trim();
    const mode = String(payload.mode || 'translate').trim();

    if (!q) {
      res.status(400).json({ error: 'q_required' });
      return;
    }

    if (mode !== 'dict' && (!YOUDAO_APP_KEY || !YOUDAO_APP_SECRET)) {
      res.json({ translation: '', source: 'env_missing' });
      return;
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
        res.json({ translation: officialTranslation, raw: officialData, source: 'youdao_official' });
        return;
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

    let translation = extractDictTranslation(data);
    let source = 'youdao_web';

    if (!translation) {
      try {
        translation = await fetchSentenceTranslation(q);
        if (translation) source = 'youdao_sentence';
      } catch (fallbackError) {
        console.error('Sentence translation fallback failed:', fallbackError);
      }
    }

    res.json({ translation, raw: data, source });
  } catch (error) {
    console.error('Proxy Error:', error);
    res.json({ translation: '', source: 'internal_error' });
  }
});

// Coze Proxy
const COZE_BASE_URL = (process.env.COZE_BASE_URL || 'https://api.coze.cn').trim();
const COZE_WORKFLOW_ID = (process.env.COZE_WORKFLOW_ID || '7573516923795980294').trim();

app.post('/api/ai/examples', async (req, res) => {
  try {
    const payload = req.body || {};
    const word = String(payload.word || '').trim();
    const count = Number(payload.count || 5);
    const devToken = typeof payload.dev_token === 'string' ? payload.dev_token.trim() : '';
    const nonce = typeof payload.nonce === 'number' ? payload.nonce : Date.now();
    
    let hard = '';
    if (req.query && req.query.hard) {
        hard = String(req.query.hard).trim();
    }
    if (!hard && typeof payload.hard === 'string') {
      hard = payload.hard.trim();
    }

    if (!word) {
      res.status(400).json({ error: 'word_required' });
      return;
    }

    let auth = await resolveCozeAuthHeader({ env: process.env, devToken });
    if (!auth.token || !COZE_WORKFLOW_ID) {
      res.json({ sentences: [], source: 'env_missing' });
      return;
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

    // First request
    let resp = await fetch(url, {
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

    let raw = await resp.text();

    // Handle 4100: authentication invalid - auto refresh token and retry
    // Only retry if HTTP 401 status AND JSON response has code 4100
    if (resp.status === 401 && auth.source === 'coze_oauth' && !devToken) {
      let isAuthError = false;
      try {
        const errorJson = JSON.parse(raw);
        isAuthError = errorJson.code === 4100;
      } catch {}
      
      if (isAuthError) {
        console.log('Coze token invalid (4100), refreshing and retrying...');
        try {
          const newToken = await forceRefreshCozeToken(process.env);
          resp = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${newToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              workflow_id: COZE_WORKFLOW_ID,
              parameters: { input: prompt, nonce, hard },
            }),
          });
          raw = await resp.text();
        } catch (refreshError) {
          console.error('Failed to refresh token:', refreshError.message);
        }
      }
    }
    
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
          const idx = l.indexOf('content :');
          const part = l.slice(idx + 'content :'.length).trim();
          try {
             const obj = JSON.parse(part);
             if (obj?.output) latestContent = JSON.stringify(obj);
          } catch {}
        }
      } catch {}
    }

    let sentences = [];
    try {
        let outputStr;
        if (latestContent) {
            let outer = latestContent;
            if (typeof outer === 'string') {
                try { outer = JSON.parse(outer); } catch {}
            }
            if (outer && typeof outer === 'object' && typeof outer.output === 'string') {
                outputStr = outer.output;
            }
        } else {
             try {
                  const maybe = JSON.parse(raw);
                  if (maybe?.output && typeof maybe.output === 'string') {
                    outputStr = maybe.output;
                  } else if (maybe?.content) {
                    let outer2 = maybe.content;
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
            let inner;
            try {
                inner = JSON.parse(cleaned);
            } catch {
                const a = cleaned.indexOf('[');
                const b = cleaned.lastIndexOf(']');
                if (a !== -1 && b !== -1 && b > a) {
                   try { inner = JSON.parse(cleaned.slice(a, b + 1)); } catch {}
                }
                if (!inner) {
                   const c = cleaned.indexOf('{');
                   const d = cleaned.lastIndexOf('}');
                   if (c !== -1 && d !== -1 && d > c) {
                      try { inner = JSON.parse(cleaned.slice(c, d + 1)); } catch {}
                   }
                }
            }

            if (Array.isArray(inner)) {
                sentences = inner.map(it => {
                     if (typeof it === 'string') return { sentence: it };
                     if (it && typeof it === 'object') {
                         return { 
                             sentence: String(it.english || it.sentence || ''), 
                             translation: String(it.chinese || it.translation || '') 
                         };
                     }
                     return { sentence: '' };
                }).filter(s => s.sentence);
            } else if (inner && inner.sentences && Array.isArray(inner.sentences)) {
                sentences = inner.sentences.map(it => {
                     if (typeof it === 'string') return { sentence: it };
                     if (it && typeof it === 'object') {
                         return { 
                             sentence: String(it.english || it.sentence || ''), 
                             translation: String(it.chinese || it.translation || '') 
                         };
                     }
                     return { sentence: '' };
                }).filter(s => s.sentence);
            }
        }
    } catch (e) {
        console.error('Error parsing Coze response:', e);
    }
    
    const masked = (s) => (s.length > 12 ? `${s.slice(0,6)}...${s.slice(-6)}` : s);
    res.json({ 
        sentences, 
        source: 'coze', 
        latestContent, 
        raw, 
        debug: { 
            url, 
            workflow: COZE_WORKFLOW_ID, 
            token_source: auth.source,
            token_head: masked(auth.token) 
        } 
    });

  } catch (error) {
    console.error('Coze Proxy Error:', error);
    res.json({ sentences: [], source: 'internal_error' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
