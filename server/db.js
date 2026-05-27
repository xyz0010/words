import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DEFAULT_DATA_DIR = process.env.WORDS_DATA_DIR
  ? path.resolve(process.env.WORDS_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DEFAULT_DATA_DIR, 'words.sqlite');

let dbInstance = null;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function ensureDataDir() {
  fs.mkdirSync(DEFAULT_DATA_DIR, { recursive: true });
}

function createSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS wordbook_words (
      user_id TEXT NOT NULL,
      word_key TEXT NOT NULL,
      word TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      date_added TEXT,
      PRIMARY KEY(user_id, word_key)
    );
    CREATE INDEX IF NOT EXISTS idx_wordbook_user_date ON wordbook_words(user_id, date_added DESC);

    CREATE TABLE IF NOT EXISTS profile_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sentence TEXT NOT NULL,
      translation TEXT,
      source TEXT NOT NULL,
      word TEXT,
      passage_id TEXT,
      scenario TEXT,
      duration_ms INTEGER,
      local_date TEXT NOT NULL,
      completed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_profile_records_user_completed
      ON profile_records(user_id, completed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_profile_records_user_local_date
      ON profile_records(user_id, local_date);

    CREATE TABLE IF NOT EXISTS profile_favorites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      sentence_key TEXT NOT NULL,
      sentence TEXT NOT NULL,
      translation TEXT,
      source TEXT NOT NULL,
      word TEXT,
      passage_id TEXT,
      scenario TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, sentence_key)
    );
    CREATE INDEX IF NOT EXISTS idx_profile_favorites_user_created
      ON profile_favorites(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS profile_mistakes (
      user_id TEXT NOT NULL,
      word_key TEXT NOT NULL,
      word TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      last_at TEXT NOT NULL,
      PRIMARY KEY(user_id, word_key)
    );
    CREATE INDEX IF NOT EXISTS idx_profile_mistakes_user_count
      ON profile_mistakes(user_id, count DESC, last_at DESC);
  `);
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function migrateAuthJson(db) {
  const imported = db.prepare(`SELECT value FROM app_meta WHERE key = 'migrated_auth_json'`).get();
  if (imported?.value === '1') return;

  const authPath = path.join(DEFAULT_DATA_DIR, 'auth.json');
  const parsed = readJsonIfExists(authPath);
  if (!parsed || typeof parsed !== 'object') {
    db.prepare(`INSERT OR REPLACE INTO app_meta(key, value) VALUES ('migrated_auth_json', '1')`).run();
    return;
  }

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
    VALUES (@id, @username, @password_hash, @created_at)
  `);
  const insertSession = db.prepare(`
    INSERT OR IGNORE INTO sessions (token, user_id, created_at)
    VALUES (@token, @user_id, @created_at)
  `);

  const tx = db.transaction(() => {
    for (const user of Object.values(parsed.users || {})) {
      if (!user?.id || !user?.username || !user?.passwordHash) continue;
      insertUser.run({
        id: user.id,
        username: normalizeString(user.username).toLowerCase(),
        password_hash: user.passwordHash,
        created_at: user.createdAt || new Date().toISOString(),
      });
    }
    for (const [token, session] of Object.entries(parsed.sessions || {})) {
      if (!token || !session?.userId) continue;
      insertSession.run({
        token,
        user_id: session.userId,
        created_at: session.createdAt || new Date().toISOString(),
      });
    }
    db.prepare(`INSERT OR REPLACE INTO app_meta(key, value) VALUES ('migrated_auth_json', '1')`).run();
  });

  tx();
}

function migrateWordbookJson(db) {
  const imported = db.prepare(`SELECT value FROM app_meta WHERE key = 'migrated_wordbooks_json'`).get();
  if (imported?.value === '1') return;

  const wordbookPath = path.join(DEFAULT_DATA_DIR, 'wordbooks.json');
  const parsed = readJsonIfExists(wordbookPath);
  if (!parsed || typeof parsed !== 'object') {
    db.prepare(`INSERT OR REPLACE INTO app_meta(key, value) VALUES ('migrated_wordbooks_json', '1')`).run();
    return;
  }

  const insertWord = db.prepare(`
    INSERT OR REPLACE INTO wordbook_words (user_id, word_key, word, payload_json, date_added)
    VALUES (@user_id, @word_key, @word, @payload_json, @date_added)
  `);

  const tx = db.transaction(() => {
    for (const [userId, bucket] of Object.entries(parsed.users || {})) {
      const words = Array.isArray(bucket?.words) ? bucket.words : [];
      for (const word of words) {
        const wordText = normalizeString(word?.word);
        if (!userId || !wordText) continue;
        insertWord.run({
          user_id: userId,
          word_key: wordText.toLowerCase(),
          word: wordText,
          payload_json: JSON.stringify(word),
          date_added: normalizeString(word?.dateAdded) || null,
        });
      }
    }
    db.prepare(`INSERT OR REPLACE INTO app_meta(key, value) VALUES ('migrated_wordbooks_json', '1')`).run();
  });

  tx();
}

