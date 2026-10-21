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

function extractJsonPayload(text) {
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

function parseSentences(content, count) {
  try {
    const parsed = extractJsonPayload(content);
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
  } catch {
    return [];
  }
}

function buildMessages(word, _count, hard) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const word = String(payload.word || '').trim();
    const count = Math.max(1, Math.min(10, Number(payload.count || 5)));
    const hard = typeof payload.hard === 'string' ? payload.hard.trim() : '';
    const devToken = typeof payload.dev_token === 'string' ? payload.dev_token.trim() : '';

    if (!word) {
      res.status(400).json({ error: 'word_required' });
      return;
    }

    const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim();
    const DEEPSEEK_MODEL = (process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim();
    const apiKey = devToken || (process.env.DEEPSEEK_API_KEY || '').trim();

    if (!apiKey) {
      res.status(200).json({ sentences: [], source: 'env_missing' });
      return;
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
        messages: buildMessages(word, count, hard),
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

    const sentences = parseSentences(latestContent, count);
    const masked = (s) => (s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-6)}` : s);

    res.status(200).json({
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
        statusText: resp.statusText,
      },
    });
  } catch {
    res.status(200).json({ sentences: [], source: 'internal_error' });
  }
}
