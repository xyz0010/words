import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
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
import {
  appendPracticeRecord,
  addMistakeWords,
  getProfileDataFilePath,
  getProfileStats,
  listFavorites,
  listMistakes,
  listPracticeRecords,
  removeFavorite,
  upsertFavorite,
} from './server/profileStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envLocalPath = path.resolve(__dirname, '.env.local');
const envPath = path.resolve(__dirname, '.env');

dotenv.config({ path: envLocalPath });
dotenv.config({ path: envPath });

console.log('Environment variables loaded from:', envLocalPath, 'and', envPath);
console.log('DEEPSEEK_API_KEY set:', !!process.env.DEEPSEEK_API_KEY);
console.log('DEEPSEEK_MODEL set:', !!process.env.DEEPSEEK_MODEL);

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
    profileFile: getProfileDataFilePath(),
  });
});

// Edge TTS API - synthesize speech and return audio stream
// Query params: text (required), voice (optional, default: en-US-AriaNeural)
app.get('/api/tts', async (req, res) => {
  const { text, voice = 'en-US-AriaNeural' } = req.query;

  if (!text || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  // Sanitize text - remove any potentially harmful characters
  const sanitizedText = text.trim().slice(0, 1000); // Limit to 1000 chars

  try {
    const tts = new MsEdgeTTS();
    
    // Use MP3 format for better browser compatibility
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // Collect audio data from stream
    const chunks = [];
    const { audioStream } = tts.toStream(sanitizedText);

    await new Promise((resolve, reject) => {
      audioStream.on('data', (chunk) => chunks.push(chunk));
      audioStream.on('end', () => resolve());
      audioStream.on('error', (err) => reject(err));
    });

    const audioBuffer = Buffer.concat(chunks);

    // Set appropriate headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.setHeader('X-Voice', voice);

    res.send(audioBuffer);
  } catch (error) {
    console.error('Edge TTS error:', error);
    res.status(500).json({ error: 'TTS synthesis failed' });
  }
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

app.get('/api/profile/stats', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.query.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const today = typeof req.query.date === 'string' ? req.query.date : '';
    const stats = await getProfileStats(resolved.userId, { today });
    res.json(stats);
  } catch (error) {
    console.error('Failed to load profile stats:', error);
    res.status(500).json({ error: 'profile_stats_failed' });
  }
});

app.get('/api/profile/records', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.query.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    const result = await listPracticeRecords(resolved.userId, { limit, offset });
    res.json(result);
  } catch (error) {
    console.error('Failed to load profile records:', error);
    res.status(500).json({ error: 'profile_records_failed' });
  }
});

app.post('/api/profile/records', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.body?.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const record = await appendPracticeRecord(resolved.userId, req.body?.record);
    res.status(201).json({ userId: resolved.userId, record });
  } catch (error) {
    console.error('Failed to save profile record:', error);
    res.status(400).json({ error: 'profile_record_save_failed' });
  }
});

app.get('/api/profile/favorites', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.query.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const sentence = typeof req.query.sentence === 'string' ? req.query.sentence : '';
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    const result = await listFavorites(resolved.userId, { sentence, limit, offset });
    res.json(result);
  } catch (error) {
    console.error('Failed to load favorites:', error);
    res.status(500).json({ error: 'profile_favorites_failed' });
  }
});

app.post('/api/profile/favorites', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.body?.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const result = await upsertFavorite(resolved.userId, req.body?.favorite);
    res.status(201).json({ userId: resolved.userId, ...result });
  } catch (error) {
    console.error('Failed to save favorite:', error);
    res.status(400).json({ error: 'profile_favorite_save_failed' });
  }
});

app.delete('/api/profile/favorites/:id', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.query.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const id = decodeURIComponent(String(req.params.id || ''));
    const result = await removeFavorite(resolved.userId, id);
    res.json(result);
  } catch (error) {
    console.error('Failed to delete favorite:', error);
    res.status(400).json({ error: 'profile_favorite_delete_failed' });
  }
});

app.get('/api/profile/mistakes', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.query.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const limit = Number(req.query.limit || 20);
    const offset = Number(req.query.offset || 0);
    const result = await listMistakes(resolved.userId, { limit, offset });
    res.json(result);
  } catch (error) {
    console.error('Failed to load mistakes:', error);
    res.status(500).json({ error: 'profile_mistakes_failed' });
  }
});

app.post('/api/profile/mistakes', async (req, res) => {
  try {
    const resolved = await resolveRequestUserId(req, req.body?.userId);
    if (!resolved) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    await addMistakeWords(resolved.userId, req.body?.words);
    res.status(201).json({ userId: resolved.userId, ok: true });
  } catch (error) {
    console.error('Failed to save mistake words:', error);
    res.status(400).json({ error: 'profile_mistake_save_failed' });
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

function parseAiSentences(content, count) {
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
}

function buildExampleMessages(word, _count, hard) {
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

// DeepSeek Proxy
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').trim();
const DEEPSEEK_MODEL = (process.env.DEEPSEEK_MODEL || 'deepseek-chat').trim();

app.post('/api/ai/examples', async (req, res) => {
  try {
    const payload = req.body || {};
    const word = String(payload.word || '').trim();
    const count = Math.max(1, Math.min(10, Number(payload.count || 5)));
    const devToken = typeof payload.dev_token === 'string' ? payload.dev_token.trim() : '';
    
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

    const apiKey = devToken || (process.env.DEEPSEEK_API_KEY || '').trim();
    if (!apiKey) {
      res.json({ sentences: [], source: 'env_missing' });
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
    } catch (e) {
      console.error('Error parsing DeepSeek response:', e);
    }
    
    const sentences = parseAiSentences(latestContent, count);
    const masked = (s) => (s.length > 12 ? `${s.slice(0,6)}...${s.slice(-6)}` : s);
    res.json({ 
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
    });

  } catch (error) {
    console.error('DeepSeek Proxy Error:', error);
    res.json({ sentences: [], source: 'internal_error' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
