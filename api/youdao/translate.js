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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    const payload = await readJsonBody(req);
    const q = String(payload.q || '').trim();
    if (!q) {
      res.status(400).json({ error: 'q_required' });
      return;
    }
    const apiUrl = `http://dict.youdao.com/jsonapi?q=${encodeURIComponent(q)}`;
    const resp = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const data = await resp.json();
    let translation = '';
    const trs = data.ec?.word?.[0]?.trs?.[0]?.tr?.[0]?.l?.i?.[0];
    if (trs) translation = trs;
    if (!translation && data.web_trans?.['web-translation']?.[0]?.trans?.[0]?.value) {
      translation = data.web_trans['web-translation'][0].trans[0].value;
    }
    if (!translation && data.fanyi?.tran) {
      translation = data.fanyi.tran;
    }
    res.status(200).json({ translation, raw: data, source: 'youdao_web' });
  } catch {
    res.status(200).json({ translation: '', source: 'internal_error' });
  }
}
