/**
 * Edge TTS Service
 * 
 * Provides text-to-speech functionality using Microsoft Edge TTS.
 * Includes audio caching to avoid duplicate requests.
 */

const TTS_CACHE = new Map<string, HTMLAudioElement>();
const TTS_BASE_URL = '/api/tts';

// Voice options
export const TTS_VOICES = {
  // US English
  usFemale: 'en-US-AriaNeural',
  usMale: 'en-US-GuyNeural',
  // UK English  
  ukFemale: 'en-GB-SoniaNeural',
  ukMale: 'en-GB-RyanNeural',
} as const;

export type TTSVoice = typeof TTS_VOICES[keyof typeof TTS_VOICES];

/**
 * Get cache key for a text+voice combination
 */
function getCacheKey(text: string, voice: string): string {
  return `${voice}:${text}`;
}

/**
 * Preload audio for a given text and voice
 */
async function preloadAudio(text: string, voice: string): Promise<HTMLAudioElement> {
  const cacheKey = getCacheKey(text, voice);
  
  if (TTS_CACHE.has(cacheKey)) {
    return TTS_CACHE.get(cacheKey)!;
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = `${TTS_BASE_URL}?${new URLSearchParams({ text, voice })}`;
    
    audio.addEventListener('canplaythrough', () => {
      TTS_CACHE.set(cacheKey, audio);
      resolve(audio);
    }, { once: true });
    
    audio.addEventListener('error', (e) => {
      reject(new Error(`Failed to load audio: ${e.type}`));
    }, { once: true });

    audio.preload = 'auto';
    audio.src = url;
    audio.load();
  });
}

/**
 * Speak text using Edge TTS
 * @param text - Text to speak
 * @param voice - Voice name (default: en-US-AriaNeural)
 * @param fallbackFn - Optional fallback function if TTS fails
 */
export async function speak(
  text: string,
  voice: string = TTS_VOICES.usFemale,
  fallbackFn?: () => void
): Promise<void> {
  if (!text?.trim()) return;

  try {
    const audio = await preloadAudio(text.trim(), voice);
    
    // Reset to beginning if already played
    audio.currentTime = 0;
    
    await audio.play().catch((err) => {
      // If play fails, try fallback
      if (fallbackFn) {
        console.warn('Edge TTS playback failed, using fallback:', err);
        fallbackFn();
      } else {
        throw err;
      }
    });
  } catch (error) {
    console.error('Edge TTS error:', error);
    if (fallbackFn) {
      fallbackFn();
    }
  }
}

/**
 * Speak a single word with US pronunciation
 */
export async function speakWord(
  word: string,
  voice: TTSVoice = TTS_VOICES.usFemale,
  fallbackUrl?: string
): Promise<void> {
  await speak(word, voice, fallbackUrl ? () => {
    try {
      const audio = new Audio(fallbackUrl);
      audio.play().catch(console.error);
    } catch {
      // Ignore fallback errors
    }
  } : undefined);
}

/**
 * Speak a sentence with natural speed
 */
export async function speakSentence(
  sentence: string,
  voice: TTSVoice = TTS_VOICES.usFemale
): Promise<void> {
  await speak(sentence, voice);
}

/**
 * Clear the audio cache
 */
export function clearTTSCache(): void {
  TTS_CACHE.clear();
}
