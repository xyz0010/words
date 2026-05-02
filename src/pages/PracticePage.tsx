import { useLocation, useNavigate } from 'react-router-dom';
import { TypingPractice } from '../components/TypingPractice';
import { ArrowLeft } from 'lucide-react';
import { Passage } from '../types/practice';

export default function PracticePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialWord = location.state?.initialWord;
  const wordData = location.state?.wordData;
  const practiceMode = location.state?.practiceMode as 'word' | 'passage' | undefined;
  const passage = location.state?.passage as Passage | undefined;
  const title = practiceMode === 'passage' ? passage?.title || '短文学习' : '例句练习';

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 sm:mb-6 sm:text-base"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回</span>
        </button>

        <div className="mb-4 sm:mb-6">
          <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">{title}</h1>
          {practiceMode === 'passage' && passage?.description ? (
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{passage.description}</p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">根据中文提示，逐词输入英文内容完成练习。</p>
          )}
        </div>
        
        <div className="w-full">
          <TypingPractice
            startWord={initialWord}
            initialWordData={wordData}
            practiceMode={practiceMode}
            passage={passage}
          />
        </div>
      </div>
    </div>
  );
}
