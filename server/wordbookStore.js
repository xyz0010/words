import { getDb, getDbFilePath } from './db.js';

const DEFAULT_USER_ID = (process.env.DEFAULT_WORDS_USER_ID || 'demo-user').trim() || 'demo-user';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeDefinitions(definitions) {
  if (!Array.isArray(definitions)) return [];
  return definitions
    .map((definition) => ({
      definition: normalizeString(definition?.definition),
      example: normalizeString(definition?.example) || undefined,
    }))
    .filter((definition) => definition.definition);
}

function sanitizeMeanings(meanings) {
  if (!Array.isArray(meanings)) return [];
  return meanings
    .map((meaning) => ({
      partOfSpeech: normalizeString(meaning?.partOfSpeech) || '释义',
      definitions: sanitizeDefinitions(meaning?.definitions),
    }))
    .filter((meaning) => meaning.definitions.length > 0);
}

function sanitizeExamples(examples) {
  if (!Array.isArray(examples)) return [];
  return examples
    .map((example) => ({
      sentence: normalizeString(example?.sentence),
      translation: normalizeString(example?.translation),
    }))
    .filter((example) => example.sentence);
}

function sanitizeWord(word) {
  const normalizedWord = normalizeString(word?.word);
  const meanings = sanitizeMeanings(word?.meanings);
  if (!normalizedWord || meanings.length === 0) return null;

  const sanitized = {
    word: normalizedWord,
    phonetic: normalizeString(word?.phonetic) || undefined,
    audio: {
      us: normalizeString(word?.audio?.us) || undefined,
      uk: normalizeString(word?.audio?.uk) || undefined,
    },
    meanings,
    wfs: Array.isArray(word?.wfs)
      ? word.wfs.map((item) => normalizeString(item)).filter(Boolean)
      : undefined,
    examples: sanitizeExamples(word?.examples),
    dateAdded: normalizeString(word?.dateAdded) || new Date().toISOString(),
  };

  if (!sanitized.audio.us && !sanitized.audio.uk) {
    delete sanitized.audio;
  }
  if (!sanitized.wfs?.length) {
    delete sanitized.wfs;
  }
  if (!sanitized.examples?.length) {
    delete sanitized.examples;
  }

  return sanitized;
}

export function resolveUserId(inputUserId) {
  return normalizeString(inputUserId) || DEFAULT_USER_ID;
}

export async function getWordbook(userIdInput) {
  const userId = resolveUserId(userIdInput);
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT payload_json AS payloadJson
       FROM wordbook_words
       WHERE user_id = ?
       ORDER BY COALESCE(date_added, '') DESC`
    )
    .all(userId);
  const words = rows.map((row) => JSON.parse(row.payloadJson));
  return { userId, words };
}

export async function upsertWord(userIdInput, wordInput) {
  const userId = resolveUserId(userIdInput);
  const sanitizedWord = sanitizeWord(wordInput);
  if (!sanitizedWord) {
    throw new Error('invalid_word_payload');
  }

  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO wordbook_words (user_id, word_key, word, payload_json, date_added)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    userId,
    sanitizedWord.word.toLowerCase(),
    sanitizedWord.word,
    JSON.stringify(sanitizedWord),
    sanitizedWord.dateAdded || null
  );
  return sanitizedWord;
}

export async function importWords(userIdInput, wordsInput) {
  const userId = resolveUserId(userIdInput);
  const sanitizedWords = Array.isArray(wordsInput)
    ? wordsInput.map((word) => sanitizeWord(word)).filter(Boolean)
    : [];

  if (sanitizedWords.length === 0) {
    return { userId, words: [] };
  }

  const db = getDb();
  const insertWord = db.prepare(
    `INSERT OR REPLACE INTO wordbook_words (user_id, word_key, word, payload_json, date_added)
     VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((items) => {
    for (const item of items) {
      insertWord.run(
        userId,
        item.word.toLowerCase(),
        item.word,
        JSON.stringify(item),
        item.dateAdded || null
      );
    }
  });
  tx(sanitizedWords);
  return getWordbook(userId);
}

export async function deleteWord(userIdInput, wordInput) {
  const userId = resolveUserId(userIdInput);
  const targetWord = normalizeString(wordInput).toLowerCase();
  const db = getDb();
  db.prepare(`DELETE FROM wordbook_words WHERE user_id = ? AND word_key = ?`).run(userId, targetWord);
  return getWordbook(userId);
}

export function getWordbookDataFilePath() {
  return getDbFilePath();
}
