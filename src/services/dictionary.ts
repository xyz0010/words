import { WordDefinition } from '../types/word';

export async function searchWord(word: string): Promise<WordDefinition> {
  try {
    const hasChinese = /[\u4e00-\u9fa5]/.test(word);
    const from = hasChinese ? 'zh-CHS' : 'en';
    const to = hasChinese ? 'en' : 'zh-CHS';
    const res = await fetch('/api/youdao/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: word, from, to }),
    });
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const zh = typeof data?.translation === 'string' && data.translation ? data.translation : '';
    if (!zh) throw new Error('Translation not found');
    const def: WordDefinition = {
      word: hasChinese ? zh : word,
      phonetic: undefined,
      meanings: [
        {
          partOfSpeech: hasChinese ? 'zh→en' : 'en→zh',
          definitions: [
            {
              definition: zh,
              example: undefined,
            },
          ],
        },
      ],
    };
    return def;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to search word');
  }
}