import { WordDefinition } from '../types/word';
import { getAuthHeaders, getStoredToken } from './auth';

export const LEGACY_WORD_STORAGE_KEY = 'wordbook_words';
const DEFAULT_USER_ID = ((import.meta as any).env?.VITE_WORDS_USER_ID || 'demo-user').trim?.() || 'demo-user';
const API_BASE = ((import.meta as any).env?.VITE_WORDS_API_BASE || '').trim?.() || '';

function buildUrl(path: string) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

function getUserId() {
  return DEFAULT_USER_ID;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`request_failed_${res.status}`);
  }
  return res.json();
}

export async function fetchWordbookWords() {
  const url = new URL(buildUrl('/api/wordbook'), window.location.origin);
  if (!getStoredToken()) {
    url.searchParams.set('userId', getUserId());
  }
  const data = await parseJson<{ words: WordDefinition[] }>(await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  }));
  return data.words || [];
}

export async function saveWordToWordbook(word: WordDefinition) {
  const data = await parseJson<{ word: WordDefinition }>(
    await fetch(buildUrl('/api/wordbook'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ userId: getStoredToken() ? undefined : getUserId(), word }),
    })
  );
  return data.word;
}

export async function removeWordFromWordbook(word: string) {
  const url = new URL(buildUrl(`/api/wordbook/${encodeURIComponent(word)}`), window.location.origin);
  if (!getStoredToken()) {
    url.searchParams.set('userId', getUserId());
  }
  await parseJson(await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  }));
}

export async function importLegacyWordbook(words: WordDefinition[]) {
  if (!words.length) return [];
  const data = await parseJson<{ words: WordDefinition[] }>(
    await fetch(buildUrl('/api/wordbook/import'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ userId: getStoredToken() ? undefined : getUserId(), words }),
    })
  );
  return data.words || [];
}
