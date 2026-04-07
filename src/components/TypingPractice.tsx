import { useEffect, useMemo, useRef, useState } from 'react';
import { useWordbook } from '../context/WordbookContext';
import { translateToChinese } from '../services/translate';
import { Volume2, X, Keyboard, SkipForward, BookOpen, MessageSquare, Lightbulb } from 'lucide-react';
import { fetchAiExamples, AiSentenceItem } from '../services/aiExamples';

function compareStrings(expected: string, input: string) {
  const e = expected.toLowerCase();
  const i = input.toLowerCase();
  const max = Math.max(e.length, i.length);
  const result: Array<{ ch: string; status: 'correct' | 'wrong' | 'missing' | 'extra' }> = [];
  for (let idx = 0; idx < max; idx++) {
    const ec = e[idx];
    const ic = i[idx];
    if (ec === undefined && ic !== undefined) {
      result.push({ ch: ic, status: 'extra' });
    } else if (ec !== undefined && ic === undefined) {
      result.push({ ch: ec, status: 'missing' });
    } else if (ec === ic) {
      result.push({ ch: ic, status: 'correct' });
    } else {
      result.push({ ch: ic ?? '', status: 'wrong' });
    }
  }
  return result;
}

function normalizeApostrophes(s: string) {
  return s.replace(/[’‘ʼ`＇]/g, "'");
}

interface TypingPracticeProps {
  startWord?: string;
}

export function TypingPractice({ startWord }: TypingPracticeProps) {
  const { state } = useWordbook();
  const [index, setIndex] = useState(0);
  const [practiceType, setPracticeType] = useState<'word' | 'sentence'>('word');
  const [question, setQuestion] = useState('');
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [diff, setDiff] = useState<ReturnType<typeof compareStrings>>([]);
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
  const [devToken, setDevToken] = useState<string>(() => localStorage.getItem('COZE_DEV_TOKEN') || '');
  const [devTokenInput, setDevTokenInput] = useState<string>(devToken);
  const [aiPack, setAiPack] = useState<AiSentenceItem[]>([]);
  const [aiIndex, setAiIndex] = useState(0);
  const [attemptCounts, setAttemptCounts] = useState<number[]>([]);
  const [revealHints, setRevealHints] = useState<boolean[]>([]);
  const [hintCount, setHintCount] = useState<number>(1);
  const loadAiSentencesRef = useRef(loadAiSentences);
  const [difficultyStage, setDifficultyStage] = useState(0);
  const DIFFICULTY = ['超简单难度', '简单难度', '普通难度', '困难难度'];
  

  const current = useMemo(() => state.words[index], [state.words, index]);
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
    if (!devToken) {
      setAiError('请先在下方设置AI token');
      return;
    }
    setPracticeType('sentence');
    setAiLoading(true);
    setAiError('');
    try {
      const useStage = stage ?? difficultyStage;
      const sents = await fetchAiExamples(current.word, 5, devToken, { force: true, hard: DIFFICULTY[useStage] });
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
    setInput('');
    setDiff([]);
    setChecking(false);
    setShowAnswer(false);
    if (practiceType === 'sentence') setDifficultyStage(0);
    const load = async () => {
      const base = practiceType === 'word'
        ? current?.meanings?.[0]?.definitions?.[0]?.definition || current?.word || ''
        : example || current?.word || '';
      const zh = await translateToChinese(base);
      setQuestion(zh);
    };
    if (current) load();
  }, [current, practiceType, example]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [index, checking, showAnswer, focusedIndex, practiceType]);

  useEffect(() => { loadAiSentencesRef.current = loadAiSentences; }, [loadAiSentences]);

  useEffect(() => {
    if (practiceType === 'sentence') {
      const init = expectedWords.map(() => '');
      setSentenceInputs(init);
      setLockedWords(expectedWords.map(() => false));
      setShakeWords(expectedWords.map(() => false));
      setAttemptCounts(expectedWords.map(() => 0));
      setRevealHints(expectedWords.map(() => false));
      setFocusedIndex(0);
    }
  }, [practiceType, expectedWords]);

  useEffect(() => {
    if (!startWord) return;
    const idx = state.words.findIndex(w => w.word.toLowerCase() === startWord.toLowerCase());
    if (idx >= 0) {
      setIndex(idx);
      setPracticeType('sentence');
    }
  }, [startWord, state.words]);

  useEffect(() => {
    if (!startWord) return;
    if (practiceType !== 'sentence') return;
    if (!current) return;
    if (current.word.toLowerCase() !== startWord.toLowerCase()) return;
    if (aiPack.length > 0 || aiLoading) return;
    loadAiSentencesRef.current(difficultyStage);
  }, [startWord, practiceType, current, aiPack.length, aiLoading, difficultyStage]);

  const onSubmit = async () => {
    if (!current) return;
    if (practiceType === 'word') {
      setChecking(true);
      const result = compareStrings(current.word, input);
      setDiff(result);
      const allCorrect = result.every((d) => d.status === 'correct');
      setWasWrong(!allCorrect);
    }
  };

  const proceedToNextSentence = async () => {
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
      const nextStage = Math.min(difficultyStage + 1, 3);
      setDifficultyStage(nextStage);
      await loadAiSentences(nextStage);
    }
  };

  const applyRandomHints = () => {
    if (practiceType !== 'sentence') return;
    const total = expectedWords.length;
    const n = Math.max(0, Math.min(hintCount, total));
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

  const onNext = () => {
    setIndex((prev) => (prev + 1) % Math.max(state.words.length, 1));
  };

  const speak = () => {
    if (!current) return;
    try {
      const expected = practiceType === 'word' ? current.word : (example || current.word);
      const utter = new SpeechSynthesisUtterance(expected);
      utter.lang = 'en-US';
      speechSynthesis.speak(utter);
    } catch (err) { void err; }
  };

  if (!current) {
    return (
      <div className="text-center py-12 text-gray-500">
        暂无单词，请先添加到单词本
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="text-2xl text-gray-800 mb-2">{question}</div>
        <div className="text-sm text-gray-500">{current.phonetic || '输入对应的英文单词，回车提交'}</div>
      </div>

      

      <div className="bg-white rounded-lg shadow p-8" onClick={() => inputRef.current?.focus()} tabIndex={0}>
        <div className="text-center mb-6">
          {practiceType === 'word' ? (
            showAnswer ? (
              <div className="text-3xl font-semibold text-blue-600 tracking-wide">{current.word}</div>
            ) : (
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setChecking(false);
                  setDiff([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSubmit();
                  } else if (wasWrong) {
                    setInput('');
                    setWasWrong(false);
                    setChecking(false);
                    setDiff([]);
                  }
                }}
                className="w-96 text-3xl tracking-wide text-purple-600 bg-transparent outline-none border-b-2 border-purple-400 px-2 py-1 text-center"
                style={{ caretColor: 'transparent' }}
                autoFocus
              />
            )
          ) : (
            showAnswer ? (
              <div className="text-3xl font-semibold text-blue-600 tracking-wide">{expectedWords.join(' ') || current.word}</div>
            ) : (
              <div className="flex flex-wrap items-end justify-center gap-4">
                {expectedWords.map((w, i) => (
                  <div
                    key={i}
                    className={`relative px-2 pb-1 border-b-2 ${focusedIndex === i ? 'border-purple-500' : 'border-purple-300'} min-w-[60px] whitespace-nowrap ${shakeWords[i] ? 'shake' : ''} h-12`}
                    style={{ width: `${Math.max(3, w.length) * 22}px` }}
                    onClick={() => setFocusedIndex(i)}
                  >
                    <div className="h-full flex items-center justify-center text-2xl tracking-wider text-center select-none leading-none">
                      {(sentenceInputs[i] || '').split('').map((ch, idx) => {
                        const expectedCh = normalizeApostrophes(w).toLowerCase()[idx];
                        const isCorrect = expectedCh !== undefined && expectedCh === normalizeApostrophes(ch).toLowerCase();
                        return (
                          <span key={idx} className={isCorrect ? 'text-green-600' : 'text-red-600'}>{ch}</span>
                        );
                      })}
                    </div>
                    {revealHints[i] && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 text-sm text-gray-400 text-center whitespace-nowrap pointer-events-none">{w}</div>
                    )}
                    <input
                      ref={focusedIndex === i ? inputRef : undefined}
                      value={sentenceInputs[i] || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        const expectedLower = normalizeApostrophes(w).toLowerCase();
                        // find first mismatch position
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
                          // 进入错误状态：累计一次并锁定该单元，仅允许退格修正
                          setAttemptCounts(prev => prev.map((p, idx2) => (idx2 === i ? p + 1 : p)));
                          const newVal = (attemptCounts[i] ?? 0) + 1;
                          if (newVal >= 3 && !revealHints[i]) {
                            setRevealHints(rprev => rprev.map((r, idx2) => (idx2 === i ? true : r)));
                          }
                          setLockedWords(prev => prev.map((p, idx2) => (idx2 === i ? true : p)));
                          setShakeWords(prev => prev.map((p, idx2) => (idx2 === i ? true : p)));
                          setTimeout(() => {
                            setShakeWords(prev => prev.map((p, idx2) => (idx2 === i ? false : p)));
                          }, 200);
                        } else {
                          // 错误修正，解除锁定
                          if (lockedWords[i]) {
                            setLockedWords(prev => prev.map((p, idx2) => (idx2 === i ? false : p)));
                          }
                        }
                        // auto-advance when this word is fully correct
                        const isCorrectFull = normalizeApostrophes(v).toLowerCase() === expectedLower && v.length === expectedLower.length;
                        if (isCorrectFull && i < expectedWords.length - 1) {
                          setFocusedIndex(Math.min(i + 1, expectedWords.length - 1));
                        }
                        
                      }}
                      onKeyDown={(e) => {
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
                            proceedToNextSentence();
                          } else {
                            setChecking(true);
                            setWasWrong(true);
                          }
                          return;
                        }
                        if (e.key === ' ') {
                          e.preventDefault();
                        }
                      }}
                      className="absolute inset-0 opacity-0"
                      autoFocus={i === 0}
                    />
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        

        {checking && practiceType === 'word' && (
          <div className="mt-6">
            

            <div className="text-xl">
              {diff.map((d, idx) => (
                <span
                  key={idx}
                  className={
                    d.status === 'correct'
                      ? 'text-gray-800'
                      : d.status === 'missing'
                      ? 'text-red-600 underline decoration-red-400'
                      : d.status === 'extra'
                      ? 'text-red-600 line-through'
                      : 'text-red-600'
                  }
                >
                  {d.ch}
                </span>
              ))}
            </div>

            <div className="text-sm text-gray-500 mt-2">正确答案：<span className="text-blue-700">{current.word}</span></div>
          </div>
        )}
      </div>
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPracticeType('word')}
            className={`flex items-center gap-2 px-3 py-2 rounded ${practiceType === 'word' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            <BookOpen className="w-4 h-4" /> 单词练习
          </button>
          <button
            onClick={() => setPracticeType('sentence')}
            disabled={expectedWords.length === 0}
            className={`flex items-center gap-2 px-3 py-2 rounded ${practiceType === 'sentence' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} ${expectedWords.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <MessageSquare className="w-4 h-4" /> 例句练习
          </button>
          <button
            onClick={() => loadAiSentences()}
            disabled={!current || aiLoading}
            className="flex items-center gap-2 px-3 py-2 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50"
          >
            获取随机AI例句
          </button>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            value={devTokenInput}
            onChange={(e) => setDevTokenInput(e.target.value)}
            placeholder="设置AI Token（仅本地）"
            className="w-80 px-3 py-2 border rounded"
          />
          <button
            onClick={() => { setDevToken(devTokenInput.trim()); localStorage.setItem('COZE_DEV_TOKEN', devTokenInput.trim()); setAiError(''); }}
            className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            保存
          </button>
        </div>
        {aiLoading && <div className="text-sm text-gray-500">正在获取AI例句...</div>}
        {aiError && <div className="text-sm text-red-600">{aiError}</div>}
        {checking && wasWrong && (
          <div className="flex items-center gap-2">
            <X className="w-6 h-6 text-red-600" />
            <span className="text-2xl text-red-700">有错误，请继续输入修正</span>
          </div>
        )}
        <div className="flex items-center justify-center gap-4">
          {practiceType === 'sentence' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={expectedWords.length || 0}
                value={hintCount}
                onChange={(e) => setHintCount(Number(e.target.value) || 0)}
                className="w-20 px-3 py-2 border rounded"
              />
              <button onClick={applyRandomHints} className="flex items-center gap-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">
                <Lightbulb className="w-4 h-4" /> 随机显示提示
              </button>
            </div>
          )}
          <button onClick={speak} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
            <Volume2 className="w-4 h-4" /> 播放发音
          </button>
          <button onClick={() => setShowAnswer((s) => !s)} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
            <Keyboard className="w-4 h-4" /> {showAnswer ? '隐藏答案' : '显示答案'}
          </button>
          <button onClick={() => { if (practiceType === 'sentence') { void proceedToNextSentence(); } else { onNext(); } }} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
            <SkipForward className="w-4 h-4" /> 下一题
          </button>
        </div>
      </div>
    </div>
  );
}
