import crypto from 'crypto';
import { getDb, getDbFilePath } from './db.js';

const DEFAULT_USER_ID = (process.env.DEFAULT_WORDS_USER_ID || 'demo-user').trim() || 'demo-user';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveUserId(inputUserId) {
  return normalizeString(inputUserId) || DEFAULT_USER_ID;
}

function normalizeSource(value) {
  const v = normalizeString(value);
  if (v === 'ai' || v === 'passage') return v;
  return 'ai';
}

function sanitizeLocalDate(value) {
  const v = normalizeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  return v;
}

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sanitizeRecord(record) {
  const sentence = normalizeString(record?.sentence);
  if (!sentence) return null;

  const localDate = sanitizeLocalDate(record?.localDate) || formatLocalDate();
  const translation = normalizeString(record?.translation) || undefined;
  const word = normalizeString(record?.word) || undefined;
  const passageId = normalizeString(record?.passageId) || undefined;
  const scenario = normalizeString(record?.scenario) || undefined;
  const durationMs = Number(record?.durationMs);

  return {
    id: crypto.randomUUID(),
    sentence,
    translation,
    source: normalizeSource(record?.source),
    word,
    passageId,
    scenario,
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined,
    localDate,
    completedAt: new Date().toISOString(),
  };
}

function sanitizeFavorite(favorite) {
  const sentence = normalizeString(favorite?.sentence);
  if (!sentence) return null;

  const translation = normalizeString(favorite?.translation) || undefined;
  const word = normalizeString(favorite?.word) || undefined;
  const passageId = normalizeString(favorite?.passageId) || undefined;
  const scenario = normalizeString(favorite?.scenario) || undefined;

  return {
    id: crypto.randomUUID(),
    sentence,
    translation,
    source: normalizeSource(favorite?.source),
    word,
    passageId,
    scenario,
    createdAt: new Date().toISOString(),
  };
}

function sanitizeMistakeWords(wordsInput) {
  if (!Array.isArray(wordsInput)) return [];
  const out = [];
  for (const item of wordsInput) {
    const w = normalizeString(item);
    if (!w) continue;
    if (w.length > 50) continue;
    out.push(w);
    if (out.length >= 50) break;
  }
  return out;
}

function uniqueSortedLocalDates(records) {
  const set = new Set();
  for (const item of records) {
    const d = sanitizeLocalDate(item?.localDate);
    if (d) set.add(d);
  }
  return Array.from(set).sort();
}

function computeStreakDays(localDatesSortedAsc, todayLocalDate) {
  if (!localDatesSortedAsc.length) return 0;
  const set = new Set(localDatesSortedAsc);
  const today = sanitizeLocalDate(todayLocalDate) || formatLocalDate();
  let streak = 0;

  const toDate = (d) => {
    const [y, m, day] = d.split('-').map((x) => Number(x));
    return new Date(y, m - 1, day);
  };

  let cursor = toDate(today);
  while (true) {
    const key = formatLocalDate(cursor);
    if (!set.has(key)) break;
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

export async function appendPracticeRecord(userIdInput, recordInput) {
  const userId = resolveUserId(userIdInput);
  const record = sanitizeRecord(recordInput);
  if (!record) {
    throw new Error('invalid_record_payload');
  }

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO profile_records
       (id, user_id, sentence, translation, source, word, passage_id, scenario, duration_ms, local_date, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      userId,
      record.sentence,
      record.translation || null,
      record.source,
      record.word || null,
      record.passageId || null,
      record.scenario || null,
      record.durationMs || null,
      record.localDate,
      record.completedAt
    );
    db.prepare(
      `DELETE FROM profile_records
       WHERE user_id = ?
         AND id NOT IN (
           SELECT id FROM profile_records
           WHERE user_id = ?
           ORDER BY completed_at DESC
           LIMIT 5000
         )`
    ).run(userId, userId);
  });
  tx();
  return record;
}

export async function listPracticeRecords(userIdInput, options = {}) {
  const userId = resolveUserId(userIdInput);
  const db = getDb();
  const limit = Math.max(1, Math.min(200, Number(options.limit || 20)));
  const offset = Math.max(0, Number(options.offset || 0));
  const records = db
    .prepare(
      `SELECT
         id,
         sentence,
         translation,
         source,
         word,
         passage_id AS passageId,
         scenario,
         duration_ms AS durationMs,
         local_date AS localDate,
         completed_at AS completedAt
       FROM profile_records
       WHERE user_id = ?
       ORDER BY completed_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset);
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM profile_records WHERE user_id = ?`)
    .get(userId);
  return {
    userId,
    records,
    total: Number(totalRow?.total || 0),
  };
}

