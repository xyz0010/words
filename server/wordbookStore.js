import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const DEFAULT_USER_ID = (process.env.DEFAULT_WORDS_USER_ID || 'demo-user').trim() || 'demo-user';
const DATA_DIR = process.env.WORDS_DATA_DIR
  ? path.resolve(process.env.WORDS_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'wordbooks.json');

function createEmptyStore() {
  return {
    users: {},
    updatedAt: new Date().toISOString(),
  };
}

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

async function ensureStoreFile() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, 'utf8');
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(createEmptyStore(), null, 2), 'utf8');
  }
}

async function readStore() {
  await ensureStoreFile();
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.users || typeof parsed.users !== 'object') {
      return createEmptyStore();
    }
    return parsed;
  } catch {
    return createEmptyStore();
  }
}

async function writeStore(store) {
  await ensureStoreFile();
  const nextStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(DATA_FILE, JSON.stringify(nextStore, null, 2), 'utf8');
}

export function resolveUserId(inputUserId) {
  return normalizeString(inputUserId) || DEFAULT_USER_ID;
}

export async function getWordbook(userIdInput) {
  const userId = resolveUserId(userIdInput);
  const store = await readStore();
  const words = Array.isArray(store.users?.[userId]?.words) ? store.users[userId].words : [];
  return { userId, words };
}

export async function upsertWord(userIdInput, wordInput) {
  const userId = resolveUserId(userIdInput);
  const sanitizedWord = sanitizeWord(wordInput);
  if (!sanitizedWord) {
    throw new Error('invalid_word_payload');
  }

  const store = await readStore();
  const currentWords = Array.isArray(store.users?.[userId]?.words) ? store.users[userId].words : [];
  const nextWords = [
    sanitizedWord,
    ...currentWords.filter((item) => normalizeString(item?.word).toLowerCase() !== sanitizedWord.word.toLowerCase()),
  ];

  store.users[userId] = { words: nextWords };
  await writeStore(store);
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

  const store = await readStore();
  const currentWords = Array.isArray(store.users?.[userId]?.words) ? store.users[userId].words : [];
  const byWord = new Map();

  for (const item of currentWords) {
    const key = normalizeString(item?.word).toLowerCase();
    if (key) byWord.set(key, item);
  }

  for (const item of sanitizedWords) {
    byWord.set(item.word.toLowerCase(), item);
  }

  const nextWords = Array.from(byWord.values()).sort((a, b) => {
    return new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime();
  });

  store.users[userId] = { words: nextWords };
  await writeStore(store);
  return { userId, words: nextWords };
}

export async function deleteWord(userIdInput, wordInput) {
  const userId = resolveUserId(userIdInput);
  const targetWord = normalizeString(wordInput).toLowerCase();
  const store = await readStore();
  const currentWords = Array.isArray(store.users?.[userId]?.words) ? store.users[userId].words : [];
  const nextWords = currentWords.filter((item) => normalizeString(item?.word).toLowerCase() !== targetWord);

  store.users[userId] = { words: nextWords };
  await writeStore(store);
  return { userId, words: nextWords };
}

export function getWordbookDataFilePath() {
  return DATA_FILE;
}
