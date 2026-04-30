import { useLocation, useNavigate } from 'react-router-dom';
import { TypingPractice } from '../components/TypingPractice';
import { ArrowLeft } from 'lucide-react';

export default function PracticePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialWord = location.state?.initialWord;
  const wordData = location.state?.wordData;

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
        
        <div className="w-full">
          <TypingPractice startWord={initialWord} initialWordData={wordData} />
        </div>
      </div>
    </div>
  );
}