export async function listFavorites(userIdInput, options = {}) {
  const userId = resolveUserId(userIdInput);
  const sentence = normalizeString(options.sentence);
  const db = getDb();
  const limit = Math.max(1, Math.min(200, Number(options.limit || 20)));
  const offset = Math.max(0, Number(options.offset || 0));
  if (!sentence) {
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM profile_favorites WHERE user_id = ?`)
      .get(userId);
    const favorites = db
      .prepare(
        `SELECT
           id,
           sentence,
           translation,
           source,
           word,
           passage_id AS passageId,
           scenario,
           created_at AS createdAt
         FROM profile_favorites
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId, limit, offset);
    return { userId, favorites, total: Number(totalRow?.total || 0) };
  }
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM profile_favorites WHERE user_id = ? AND sentence_key = ?`)
    .get(userId, sentence.toLowerCase());
  return {
    userId,
    favorites: db
      .prepare(
        `SELECT
           id,
           sentence,
           translation,
           source,
           word,
           passage_id AS passageId,
           scenario,
           created_at AS createdAt
         FROM profile_favorites
         WHERE user_id = ? AND sentence_key = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(userId, sentence.toLowerCase(), limit, offset),
    total: Number(totalRow?.total || 0),
  };
}

export async function upsertFavorite(userIdInput, favoriteInput) {
  const userId = resolveUserId(userIdInput);
  const favorite = sanitizeFavorite(favoriteInput);
  if (!favorite) {
    throw new Error('invalid_favorite_payload');
  }

  const db = getDb();
  const sentenceKey = favorite.sentence.toLowerCase();
  const existing = db
    .prepare(
      `SELECT
         id,
         sentence,
         translation,
         source,
         word,
         passage_id AS passageId,
         scenario,
         created_at AS createdAt
       FROM profile_favorites
       WHERE user_id = ? AND sentence_key = ?`
    )
    .get(userId, sentenceKey);
  if (existing?.id) {
    return { favorite: existing, existed: true };
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO profile_favorites
       (id, user_id, sentence_key, sentence, translation, source, word, passage_id, scenario, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      favorite.id,
      userId,
      sentenceKey,
      favorite.sentence,
      favorite.translation || null,
      favorite.source,
      favorite.word || null,
      favorite.passageId || null,
      favorite.scenario || null,
      favorite.createdAt
    );
    db.prepare(
      `DELETE FROM profile_favorites
       WHERE user_id = ?
         AND id NOT IN (
           SELECT id FROM profile_favorites
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT 2000
         )`
    ).run(userId, userId);
  });
  tx();
  return { favorite, existed: false };
}

export async function removeFavorite(userIdInput, favoriteIdInput) {
  const userId = resolveUserId(userIdInput);
  const favoriteId = normalizeString(favoriteIdInput);
  if (!favoriteId) {
    throw new Error('invalid_favorite_id');
  }

  const db = getDb();
  db.prepare(`DELETE FROM profile_favorites WHERE user_id = ? AND id = ?`).run(userId, favoriteId);
  return listFavorites(userId);
}

export async function getProfileStats(userIdInput, options = {}) {
  const userId = resolveUserId(userIdInput);
  const db = getDb();
  const today = sanitizeLocalDate(options.today) || formatLocalDate();
  const todayRow = db
    .prepare(`SELECT COUNT(*) AS total FROM profile_records WHERE user_id = ? AND local_date = ?`)
    .get(userId, today);
  const totalRecordsRow = db
    .prepare(`SELECT COUNT(*) AS total FROM profile_records WHERE user_id = ?`)
    .get(userId);
  const favoriteRow = db
    .prepare(`SELECT COUNT(*) AS total FROM profile_favorites WHERE user_id = ?`)
    .get(userId);
  const localDates = db
    .prepare(
      `SELECT DISTINCT local_date AS localDate
       FROM profile_records
       WHERE user_id = ? AND local_date IS NOT NULL AND local_date <> ''
       ORDER BY local_date ASC`
    )
    .all(userId);
  const dateValues = uniqueSortedLocalDates(localDates);

  return {
    userId,
    todayLocalDate: today,
    todaySentencesCompleted: Number(todayRow?.total || 0),
    totalSentencesCompleted: Number(totalRecordsRow?.total || 0),
    totalPracticeDays: dateValues.length,
    streakDays: computeStreakDays(dateValues, today),
    favoriteSentenceCount: Number(favoriteRow?.total || 0),
    updatedAt: new Date().toISOString(),
  };
}

export async function addMistakeWords(userIdInput, wordsInput) {
  const userId = resolveUserId(userIdInput);
  const words = sanitizeMistakeWords(wordsInput);
  if (words.length === 0) {
    return { userId, mistakes: [] };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const tx = db.transaction((items) => {
    const upsert = db.prepare(`
      INSERT INTO profile_mistakes (user_id, word_key, word, count, last_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, word_key) DO UPDATE SET
        count = profile_mistakes.count + 1,
        word = excluded.word,
        last_at = excluded.last_at
    `);
    for (const word of items) {
      upsert.run(userId, word.toLowerCase(), word, now);
    }
  });
  tx(words);
  return { userId };
}

export async function listMistakes(userIdInput, options = {}) {
  const userId = resolveUserId(userIdInput);
  const db = getDb();
  const limit = Math.max(1, Math.min(200, Number(options.limit || 20)));
  const offset = Math.max(0, Number(options.offset || 0));
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM profile_mistakes WHERE user_id = ?`)
    .get(userId);
  const mistakes = db
    .prepare(
      `SELECT word, count, last_at AS lastAt
       FROM profile_mistakes
       WHERE user_id = ?
       ORDER BY count DESC, last_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset);
  return { userId, mistakes, total: Number(totalRow?.total || 0) };
}

export function getProfileDataFilePath() {
  return getDbFilePath();
}
