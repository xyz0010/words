import { useLocation, useNavigate } from 'react-router-dom';
import { TypingPractice } from '../components/TypingPractice';
import { ArrowLeft } from 'lucide-react';

export default function PracticePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialWord = location.state?.initialWord;
  const wordData = location.state?.wordData;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回</span>
        </button>
        
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <TypingPractice startWord={initialWord} initialWordData={wordData} />
        </div>
      </div>
    </div>
  );
}
