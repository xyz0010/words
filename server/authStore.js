import crypto from 'crypto';
import { getDb, getDbFilePath } from './db.js';

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

export async function registerUser(usernameInput, passwordInput) {
  const { username, password } = validateCredentials(usernameInput, passwordInput);
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists?.id) {
    throw new Error('username_exists');
  }

  const id = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, username, hashPassword(password), createdAt);
  return publicUser({
    id,
    username,
    createdAt,
  });
}

export async function loginUser(usernameInput, passwordInput) {
  const username = normalizeUsername(usernameInput);
  const password = normalizeString(passwordInput);
  const db = getDb();
  const user = db.prepare(
    `SELECT id, username, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE username = ?`
  ).get(username);

  if (!user?.id || !verifyPassword(password, user.passwordHash)) {
    throw new Error('invalid_credentials');
  }

  return publicUser(user);
}

export async function createSession(userId) {
  const db = getDb();
  const user = db
    .prepare(`SELECT id, username, created_at AS createdAt FROM users WHERE id = ?`)
    .get(userId);
  if (!user?.id) {
    throw new Error('user_not_found');
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`).run(
    token,
    userId,
    new Date().toISOString()
  );
  return {
    token,
    user: publicUser(user),
  };
}

export async function getUserByToken(tokenInput) {
  const token = normalizeString(tokenInput);
  if (!token) return null;

  const db = getDb();
  const user = db
    .prepare(`
      SELECT u.id, u.username, u.created_at AS createdAt
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `)
    .get(token);
  return publicUser(user);
}

export async function revokeSession(tokenInput) {
  const token = normalizeString(tokenInput);
  if (!token) return;

  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function extractBearerToken(headerValue) {
  const value = normalizeString(headerValue);
  if (!value.toLowerCase().startsWith('bearer ')) return '';
  return value.slice(7).trim();
}

export function getAuthDataFilePath() {
  return getDbFilePath();
}
