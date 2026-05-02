import { AuthUser } from '../types/auth';

const API_BASE = ((import.meta as any).env?.VITE_WORDS_API_BASE || '').trim?.() || '';
const TOKEN_STORAGE_KEY = 'words_auth_token';
const USER_STORAGE_KEY = 'words_auth_user';

function buildUrl(path: string) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorCode = typeof data?.error === 'string' ? data.error : `request_failed_${res.status}`;
    throw new Error(errorCode);
  }
  return data;
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistAuth(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function getAuthHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function registerWithPassword(username: string, password: string) {
  return parseJson<{ token: string; user: AuthUser }>(
    await fetch(buildUrl('/api/auth/register'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })
  );
}

export async function loginWithPassword(username: string, password: string) {
  return parseJson<{ token: string; user: AuthUser }>(
    await fetch(buildUrl('/api/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })
  );
}

export async function fetchCurrentUser() {
  return parseJson<{ user: AuthUser }>(
    await fetch(buildUrl('/api/auth/me'), {
      method: 'GET',
      headers: {
        ...getAuthHeaders(),
      },
    })
  );
}

export async function logoutFromServer() {
  const token = getStoredToken();
  if (!token) return;

  await fetch(buildUrl('/api/auth/logout'), {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
  }).catch(() => undefined);
}
