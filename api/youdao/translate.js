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

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function truncate(text) {
  if (text.length <= 20) return text;
  return `${text.slice(0, 10)}${text.length}${text.slice(-10)}`;
}

function extractDictTranslation(data) {
  let translation = '';
  const trs = data.ec?.word?.[0]?.trs?.[0]?.tr?.[0]?.l?.i?.[0];
  if (trs) translation = trs;
  if (!translation && data.web_trans?.['web-translation']?.[0]?.trans?.[0]?.value) {
    translation = data.web_trans['web-translation'][0].trans[0].value;
  }
  if (!translation && data.fanyi?.tran) {
    translation = data.fanyi.tran;
  }
  return translation;
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
  return lines.flat().map((item) => item?.tgt || '').join('').trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const payload = await readJsonBody(req);
    const q = String(payload.q || '').trim();
    const mode = String(payload.mode || 'translate').trim();
    const appKey = String(process.env.YOUDAO_APP_KEY || '').trim();
    const appSecret = String(process.env.YOUDAO_APP_SECRET || '').trim();
    if (!q) {
      res.status(400).json({ error: 'q_required' });
      return;
    }
    if (mode !== 'dict' && (!appKey || !appSecret)) {
      res.status(200).json({ translation: '', source: 'env_missing' });
      return;
    }

    if (mode !== 'dict') {
      const salt = `${Date.now()}`;
      const curtime = `${Math.floor(Date.now() / 1000)}`;
      const sign = await sha256(`${appKey}${truncate(q)}${salt}${curtime}${appSecret}`);

      const officialResp = await fetch('https://openapi.youdao.com/api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          q,
          from: 'en',
          to: 'zh-CHS',
          appKey,
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
        res.status(200).json({ translation: officialTranslation, raw: officialData, source: 'youdao_official' });
        return;
      }
    }

    const apiUrl = `http://dict.youdao.com/jsonapi?q=${encodeURIComponent(q)}`;
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const data = await resp.json();
    let translation = extractDictTranslation(data);
    let source = 'youdao_web';

    if (!translation) {
      try {
        translation = await fetchSentenceTranslation(q);
        if (translation) source = 'youdao_sentence';
      } catch {
        // ignore fallback failures and keep empty translation
      }
    }

    res.status(200).json({ translation, raw: data, source });
  } catch {
    res.status(200).json({ translation: '', source: 'internal_error' });
  }
}
