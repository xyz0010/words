import { Passage } from '../types/practice';

const PASSAGE_STORAGE_KEY = 'custom_passages_v1';

function safeParsePassages(raw: string | null): Passage[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is Passage => {
      return (
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.topic === 'string' &&
        typeof item.level === 'string' &&
        typeof item.description === 'string' &&
        Array.isArray(item.sentences)
      );
    });
  } catch {
    return [];
  }
}

export function loadCustomPassages(): Passage[] {
  if (typeof window === 'undefined') return [];
  return safeParsePassages(localStorage.getItem(PASSAGE_STORAGE_KEY));
}

export function saveCustomPassages(passages: Passage[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PASSAGE_STORAGE_KEY, JSON.stringify(passages));
}

export function splitPassageIntoSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(line => line.trim())
    .filter(Boolean);
}

export function createCustomPassage(input: {
  title: string;
  englishLines: string[];
  translationLines: string[];
}): Passage {
  const englishLines = input.englishLines.map(line => line.trim()).filter(Boolean);
  const translationLines = input.translationLines.map(line => line.trim());
  const preview = englishLines[0] || '';

  return {
    id: `custom-${Date.now()}`,
    title: input.title.trim(),
    topic: '自定义短文',
    level: `${englishLines.length} 句`,
    description: preview.length > 60 ? `${preview.slice(0, 60)}...` : preview || '用户自定义短文',
    source: 'custom',
    createdAt: new Date().toISOString(),
    sentences: englishLines.map((sentence, index) => ({
      sentence,
      translation: translationLines[index] || undefined,
    })),
  };
}