function migrateProfilesJson(db) {
  const imported = db.prepare(`SELECT value FROM app_meta WHERE key = 'migrated_profiles_json'`).get();
  if (imported?.value === '1') return;

  const profilePath = path.join(DEFAULT_DATA_DIR, 'profiles.json');
  const parsed = readJsonIfExists(profilePath);
  if (!parsed || typeof parsed !== 'object') {
    db.prepare(`INSERT OR REPLACE INTO app_meta(key, value) VALUES ('migrated_profiles_json', '1')`).run();
    return;
  }

  const insertRecord = db.prepare(`
    INSERT OR REPLACE INTO profile_records
    (id, user_id, sentence, translation, source, word, passage_id, scenario, duration_ms, local_date, completed_at)
    VALUES (@id, @user_id, @sentence, @translation, @source, @word, @passage_id, @scenario, @duration_ms, @local_date, @completed_at)
  `);
  const insertFavorite = db.prepare(`
    INSERT OR REPLACE INTO profile_favorites
    (id, user_id, sentence_key, sentence, translation, source, word, passage_id, scenario, created_at)
    VALUES (@id, @user_id, @sentence_key, @sentence, @translation, @source, @word, @passage_id, @scenario, @created_at)
  `);
  const insertMistake = db.prepare(`
    INSERT OR REPLACE INTO profile_mistakes
    (user_id, word_key, word, count, last_at)
    VALUES (@user_id, @word_key, @word, @count, @last_at)
  `);

  const tx = db.transaction(() => {
    for (const [userId, bucket] of Object.entries(parsed.users || {})) {
      const records = Array.isArray(bucket?.records) ? bucket.records : [];
      const favorites = Array.isArray(bucket?.favorites) ? bucket.favorites : [];
      const mistakes = bucket?.mistakes && typeof bucket.mistakes === 'object' ? bucket.mistakes : {};

      for (const record of records) {
        if (!record?.id || !record?.sentence) continue;
        insertRecord.run({
          id: record.id,
          user_id: userId,
          sentence: record.sentence,
          translation: record.translation || null,
          source: record.source || 'ai',
          word: record.word || null,
          passage_id: record.passageId || null,
          scenario: record.scenario || null,
          duration_ms: Number.isFinite(Number(record.durationMs)) ? Number(record.durationMs) : null,
          local_date: record.localDate || new Date().toISOString().slice(0, 10),
          completed_at: record.completedAt || new Date().toISOString(),
        });
      }

      for (const favorite of favorites) {
        const sentence = normalizeString(favorite?.sentence);
        if (!favorite?.id || !sentence) continue;
        insertFavorite.run({
          id: favorite.id,
          user_id: userId,
          sentence_key: sentence.toLowerCase(),
          sentence,
          translation: favorite.translation || null,
          source: favorite.source || 'ai',
          word: favorite.word || null,
          passage_id: favorite.passageId || null,
          scenario: favorite.scenario || null,
          created_at: favorite.createdAt || new Date().toISOString(),
        });
      }

      for (const [wordKey, item] of Object.entries(mistakes)) {
        const word = normalizeString(item?.word) || normalizeString(wordKey);
        if (!word) continue;
        insertMistake.run({
          user_id: userId,
          word_key: normalizeString(wordKey).toLowerCase(),
          word,
          count: Math.max(0, Number(item?.count || 0)),
          last_at: item?.lastAt || new Date().toISOString(),
        });
      }
    }
    db.prepare(`INSERT OR REPLACE INTO app_meta(key, value) VALUES ('migrated_profiles_json', '1')`).run();
  });

  tx();
}

function runMigrations(db) {
  migrateAuthJson(db);
  migrateWordbookJson(db);
  migrateProfilesJson(db);
}

export function getDb() {
  if (dbInstance) return dbInstance;
  ensureDataDir();
  const db = new Database(DB_FILE);
  createSchema(db);
  runMigrations(db);
  dbInstance = db;
  return dbInstance;
}

export function getDbFilePath() {
  return DB_FILE;
}

