import { WordSearch } from '../components/WordSearch';
import { WordbookManager } from '../components/WordbookManager';
import { PassageLibrary } from '../components/PassageLibrary';
import { BookOpen, Search as SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'search' | 'wordbook' | 'passage'>(() => {
    const tab = location.state?.activeTab;
    return tab === 'search' || tab === 'wordbook' || tab === 'passage' ? tab : 'search';
  });

  return (
    <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-800 sm:text-3xl">
                <BookOpen className="h-7 w-7 text-blue-600 sm:h-8 sm:w-8" />
                背单词助手
              </h1>
              <div className="grid w-full grid-cols-3 rounded-lg bg-gray-100 p-1 sm:w-auto sm:min-w-[26rem]">
                <button
                  onClick={() => setActiveTab('search')}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors sm:px-4 ${
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
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors sm:px-4 ${
                    activeTab === 'wordbook'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  我的单词本
                </button>
                <button
                  onClick={() => setActiveTab('passage')}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors sm:px-4 ${
                    activeTab === 'passage'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <BookOpen className="w-4 h-4" />
                  短文学习
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
          {activeTab === 'search' ? (
            <div className="space-y-6 sm:space-y-8">
              <div className="text-center">
                <h2 className="mb-3 text-xl font-semibold text-gray-800 sm:mb-4 sm:text-2xl">查询单词</h2>
                <p className="text-sm text-gray-600 sm:text-base">输入英文单词，获取详细释义和例句</p>
              </div>
              <WordSearch />
            </div>
          ) : activeTab === 'wordbook' ? (
            <div className="space-y-6 sm:space-y-8">
              <div className="text-center">
                <h2 className="mb-3 text-xl font-semibold text-gray-800 sm:mb-4 sm:text-2xl">单词本管理</h2>
                <p className="text-sm text-gray-600 sm:text-base">查看、筛选和导出您收藏的单词</p>
              </div>
              <WordbookManager onPracticeWord={(word) => navigate('/practice', { state: { initialWord: word.word } })} />
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-8">
              <div className="text-center">
                <h2 className="mb-3 text-xl font-semibold text-gray-800 sm:mb-4 sm:text-2xl">短文学习</h2>
                <p className="text-sm text-gray-600 sm:text-base">选择一篇短文，按照中文提示逐句输入英文内容</p>
              </div>
              <PassageLibrary />
            </div>
          )}
        </main>
      </div>
  );
}
