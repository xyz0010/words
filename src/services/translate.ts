const CACHE_KEY = 'wordbook_translations_cache';

type CacheMap = Record<string, string>;

function loadCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache: CacheMap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export async function translateToChinese(text: string): Promise<string> {
  const cache = loadCache();
  const key = text.trim().toLowerCase();
  if (cache[key]) return cache[key];

  try {
    const devKey = typeof window !== 'undefined' ? (localStorage.getItem('YOUDAO_DEV_KEY') || '') : '';
    const devSecret = typeof window !== 'undefined' ? (localStorage.getItem('YOUDAO_DEV_SECRET') || '') : '';
    const res = await fetch('/api/youdao/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, from: 'en', to: 'zh-CHS', devKey, devSecret }),
    });
    if (!res.ok) throw new Error('translate failed');
    const data = await res.json();
    const translated: string = typeof data?.translation === 'string' && data.translation ? data.translation : text;
    cache[key] = translated;
    saveCache(cache);
    return translated;
  } catch {
    return text;
  }
}

