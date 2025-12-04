const CACHE_KEY = 'ai_examples_cache_v1';

export type AiSentenceItem = { sentence: string; translation?: string };

function loadCache(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, string[]>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export async function fetchAiExamples(
  word: string,
  count = 10,
  devToken?: string,
  opts?: { force?: boolean; hard?: string }
): Promise<AiSentenceItem[]> {
  const key = word.toLowerCase();
  const cache = loadCache();
  if (!opts?.force && cache[key]?.length) return cache[key].slice(0, count).map(s => ({ sentence: s }));

  const url = opts?.hard ? `/api/ai/examples?hard=${encodeURIComponent(opts.hard)}` : '/api/ai/examples';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, count, dev_token: devToken, nonce: Date.now(), hard: opts?.hard }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || '请求失败');
  }
  const data = await res.json();
  const sentences: AiSentenceItem[] = Array.isArray(data?.sentences) ? data.sentences : [];
  const source: string | undefined = data?.source;
  const latestContent: string | undefined = data?.latestContent;
  const raw: string | undefined = data?.raw;
  const debug: any = data?.debug;
  if (!sentences.length) {
    if (raw) {
      try {
        // 便于排查，把关键原始内容打印到控制台
        // 不影响UI，仅帮助开发定位
        // eslint-disable-next-line no-console
        console.warn('AI raw response:', raw);
        if (debug) console.warn('AI debug:', debug);
      } catch {}
    }
    if (source === 'env_missing') {
      throw new Error('未配置AI环境变量，请在 .env.local 设置 COZE_TOKEN/COZE_APP_ID/COZE_WORKFLOW_ID');
    }
    if (source === 'internal_error') {
      throw new Error('代理内部错误，稍后重试或检查开发服务器日志');
    }
    if (source === 'coze_error') {
      throw new Error('AI服务返回错误，请检查 token 与 workflow/app 参数');
    }
    throw new Error('未获取到AI例句');
  }
  if (sentences.length) {
    cache[key] = sentences.map(s => s.sentence);
    saveCache(cache);
  }
  return sentences.slice(0, count);
}
