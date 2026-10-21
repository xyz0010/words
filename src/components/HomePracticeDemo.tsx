import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Volume2 } from 'lucide-react';

type DemoItem = {
  scenario: string;
  translation: string;
  sentence: string;
};

const DEMO_ITEMS: DemoItem[] = [
  {
    scenario: '日常沟通',
    translation: '我昨天差点错过了火车。',
    sentence: 'I almost missed the train yesterday.',
  },
  {
    scenario: '社交互动',
    translation: '她总能让我放松下来。',
    sentence: 'She always makes me feel relaxed.',
  },
  {
    scenario: '休闲娱乐',
    translation: '这部电影比我想象中有意思。',
    sentence: 'The movie was more interesting than I expected.',
  },
];

export function HomePracticeDemo() {
  const [demoIndex, setDemoIndex] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const currentDemo = DEMO_ITEMS[demoIndex];
  const words = useMemo(() => currentDemo.sentence.split(' '), [currentDemo.sentence]);

  useEffect(() => {
    setRevealedCount(0);
    setIsCompleted(false);
  }, [demoIndex]);

  useEffect(() => {
    if (revealedCount < words.length) {
      const timer = window.setTimeout(() => {
        setRevealedCount((count) => count + 1);
      }, revealedCount === 0 ? 700 : 420);
      return () => window.clearTimeout(timer);
    }

    if (!isCompleted) {
      const timer = window.setTimeout(() => {
        setIsCompleted(true);
      }, 900);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setDemoIndex((index) => (index + 1) % DEMO_ITEMS.length);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [isCompleted, revealedCount, words.length]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-lg sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">动态演示</div>
          <div className="mt-1 text-xs text-slate-500">自动播放真实练习流程</div>
        </div>
        <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          AI 场景：{currentDemo.scenario}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-5 text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
          <Volume2 className="h-3.5 w-3.5 text-blue-500" />
          中文提示
        </div>
        <div className="mt-2 text-base font-medium leading-7 text-slate-800 sm:text-lg">
          {currentDemo.translation}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 px-4 py-5">
        <div className="flex flex-wrap justify-center gap-3">
          {words.map((word, idx) => {
            const isFilled = idx < revealedCount;
            const isNext = idx === revealedCount && !isCompleted;
            return (
              <div
                key={`${currentDemo.scenario}-${word}-${idx}`}
                className={`min-w-[3.8rem] rounded-lg border-b-2 px-2 py-2 text-center font-mono text-sm transition-all sm:text-base ${
                  isFilled
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : isNext
                      ? 'border-blue-400 bg-blue-50/80 text-blue-300'
                      : 'border-slate-300 text-slate-300'
                }`}
              >
                {isFilled ? word : '____'}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        <div className="text-xs text-slate-500 sm:text-sm">
          {isCompleted ? '已完成当前例句，准备切换下一个场景。' : '根据中文提示，逐词输入英文内容。'}
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
          }`}
        >
          {isCompleted ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              回答正确
            </>
          ) : (
            <>练习进行中</>
          )}
        </div>
      </div>
    </div>
  );
}
