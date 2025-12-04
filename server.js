import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Node 18+ has native fetch, but if using older node, might need polyfill.
// We assume Node 20 in Dockerfile, so global fetch is available.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 80;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'dist')));

// Youdao Proxy
const YOUDAO_APP_KEY = (process.env.YOUDAO_APP_KEY || '').trim();
const YOUDAO_APP_SECRET = (process.env.YOUDAO_APP_SECRET || '').trim();

app.post('/api/youdao/translate', async (req, res) => {
  try {
    const payload = req.body || {};
    const q = String(payload.q || '').trim();
    const from = String(payload.from || 'en');
    const to = String(payload.to || 'zh-CHS');
    const devKey = typeof payload.devKey === 'string' ? payload.devKey.trim() : '';
    const devSecret = typeof payload.devSecret === 'string' ? payload.devSecret.trim() : '';

    if (!q) {
      res.status(400).json({ error: 'q_required' });
      return;
    }

    const useKey = devKey || YOUDAO_APP_KEY;
    const useSecret = devSecret || YOUDAO_APP_SECRET;

    if (!useKey || !useSecret) {
      res.json({ translation: '', source: 'env_missing' });
      return;
    }

    const salt = crypto.randomUUID();
    const curtime = Math.floor(Date.now() / 1000).toString();
    const input = q.length > 20 ? `${q.slice(0, 10)}${q.length}${q.slice(-10)}` : q;
    const signStr = `${useKey}${input}${salt}${curtime}${useSecret}`;
    const sign = crypto.createHash('sha256').update(signStr).digest('hex');

    const params = new URLSearchParams({
      q,
      from,
      to,
      appKey: useKey,
      salt,
      sign,
      signType: 'v3',
      curtime,
      strict: 'true',
    });

    const resp = await fetch('https://openapi.youdao.com/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await resp.json();
    let translation = '';
    if (Array.isArray(data?.translation) && data.translation.length > 0) {
      translation = String(data.translation[0] || '');
    }

    res.json({ translation, raw: data, source: 'youdao' });
  } catch (error) {
    console.error('Youdao Proxy Error:', error);
    res.json({ translation: '', source: 'internal_error' });
  }
});

// Coze Proxy
const COZE_TOKEN = (process.env.COZE_TOKEN || '').trim();
const COZE_BASE_URL = (process.env.COZE_BASE_URL || 'https://api.coze.cn').trim();
const COZE_WORKFLOW_ID = (process.env.COZE_WORKFLOW_ID || '').trim();
const COZE_APP_ID = (process.env.COZE_APP_ID || '').trim();

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

    const useToken = devToken || COZE_TOKEN;
    if (!useToken || !COZE_WORKFLOW_ID || !COZE_APP_ID) {
      res.json({ sentences: [], source: 'env_missing' });
      return;
    }

    const url = `${COZE_BASE_URL}/v1/workflow/stream_run`;
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
        Authorization: `Bearer ${useToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: COZE_WORKFLOW_ID,
        app_id: COZE_APP_ID,
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
            app: COZE_APP_ID, 
            workflow: COZE_WORKFLOW_ID, 
            token_head: masked(useToken) 
        } 
    });

  } catch (error) {
    console.error('Coze Proxy Error:', error);
    res.json({ sentences: [], source: 'internal_error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
