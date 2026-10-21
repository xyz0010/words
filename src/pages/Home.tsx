import { WordSearch } from '../components/WordSearch';
import { WordbookManager } from '../components/WordbookManager';
import { PassageLibrary } from '../components/PassageLibrary';
import { AuthDialog } from '../components/AuthDialog';
import { ProfileCenter } from '../components/ProfileCenter';
import { HomePracticeDemo } from '../components/HomePracticeDemo';
import { useAuth } from '../context/AuthContext';
import { BookOpen, Search as SearchIcon, LogIn, LogOut, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isLoading } = useAuth();

  // Safari mobile keyboard jitter fix - only prevent elastic overscroll
  useEffect(() => {
    const preventOverscroll = () => {
      if (window.scrollY <= 0) {
        window.scrollTo(0, 1);
      }
    };
    
    document.addEventListener('touchmove', preventOverscroll, { passive: true });
    return () => document.removeEventListener('touchmove', preventOverscroll);
  }, []);
  const [activeTab, setActiveTab] = useState<'search' | 'wordbook' | 'passage' | 'profile'>(() => {
    const tab = location.state?.activeTab;
    return tab === 'search' || tab === 'wordbook' || tab === 'passage' || tab === 'profile' ? tab : 'search';
  });
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 overscroll-behavior-none">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="flex items-center gap-3 text-2xl font-bold text-gray-800 sm:text-3xl">
                    <BookOpen className="h-7 w-7 text-blue-600 sm:h-8 sm:w-8" />
                    AI例句练习
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 sm:text-base">先理解，再输入，再真正把单词用出来。</p>
                </div>

                <div className="flex flex-col gap-3 sm:items-end">
                  <div className="grid w-full grid-cols-4 rounded-lg bg-gray-100 p-1 sm:w-auto sm:min-w-[34rem]">
                    <button
                      onClick={() => setActiveTab('search')}
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors sm:px-4 ${
                        activeTab === 'search'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      <SearchIcon className="w-4 h-4" />
                      开始练习
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
                    <button
                      onClick={() => setActiveTab('profile')}
                      className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors sm:px-4 ${
                        activeTab === 'profile'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      <User className="w-4 h-4" />
                      个人中心
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center">
                    {user ? (
                      <>
                        <span className="rounded-full bg-slate-100 px-3 py-1">当前账号：{user.username}</span>
                        <button
                          onClick={() => void logout()}
                          disabled={isLoading}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <LogOut className="h-4 w-4" />
                          退出
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setIsAuthDialogOpen(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                      >
                        <LogIn className="h-4 w-4" />
                        登录 / 注册
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
          {activeTab === 'search' ? (
            <div className="space-y-6 sm:space-y-8">
              <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 sm:py-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    让单词从“认识”变成“会用”
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                    AI 生成真实场景例句，帮你把单词从认识练到会用
                  </p>
                </div>
                <div className="mt-5">
                  <WordSearch />
                </div>
              </div>

              <div className="mx-auto max-w-4xl">
                <HomePracticeDemo />
              </div>
            </div>
          ) : activeTab === 'wordbook' ? (
            <div className="space-y-6 sm:space-y-8">
              <div className="text-center">
                <h2 className="mb-3 text-xl font-semibold text-gray-800 sm:mb-4 sm:text-2xl">单词本管理</h2>
                <p className="text-sm text-gray-600 sm:text-base">查看、筛选和导出您收藏的单词</p>
              </div>
              <WordbookManager onPracticeWord={(word) => navigate('/practice', { state: { initialWord: word.word } })} />
            </div>
          ) : activeTab === 'passage' ? (
            <div className="space-y-6 sm:space-y-8">
              <div className="text-center">
                <h2 className="mb-3 text-xl font-semibold text-gray-800 sm:mb-4 sm:text-2xl">短文学习</h2>
                <p className="text-sm text-gray-600 sm:text-base">选择一篇短文，按照中文提示逐句输入英文内容</p>
              </div>
              <PassageLibrary />
            </div>
          ) : (
            <ProfileCenter />
          )}
        </main>

        <AuthDialog isOpen={isAuthDialogOpen} onClose={() => setIsAuthDialogOpen(false)} />
      </div>
  );
}
