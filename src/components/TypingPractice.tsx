import { useEffect, useMemo, useRef, useState } from 'react';
import { useWordbook } from '../context/WordbookContext';
import { translateToChinese } from '../services/translate';
import { Volume2, X, SkipForward, Lightbulb, Loader2 } from 'lucide-react';
import { fetchAiExamples, AiSentenceItem } from '../services/aiExamples';
import { WordDefinition } from '../types/word';
import { WordDetailModal } from './WordDetailModal';
import confetti from 'canvas-confetti';

function normalizeApostrophes(s: string) {
  return s.replace(/[’‘ʼ`＇]/g, "'");
}

interface TypingPracticeProps {
  startWord?: string;
  initialWordData?: WordDefinition;
}

export function TypingPractice({ startWord, initialWordData }: TypingPracticeProps) {
  const { state } = useWordbook();
  const [index, setIndex] = useState(0);
  
  // 统一计算练习单词列表：如果有 initialWordData 则只练这一个，否则练习单词本所有单词
  const practiceWords = useMemo(() => {
    if (initialWordData) return [initialWordData];
    return state.words;
  }, [initialWordData, state.words]);

  const [question, setQuestion] = useState('');
  const [checking, setChecking] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [wasWrong, setWasWrong] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [sentenceInputs, setSentenceInputs] = useState<string[]>([]);
  const [lockedWords, setLockedWords] = useState<boolean[]>([]);
  const [shakeWords, setShakeWords] = useState<boolean[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSentence, setAiSentence] = useState('');
  const [aiPack, setAiPack] = useState<AiSentenceItem[]>([]);
  const [aiIndex, setAiIndex] = useState(0);
  const [attemptCounts, setAttemptCounts] = useState<number[]>([]);
  const [revealHints, setRevealHints] = useState<boolean[]>([]);
  const [hintCount, setHintCount] = useState<number>(1);
  const loadAiSentencesRef = useRef(loadAiSentences);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const practiceRootRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<Array<HTMLDivElement | null>>([]);
  // Key format: "word-stage" to prevent duplicate loads for same word+stage combo
  const lastLoadedKeyRef = useRef<string>('');
  const [scenarioStage, setScenarioStage] = useState(0);
  const SCENARIOS = ['日常沟通', '社交互动', '休闲娱乐'];

  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  const [soundType, setSoundType] = useState<'mechanical' | 'typewriter' | 'bubble' | 'mute'>('mechanical');
  const SOUND_TYPES = [
    { id: 'mechanical', label: '机械' },
    { id: 'typewriter', label: '打字机' },
    { id: 'bubble', label: '气泡' },
    { id: 'mute', label: '静音' },
  ] as const;

  const handlePrev = () => {
    setIndex((prev) => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setIndex((prev) => Math.min(practiceWords.length - 1, prev + 1));
  };

  const current = practiceWords[index];

  const scrollFocusedContentIntoView = (behavior: ScrollBehavior = 'smooth') => {
    const activeWord = wordRefs.current[focusedIndex];
    const target = activeWord ?? inputRef.current ?? questionRef.current ?? practiceRootRef.current;
    if (!target) return;

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const rect = target.getBoundingClientRect();
    const topSafeZone = 72;
    const bottomSafeZone = keyboardInset > 0 ? keyboardInset + 32 : 140;

    if (rect.top < topSafeZone || rect.bottom > viewportHeight - bottomSafeZone) {
      target.scrollIntoView({ behavior, block: 'center' });
    }
  };
  
  const example = useMemo(() => {
    if (!current) return '';
    for (const m of current.meanings) {
      for (const d of m.definitions) {
        if (d.example && d.example.trim().length > 0) return d.example.trim();
      }
    }
    return '';
  }, [current]);
  const expectedWords = useMemo(() => {
    const src = aiSentence || example || '';
    const cleaned = normalizeApostrophes(src);
    const words = cleaned.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
    return words;
  }, [example, aiSentence]);

  async function loadAiSentences(stage?: number) {
    if (!current) return;
    setAiLoading(true);
    setAiError('');
    try {
      const useStage = stage ?? scenarioStage;
      const sents = await fetchAiExamples(current.word, 10, { force: true, hard: SCENARIOS[useStage % SCENARIOS.length] });
      console.log('AI sentences:', sents);
      const first = sents[0]?.sentence || '';
      const firstZh = sents[0]?.translation || '';
      if (sents[0]) console.log('Chosen item:', sents[0]);
      if (first) {
        setAiPack(sents);
        setAiIndex(0);
        setAiSentence(first);
        const words = first.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
        setSentenceInputs(words.map(() => ''));
        setLockedWords(words.map(() => false));
        setShakeWords(words.map(() => false));
        setAttemptCounts(words.map(() => 0));
        setRevealHints(words.map(() => false));
        setFocusedIndex(0);
        setShowAnswer(false);
        if (firstZh) {
          setQuestion(firstZh);
        } else {
          const zh = await translateToChinese(first);
          setQuestion(zh);
        }
      } else {
        setAiError('未获取到AI例句');
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI例句获取失败');
    } finally {
      setAiLoading(false);
    }
  }

  

  useEffect(() => {
    setChecking(false);
    setShowAnswer(false);
    setScenarioStage(0);
    // Note: We don't reset lastLoadedKeyRef here because we want to prevent re-loading same word if it mounts twice
    const load = async () => {
      const base = example || current?.word || '';
      const zh = await translateToChinese(base);
      setQuestion(zh);
    };
    if (current) load();
  }, [current, example]);

  useEffect(() => {
    inputRef.current?.focus();
    const timer = window.setTimeout(() => scrollFocusedContentIntoView('auto'), 80);
    return () => window.clearTimeout(timer);
  }, [index, checking, showAnswer, focusedIndex]);

  useEffect(() => {
    if (!window.visualViewport) return;

    const viewport = window.visualViewport;
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset > 120 ? inset : 0);
    };

    updateKeyboardInset();
    viewport.addEventListener('resize', updateKeyboardInset);
    viewport.addEventListener('scroll', updateKeyboardInset);

    return () => {
      viewport.removeEventListener('resize', updateKeyboardInset);
      viewport.removeEventListener('scroll', updateKeyboardInset);
    };
  }, []);

  useEffect(() => {
    if (keyboardInset === 0) return;

    const timer = window.setTimeout(() => scrollFocusedContentIntoView(), 120);
    return () => window.clearTimeout(timer);
  }, [keyboardInset, focusedIndex, showAnswer]);

  useEffect(() => { loadAiSentencesRef.current = loadAiSentences; }, [loadAiSentences]);

  useEffect(() => {
    const init = expectedWords.map(() => '');
    setSentenceInputs(init);
    setLockedWords(expectedWords.map(() => false));
    setShakeWords(expectedWords.map(() => false));
    setAttemptCounts(expectedWords.map(() => 0));
    setRevealHints(expectedWords.map(() => false));
    setFocusedIndex(0);
  }, [expectedWords]);

  useEffect(() => {
    if (!startWord) return;
    const idx = practiceWords.findIndex(w => w.word.toLowerCase() === startWord.toLowerCase());
    if (idx >= 0) {
      setIndex(idx);
    }
  }, [startWord, practiceWords]);

  useEffect(() => {
    // 无论是单个单词模式还是单词本模式，都使用统一的加载逻辑
    if (!current) return;
    if (aiLoading) return;
    
    // 如果当前已有 AI 例句包且就是当前词的，不需要重新加载
    // 但这里简化处理：只要切换了词（key 变化），就加载
    const key = `${current.word}-${scenarioStage}`;
    
    // 如果是同一个词同一个场景，且已经有数据了，就不重新加载
    if (lastLoadedKeyRef.current === key && aiPack.length > 0) return;

    if (lastLoadedKeyRef.current !== key) {
        lastLoadedKeyRef.current = key;
        loadAiSentencesRef.current(scenarioStage);
    }
  }, [startWord, current, aiPack.length, aiLoading, scenarioStage]);

  // const onSubmit = async () => { ... } // Removed

  const proceedToNextSentence = async () => {
    if (aiLoading) return;
    const nextIdx = aiIndex + 1;
    if (nextIdx < aiPack.length) {
      setAiIndex(nextIdx);
      const next = aiPack[nextIdx];
      setAiSentence(next.sentence);
      const words = next.sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
      setSentenceInputs(words.map(() => ''));
      setLockedWords(words.map(() => false));
      setShakeWords(words.map(() => false));
      setAttemptCounts(words.map(() => 0));
      setRevealHints(words.map(() => false));
      setFocusedIndex(0);
      setShowAnswer(false);
      if (next.translation) {
        setQuestion(next.translation);
      } else {
        const zh = await translateToChinese(next.sentence);
        setQuestion(zh);
      }
    } else {
      const nextStage = (scenarioStage + 1) % SCENARIOS.length;
      setScenarioStage(nextStage);
      await loadAiSentences(nextStage);
    }
  };

  const applyRandomHints = (countOverride?: number) => {
    const total = expectedWords.length;
    const n = Math.max(0, Math.min(typeof countOverride === 'number' ? countOverride : hintCount, total));
    const indices = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
    }
    const chosen = new Set(indices.slice(0, n));
    setRevealHints(prev => prev.map((v, i) => v || chosen.has(i)));
  };

  const speak = () => {
    if (!current) return;
    try {
      const expected = aiSentence || example || current.word;
      const utter = new SpeechSynthesisUtterance(expected);
      utter.lang = 'en-US';
      speechSynthesis.cancel(); // Cancel previous
      speechSynthesis.speak(utter);
    } catch (err) { void err; }
  };

  const playTypingSound = () => {
    if (soundType === 'mute') return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      const t = ctx.currentTime;

      if (soundType === 'mechanical') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      } else if (soundType === 'typewriter') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      } else if (soundType === 'bubble') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.linearRampToValueAtTime(600, t + 0.1);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
      }
      
      osc.connect(gain);
      gain.connect(ctx.destination);
    } catch (e) {
      console.error('Audio play failed', e);
    }
  };

  // Auto-play when sentence changes in sentence mode
  useEffect(() => {
      // Small delay to ensure UI is ready and avoid conflict with immediate typing if any
      const timer = setTimeout(() => {
        speak();
      }, 500);
      return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSentence, example]); // specific dependencies for auto-play trigger

  // 监听 Enter 键进入下一题（仅在展示答案/完成状态下）
  useEffect(() => {
    if (!showAnswer) return;
    
    let canProceed = false;
    // 延迟开启“下一题”的交互，防止 Enter 连击导致直接跳过，同时也给用户时间看清烟花和例句
    const timer = setTimeout(() => {
      canProceed = true;
    }, 1500); // 1.5秒冷却时间

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (canProceed) {
          void proceedToNextSentence();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [showAnswer, proceedToNextSentence]);

  if (!current) {
    return (
      <div className="text-center py-12 text-gray-500">
        暂无单词，请先添加到单词本
      </div>
    );
  }

  return (
    <div
      ref={practiceRootRef}
      className="w-full max-w-4xl mx-auto px-1 sm:px-4"
      style={{
        paddingBottom: keyboardInset > 0 ? `${keyboardInset + 16}px` : undefined,
      }}
    >
      {/* Top Header Area */}
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 shrink-0">
              {practiceWords.length > 1 && (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 sm:text-sm">
                  单词进度：{index + 1} / {practiceWords.length}
                </span>
              )}
          </div>

          {/* Progress Dots - Center (Sentence Progress) */}
          <div className="flex min-w-0 flex-1 justify-start sm:mx-4 sm:max-w-md sm:justify-center">
             {aiPack.length > 0 ? (
               <div className="flex flex-wrap items-center gap-2">
                 {aiPack.map((_, idx) => (
                   <div
                     key={idx}
                     className={`
                       w-2.5 h-2.5 rounded-full transition-all duration-300
                       ${idx === aiIndex 
                         ? 'bg-blue-600 scale-125 shadow-sm' 
                         : idx < aiIndex 
                           ? 'bg-blue-300' 
                           : 'bg-gray-200'
                       }
                     `}
                   />
                 ))}
               </div>
             ) : (
               <div className="flex items-center gap-2 animate-pulse">
                 {[...Array(5)].map((_, i) => (
                   <div key={i} className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                 ))}
               </div>
             )}
          </div>

          <div className="flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 sm:text-sm">
            <span>场景：</span>
            <span>{SCENARIOS[scenarioStage]}</span>
          </div>
      </div>

      {/* Main Practice Card */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 mb-4 sm:mb-8" onClick={() => inputRef.current?.focus()}>
        {aiLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 space-y-4">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <div className="text-lg font-medium">AI 正在生成例句...</div>
            <div className="text-sm text-slate-400">这可能需要几秒钟</div>
          </div>
        ) : (
          <>
            {/* Question Section */}
            <div ref={questionRef} className="border-b border-slate-100 bg-slate-50 px-3 pt-4 pb-3 text-center sm:px-6 sm:py-5">
          <h2 className="break-words text-lg font-medium leading-snug text-slate-800 sm:text-xl md:text-2xl">
            {question}
          </h2>
        </div>

        {/* Input/Interaction Section */}
        <div className="flex flex-col items-center justify-start bg-white px-3 pt-3 pb-6 sm:min-h-[140px] sm:px-5 sm:pt-6 sm:pb-8 md:p-8">
            <div className="w-full">
               {showAnswer ? (
                  <div className="text-center animate-in fade-in zoom-in duration-300">
                    <div className="mb-4 break-words text-xl font-medium leading-relaxed text-blue-600 sm:text-2xl md:text-3xl">
                      {expectedWords.join(' ') || current.word}
                    </div>
                    <div className="text-sm text-gray-400 animate-in fade-in duration-1000 delay-1000 fill-mode-forwards opacity-0" style={{ animationDelay: '1.5s', animationFillMode: 'forwards' }}>
                      按 Enter 进入下一题
                    </div>
                  </div>
               ) : (
                 <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-4 sm:gap-x-3 sm:gap-y-5">
                  {expectedWords.map((w: string, i: number) => (
                    <div
                      key={i}
                      ref={(el) => {
                        wordRefs.current[i] = el;
                      }}
                      className={`
                        group relative h-10 min-w-[2rem] transition-all duration-200 sm:h-12
                        ${focusedIndex === i ? 'scale-105' : 'opacity-90 hover:opacity-100'}
                      `}
                      style={{ width: `${Math.max(2, w.length)}ch` }}
                      onClick={(e) => { e.stopPropagation(); setFocusedIndex(i); }}
                    >
                      <div 
                        className={`
                          absolute bottom-0 left-0 right-0 h-[2px] transition-colors duration-300
                          ${shakeWords[i] ? 'bg-red-500' : (revealHints[i] ? 'bg-red-400' : (focusedIndex === i ? 'bg-blue-500' : 'bg-slate-200'))}
                        `}
                      />
                      
                      <div className={`
                        flex h-full items-center justify-center text-base font-mono tracking-wide select-none sm:text-xl
                        ${shakeWords[i] ? 'animate-shake' : ''}
                      `}>
                        {(sentenceInputs[i] || '').split('').map((ch, idx) => {
                          const expectedCh = normalizeApostrophes(w).toLowerCase()[idx];
                          const isCorrect = expectedCh !== undefined && expectedCh === normalizeApostrophes(ch).toLowerCase();
                          return (
                            <span key={idx} className={isCorrect ? 'text-emerald-600' : 'text-red-500'}>{ch}</span>
                          );
                        })}
                      </div>
                      
                      {revealHints[i] && (
                        <div 
                          className="absolute -top-4 left-1/2 -translate-x-1/2 cursor-pointer text-[10px] font-bold uppercase tracking-wider text-red-500 underline decoration-dotted underline-offset-4 animate-fade-in-up hover:text-red-600 sm:-top-5 sm:text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWord(w);
                          }}
                        >
                          {w}
                        </div>
                      )}
                      
                      <input
                        ref={focusedIndex === i ? inputRef : undefined}
                        value={sentenceInputs[i] || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v.length > (sentenceInputs[i] || '').length) playTypingSound();
                          
                          const expectedLower = normalizeApostrophes(w).toLowerCase();
                          // Logic for checking correctness
                          let mismatchIndex = -1;
                          for (let k = 0; k < v.length; k++) {
                            const ec = expectedLower[k];
                            const ic = normalizeApostrophes(v[k] || '').toLowerCase();
                            if (!ec || ec !== ic) { mismatchIndex = k; break; }
                          }
                          
                          const nextInputs = sentenceInputs.map((p, idx2) => (idx2 === i ? v : p));
                          setSentenceInputs(nextInputs);
                          setChecking(false);
                          setWasWrong(false);
                          
                          if (mismatchIndex !== -1) {
                            setAttemptCounts(prev => prev.map((p, idx2) => (idx2 === i ? p + 1 : p)));
                            const newVal = (attemptCounts[i] ?? 0) + 1;
                            if (newVal >= 3 && !revealHints[i]) {
                              setRevealHints(rprev => rprev.map((r, idx2) => (idx2 === i ? true : r)));
                            }
                            setLockedWords(prev => prev.map((p, idx2) => (idx2 === i ? true : p)));
                            setShakeWords(prev => prev.map((p, idx2) => (idx2 === i ? true : p)));
                            setTimeout(() => setShakeWords(prev => prev.map((p, idx2) => (idx2 === i ? false : p))), 200);
                          } else {
                            if (lockedWords[i]) {
                              setLockedWords(prev => prev.map((p, idx2) => (idx2 === i ? false : p)));
                            }
                          }
                          
                          const isCorrectFull = normalizeApostrophes(v).toLowerCase() === expectedLower && v.length === expectedLower.length;
                          if (isCorrectFull && i < expectedWords.length - 1) {
                            setFocusedIndex(Math.min(i + 1, expectedWords.length - 1));
                          }
                        }}
                        onKeyDown={(e) => {
                          // Handle hint shortcut: Press '1' to reveal current word hint ONLY (no auto-fill)
                          if (e.key === '1') {
                            e.preventDefault();
                            setRevealHints(prev => prev.map((hint, idx) => idx === i ? true : hint));
                            // Ensure the word is not locked so user can type
                            setLockedWords(prev => prev.map((locked, idx) => idx === i ? false : locked));
                            return;
                          }

                          if (/^[2-9]$/.test(e.key)) {
                            e.preventDefault();
                            applyRandomHints(parseInt(e.key, 10));
                            return;
                          }
                          const isLetter = /^[a-zA-Z]$/.test(e.key) || (e.key.length === 1 && e.key !== ' ');
                          if (lockedWords[i] && isLetter && !revealHints[i]) {
                            e.preventDefault();
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const allCorrect = expectedWords.every((w2, idx2) => {
                              const x = normalizeApostrophes(sentenceInputs[idx2] || '').toLowerCase();
                              const y = normalizeApostrophes(w2).toLowerCase();
                              return x === y && x.length === y.length;
                            });
                            if (allCorrect) {
                              confetti({
                                particleCount: 100,
                                spread: 70,
                                origin: { y: 0.6 }
                              });
                              setShowAnswer(true);
                              speak();
                            } else {
                              setChecking(true);
                              setWasWrong(true);
                            }
                            return;
                          }
                          if (e.key === ' ') e.preventDefault();
                        }}
                        className="absolute inset-0 opacity-0 cursor-text"
                        autoFocus={i === 0}
                      />
                    </div>
                  ))}
                 </div>
               )}
            </div>
        </div>
          </>
        )}
      </div>

      {/* Footer Controls Area */}
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-3 sm:gap-6 sm:p-4 md:flex-row md:items-center md:justify-between">
        
        {/* Left: Sound Settings */}
        <div className="flex w-full items-center gap-3 md:w-auto">
          <div className="flex w-full flex-wrap rounded-lg border border-gray-200 bg-white p-1 shadow-sm md:w-auto">
            {SOUND_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setSoundType(type.id)}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:flex-none ${soundType === type.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Status Messages */}
        <div className="flex-1 text-center md:px-4">
           {aiLoading && <span className="text-sm text-blue-600 animate-pulse">正在生成场景例句...</span>}
           {aiError && <span className="text-sm text-red-500">{aiError}</span>}
           {checking && wasWrong && !aiLoading && !aiError && (
             <span className="text-sm text-red-500 font-medium flex items-center justify-center gap-1">
               <X className="w-4 h-4" /> 答案有误，请修正
             </span>
           )}
        </div>

        {/* Right: Action Buttons */}
        <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
            <button 
              onClick={() => applyRandomHints(1)} 
              className="flex items-center justify-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-200"
              title="提示一个字母 (快捷键: 1-9)"
            >
              <Lightbulb className="w-4 h-4" />
              提示
            </button>
          
          <button 
            onClick={speak} 
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50"
          >
            <Volume2 className="w-4 h-4" />
            朗读
          </button>
          
          <button 
            onClick={() => void proceedToNextSentence()} 
            disabled={aiLoading}
            className={`flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg ${aiLoading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <span>{aiLoading ? '加载中...' : '下一题'}</span>
            {!aiLoading && <SkipForward className="w-4 h-4" />}
          </button>
        </div>
      </div>
      
      {/* Keyboard Shortcuts Hint */}
      <div className="mt-6 text-center text-xs leading-relaxed text-gray-400">
        快捷键：Enter 提交 / 下一题 &middot; 数字键 1-9 提示 &middot; Space 播放发音
      </div>

      <WordDetailModal 
        word={selectedWord || ''}
        isOpen={!!selectedWord}
        onClose={() => setSelectedWord(null)}
      />
    </div>
  );
}
