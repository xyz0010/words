async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractLatestContent(raw) {
  let latestContent = '';
  const lines = String(raw || '').split('\n');
  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;
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
        const obj = JSON.parse(part);
        if (obj?.output) latestContent = JSON.stringify(obj);
      }
    } catch {}
  }
  return latestContent;
}

function parseSentences(raw, latestContent, count) {
  try {
    let outputStr;
    if (latestContent) {
      let outer = latestContent;
      if (typeof outer === 'string') {
        try {
          outer = JSON.parse(outer);
        } catch {}
      }
      if (outer && typeof outer === 'object' && typeof outer.output === 'string') {
        outputStr = outer.output;
      }
    } else {
      try {
        const maybe = JSON.parse(raw);
        if (maybe?.output && typeof maybe.output === 'string') outputStr = maybe.output;
        if (!outputStr && maybe?.content) {
          let outer2 = maybe.content;
          if (typeof outer2 === 'string') {
            try {
              outer2 = JSON.parse(outer2);
            } catch {}
          }
          if (outer2?.output && typeof outer2.output === 'string') outputStr = outer2.output;
        }
      } catch {}
    }
    if (!outputStr) return [];
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
        try {
          inner = JSON.parse(cleaned.slice(a, b + 1));
        } catch {}
      }
      if (!inner) {
        const c = cleaned.indexOf('{');
        const d = cleaned.lastIndexOf('}');
        if (c !== -1 && d !== -1 && d > c) {
          try {
            inner = JSON.parse(cleaned.slice(c, d + 1));
          } catch {}
        }
      }
    }
    const normalize = (arr) =>
      arr
        .slice(0, count)
        .map((it) => {
          if (typeof it === 'string') return { sentence: it };
          if (!it || typeof it !== 'object') return { sentence: '' };
          const eng = String(it.english ?? it.en ?? it.sentence ?? '');
          const zh = it.chinese ?? it.zh ?? it.cn ?? it.translation ?? '';
          return { sentence: eng, translation: typeof zh === 'string' ? zh : '' };
        })
        .filter((s) => s.sentence);
    if (Array.isArray(inner)) return normalize(inner);
    if (inner && typeof inner === 'object' && Array.isArray(inner.sentences)) return normalize(inner.sentences);
    if (inner && typeof inner === 'object' && Array.isArray(inner.data)) return normalize(inner.data);
    if (inner && typeof inner === 'object' && Array.isArray(inner.example_sentences)) return normalize(inner.example_sentences);
    if (inner && typeof inner === 'object' && (inner.english || inner.chinese)) {
      const one = { sentence: String(inner.english || ''), translation: typeof inner.chinese === 'string' ? inner.chinese : '' };
      return one.sentence ? [one] : [];
    }
    if (typeof inner === 'string') return [{ sentence: inner }];
    return [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const payload = await readJsonBody(req);
    const word = String(payload.word || '').trim();
    const count = Number(payload.count || 5);
    const devToken = typeof payload.dev_token === 'string' ? payload.dev_token.trim() : '';
    const nonce = typeof payload.nonce === 'number' ? payload.nonce : Date.now();
    const hard = typeof payload.hard === 'string' ? payload.hard.trim() : '';
    if (!word) {
      res.status(400).json({ error: 'word_required' });
      return;
    }
    const COZE_TOKEN = (process.env.COZE_TOKEN || '').trim();
    const COZE_BASE_URL = (process.env.COZE_BASE_URL || 'https://api.coze.cn').trim();
    const COZE_WORKFLOW_ID = (process.env.COZE_WORKFLOW_ID || '').trim();
    const useToken = devToken || COZE_TOKEN;
    if (!useToken || !COZE_WORKFLOW_ID) {
      res.status(200).json({ sentences: [], source: 'env_missing' });
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
        parameters: { input: prompt, nonce, hard },
      }),
    });
    const raw = await resp.text();
    const latestContent = extractLatestContent(raw);
    const sentences = parseSentences(raw, latestContent, count);
    const masked = (s) => (s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-6)}` : s);
    res.status(200).json({
      sentences,
      source: 'coze',
      latestContent,
      raw,
      debug: {
        url,
        workflow: COZE_WORKFLOW_ID,
        token_head: masked(useToken),
        status: resp.status,
        statusText: resp.statusText,
      },
    });
  } catch {
    res.status(200).json({ sentences: [], source: 'internal_error' });
  }
}
