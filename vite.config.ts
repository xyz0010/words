import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import type { Plugin } from 'vite';
import crypto from 'node:crypto';

function cozeExamplesPlugin(env: Record<string, string>): Plugin {
  const COZE_TOKEN = (env.COZE_TOKEN || '').trim();
  const COZE_BASE_URL = (env.COZE_BASE_URL || 'https://api.coze.cn').trim();
  const COZE_WORKFLOW_ID = (env.COZE_WORKFLOW_ID || '').trim();
  const COZE_APP_ID = (env.COZE_APP_ID || '').trim();
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
            const useToken = devToken || COZE_TOKEN;
            if (!useToken || !COZE_WORKFLOW_ID || !COZE_APP_ID) {
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
                  }).filter(s => s.sentence);
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
                  }).filter(s => s.sentence);
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
                  }).filter(s => s.sentence);
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
                  }).filter(s => s.sentence);
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
            return res.end(JSON.stringify({ sentences, source: 'coze', latestContent, raw, debug: { url, app: COZE_APP_ID, workflow: COZE_WORKFLOW_ID, token_head: masked(useToken) } }));
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
  const APP_KEY = (env.YOUDAO_APP_KEY || '').trim();
  const APP_SECRET = (env.YOUDAO_APP_SECRET || '').trim();
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
            const from = String(payload.from || 'en');
            const to = String(payload.to || 'zh-CHS');
            const devKey = typeof payload.devKey === 'string' ? payload.devKey.trim() : '';
            const devSecret = typeof payload.devSecret === 'string' ? payload.devSecret.trim() : '';
            if (!q) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: 'q_required' }));
            }
            const useKey = devKey || APP_KEY;
            const useSecret = devSecret || APP_SECRET;
            if (!useKey || !useSecret) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ translation: '', source: 'env_missing' }));
            }
            const salt = crypto.randomUUID();
            const curtime = Math.floor(Date.now() / 1000).toString();
            const input = q.length > 20 ? `${q.slice(0,10)}${q.length}${q.slice(-10)}` : q;
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
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ translation, raw: data, source: 'youdao' }));
          } catch {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ translation: '', source: 'internal_error' }));
          }
        });
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
    youdaoTranslatePlugin(env),
    cozeExamplesPlugin(env),
    tsconfigPaths()
  ],
}
})
