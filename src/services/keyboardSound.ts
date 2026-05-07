/**
 * Cherry G80-3000 机械键盘打字音效服务
 * 使用 Web Audio API 预加载并播放真实键盘录音
 */

const SOUND_BASE = '/sounds';

type SoundBufferName = 'key1' | 'key2' | 'key3' | 'enter' | 'backspace';

const SOUND_FILES: Record<SoundBufferName, string> = {
  key1: `${SOUND_BASE}/key1.wav`,
  key2: `${SOUND_BASE}/key2.wav`,
  key3: `${SOUND_BASE}/key3.wav`,
  enter: `${SOUND_BASE}/enter.wav`,
  backspace: `${SOUND_BASE}/backspace.wav`,
};

let audioCtx: AudioContext | null = null;
let buffers: Partial<Record<SoundBufferName, AudioBuffer>> = {};
let loading = false;
let loaded = false;
let enabled = true;

/** 防抖：上次播放音效的时间戳 */
let lastPlayTime = 0;
const DEBOUNCE_MS = 60;

/** 轮流计数器：用于 key1/key2/key3 轮流播放 */
let keyRoundRobin = 0;

function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    // Safari: resume on user gesture
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** 预加载所有音效文件到 AudioBuffer */
async function loadAllBuffers(): Promise<void> {
  if (loaded || loading) return;
  loading = true;

  const ctx = getAudioContext();
  if (!ctx) {
    loading = false;
    return;
  }

  const entries = Object.entries(SOUND_FILES) as [SoundBufferName, string][];
  const promises = entries.map(async ([name, url]) => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch ${url}`);
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      buffers[name] = audioBuf;
    } catch (e) {
      console.warn(`[keyboardSound] Failed to load ${name}:`, e);
    }
  });

  await Promise.all(promises);
  loaded = true;
  loading = false;
}

/** 播放指定 AudioBuffer */
function playBuffer(buf: AudioBuffer): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Safari: ensure context is running
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }

  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(ctx.destination);
  source.start(0);
}

/**
 * 播放按键音效
 * @param key 按键名，如 'Enter', 'Backspace', 或普通字符键
 */
export async function playKeySound(key: string): Promise<void> {
  if (!enabled) return;

  // 防抖
  const now = Date.now();
  if (now - lastPlayTime < DEBOUNCE_MS) return;
  lastPlayTime = now;

  // 首次调用时初始化 AudioContext 并预加载
  if (!loaded) {
    await loadAllBuffers();
  }

  let bufName: SoundBufferName;

  if (key === 'Enter') {
    bufName = 'enter';
  } else if (key === 'Backspace') {
    bufName = 'backspace';
  } else {
    // 普通按键轮流派 key1/key2/key3
    const idx = keyRoundRobin % 3;
    keyRoundRobin++;
    bufName = (`key${idx + 1}`) as SoundBufferName;
  }

  const buf = buffers[bufName];
  if (buf) {
    playBuffer(buf);
  }
}

/**
 * 开关音效
 */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/**
 * 获取当前音效是否开启
 */
export function isSoundEnabled(): boolean {
  return enabled;
}

/**
 * 页面可见性变化时恢复 AudioContext（Safari 兼容）
 * 建议在应用入口调用一次
 */
export function setupVisibilityResume(): void {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Safari: also resume on first touch
  const handleTouch = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
  };
  document.addEventListener('touchstart', handleTouch, { once: true });
  document.addEventListener('touchend', handleTouch, { once: true });
}
