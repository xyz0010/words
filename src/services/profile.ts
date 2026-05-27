import { FavoriteSentence, MistakeStat, PracticeRecord, ProfileStats } from '../types/profile';
import { getAuthHeaders, getStoredToken } from './auth';

const DEFAULT_USER_ID = ((import.meta as any).env?.VITE_WORDS_USER_ID || 'demo-user').trim?.() || 'demo-user';
const API_BASE = ((import.meta as any).env?.VITE_WORDS_API_BASE || '').trim?.() || '';

function buildUrl(path: string) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

function getUserId() {
  return DEFAULT_USER_ID;
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`request_failed_${res.status}`);
  }
  return res.json();
}

export function getTodayLocalDate() {
  return localDateString();
}

export async function fetchProfileStats(date = getTodayLocalDate()) {
  const url = new URL(buildUrl('/api/profile/stats'), window.location.origin);
  url.searchParams.set('date', date);
  if (!getStoredToken()) {
    url.searchParams.set('userId', getUserId());
  }
  return parseJson<ProfileStats>(await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  }));
}

export async function fetchPracticeRecords(limit = 20, offset = 0) {
  const url = new URL(buildUrl('/api/profile/records'), window.location.origin);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (!getStoredToken()) {
    url.searchParams.set('userId', getUserId());
  }
  return parseJson<{ userId: string; records: PracticeRecord[]; total: number }>(await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  }));
}

export async function savePracticeRecord(record: {
  sentence: string;
  translation?: string;
  source: PracticeRecord['source'];
  word?: string;
  passageId?: string;
  scenario?: string;
  durationMs?: number;
  localDate?: string;
}) {
  const payload = {
    userId: getStoredToken() ? undefined : getUserId(),
    record: {
      ...record,
      localDate: record.localDate || getTodayLocalDate(),
    },
  };
  return parseJson<{ userId: string; record: PracticeRecord }>(await fetch(buildUrl('/api/profile/records'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  }));
}

export async function fetchFavorites(options?: { sentence?: string; limit?: number; offset?: number }) {
  const url = new URL(buildUrl('/api/profile/favorites'), window.location.origin);
  if (options?.sentence) {
    url.searchParams.set('sentence', options.sentence);
  }
  url.searchParams.set('limit', String(options?.limit ?? 20));
  url.searchParams.set('offset', String(options?.offset ?? 0));
  if (!getStoredToken()) {
    url.searchParams.set('userId', getUserId());
  }
  return parseJson<{ userId: string; favorites: FavoriteSentence[]; total: number }>(await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  }));
}

export async function saveFavorite(favorite: {
  sentence: string;
  translation?: string;
  source: FavoriteSentence['source'];
  word?: string;
  passageId?: string;
  scenario?: string;
}) {
  const payload = {
    userId: getStoredToken() ? undefined : getUserId(),
    favorite,
  };
  return parseJson<{ userId: string; favorite: FavoriteSentence; existed: boolean }>(await fetch(buildUrl('/api/profile/favorites'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  }));
}

export async function deleteFavorite(id: string) {
  const url = new URL(buildUrl(`/api/profile/favorites/${encodeURIComponent(id)}`), window.location.origin);
  if (!getStoredToken()) {
    url.searchParams.set('userId', getUserId());
  }
  return parseJson<{ userId: string; favorites: FavoriteSentence[]; total?: number }>(await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  }));
}

export async function fetchMistakes(limit = 20, offset = 0) {
  const url = new URL(buildUrl('/api/profile/mistakes'), window.location.origin);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  if (!getStoredToken()) {
    url.searchParams.set('userId', getUserId());
  }
  return parseJson<{ userId: string; mistakes: MistakeStat[]; total: number }>(await fetch(url.toString(), {
    method: 'GET',
    headers: {
      ...getAuthHeaders(),
    },
  }));
}

export async function reportMistakes(words: string[]) {
  const payload = {
    userId: getStoredToken() ? undefined : getUserId(),
    words,
  };
  return parseJson<{ userId: string; ok: boolean }>(await fetch(buildUrl('/api/profile/mistakes'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  }));
}
