import { WordSearch } from '../components/WordSearch';
import { WordbookManager } from '../components/WordbookManager';
import { BookOpen, Search as SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'search' | 'wordbook'>('search');

  return (
    <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <BookOpen className="w-8 h-8 text-blue-600" />
                背单词助手
              </h1>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    activeTab === 'search'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <SearchIcon className="w-4 h-4" />
                  单词查询
                </button>
                <button
                  onClick={() => setActiveTab('wordbook')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                    activeTab === 'wordbook'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  我的单词本
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-8">
          {activeTab === 'search' ? (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">查询单词</h2>
                <p className="text-gray-600">输入英文单词，获取详细释义和例句</p>
              </div>
              <WordSearch />
            </div>
          ) : (
            <div className="space-y-8">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-800 mb-4">单词本管理</h2>
                <p className="text-gray-600">查看、筛选和导出您收藏的单词</p>
              </div>
              <WordbookManager onPracticeWord={(word) => navigate('/practice', { state: { initialWord: word.word } })} />
            </div>
          )}
        </main>
      </div>
  );
}
