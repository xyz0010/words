import crypto from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const DATA_DIR = process.env.WORDS_DATA_DIR
  ? path.resolve(process.env.WORDS_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

function createEmptyStore() {
  return {
    users: {},
    usernameIndex: {},
    sessions: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUsername(value) {
  return normalizeString(value).toLowerCase();
}

function validateCredentials(username, password) {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = normalizeString(password);

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(normalizedUsername)) {
    throw new Error('invalid_username');
  }

  if (normalizedPassword.length < 6 || normalizedPassword.length > 64) {
    throw new Error('invalid_password');
  }

  return {
    username: normalizedUsername,
    password: normalizedPassword,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hashed] = String(storedHash || '').split(':');
  if (!salt || !hashed) return false;
  const currentHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const left = Buffer.from(hashed, 'hex');
  const right = Buffer.from(currentHash, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
  };
}

async function ensureStoreFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(AUTH_FILE, 'utf8');
  } catch {
    await writeFile(AUTH_FILE, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStoreFile();
  try {
    const raw = await readFile(AUTH_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.users !== 'object' ||
      typeof parsed.usernameIndex !== 'object' ||
      typeof parsed.sessions !== 'object'
    ) {
      return createEmptyStore();
    }
    return parsed;
  } catch {
    return createEmptyStore();
  }
}

async function writeStore(store) {
  await ensureStoreFile();
  await writeFile(
    AUTH_FILE,
    JSON.stringify({ ...store, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

export async function registerUser(usernameInput, passwordInput) {
  const { username, password } = validateCredentials(usernameInput, passwordInput);
  const store = await readStore();

  if (store.usernameIndex[username]) {
    throw new Error('username_exists');
  }

  const id = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const user = {
    id,
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  store.users[id] = user;
  store.usernameIndex[username] = id;
  await writeStore(store);
  return publicUser(user);
}

export async function loginUser(usernameInput, passwordInput) {
  const username = normalizeUsername(usernameInput);
  const password = normalizeString(passwordInput);
  const store = await readStore();
  const userId = store.usernameIndex[username];
  const user = userId ? store.users[userId] : null;

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('invalid_credentials');
  }

  return publicUser(user);
}

export async function createSession(userId) {
  const store = await readStore();
  const user = store.users[userId];
  if (!user) {
    throw new Error('user_not_found');
  }

  const token = crypto.randomBytes(32).toString('hex');
  store.sessions[token] = {
    userId,
    createdAt: new Date().toISOString(),
  };
  await writeStore(store);
  return {
    token,
    user: publicUser(user),
  };
}

export async function getUserByToken(tokenInput) {
  const token = normalizeString(tokenInput);
  if (!token) return null;

  const store = await readStore();
  const session = store.sessions[token];
  if (!session?.userId) return null;

  return publicUser(store.users[session.userId]);
}

export async function revokeSession(tokenInput) {
  const token = normalizeString(tokenInput);
  if (!token) return;

  const store = await readStore();
  delete store.sessions[token];
  await writeStore(store);
}

export function extractBearerToken(headerValue) {
  const value = normalizeString(headerValue);
  if (!value.toLowerCase().startsWith('bearer ')) return '';
  return value.slice(7).trim();
}

export function getAuthDataFilePath() {
  return AUTH_FILE;
}
