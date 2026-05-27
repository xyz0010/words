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

function isValidChineseTranslation(source: string, translated: string): boolean {
  const normalizedSource = source.trim();
  const normalizedTranslated = translated.trim();
  if (!normalizedTranslated) return false;
  if (normalizedTranslated === normalizedSource) return false;
  return /[\u4e00-\u9fff]/.test(normalizedTranslated);
}

export interface TranslateResult {
  translation: string;
  source?: string;
}

export async function translateToChineseDetailed(text: string): Promise<TranslateResult> {
  const cache = loadCache();
  const key = text.trim().toLowerCase();
  if (cache[key]) {
    if (isValidChineseTranslation(text, cache[key])) {
      return { translation: cache[key], source: 'cache' };
    }

    delete cache[key];
    saveCache(cache);
  }

  try {
    const res = await fetch('/api/youdao/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, from: 'en', to: 'zh-CHS' }),
    });
    if (!res.ok) throw new Error('translate failed');
    const data = await res.json();
    const translated = typeof data?.translation === 'string' ? data.translation.trim() : '';
    const source = typeof data?.source === 'string' ? data.source : undefined;

    if (isValidChineseTranslation(text, translated)) {
      cache[key] = translated;
      saveCache(cache);
      return { translation: translated, source };
    }

    return { translation: text, source };
  } catch {
    return { translation: text, source: 'request_failed' };
  }
}

export async function translateToChinese(text: string): Promise<string> {
  const result = await translateToChineseDetailed(text);
  return result.translation;
}
