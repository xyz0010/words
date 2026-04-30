import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchWord } from '../services/dictionary';
import { useWordbook } from '../context/WordbookContext';
import { WordDefinition } from '../types/word';
import { Search, Bookmark, BookmarkCheck, BookOpen, Volume2, Loader2 } from 'lucide-react';

interface WordSearchProps {
  onWordFound?: (word: WordDefinition) => void;
}

export function WordSearch({ onWordFound }: WordSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [wordData, setWordData] = useState<WordDefinition | null>(null);
  
  const { addWord, removeWord, isInWordbook } = useWordbook();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // 当查询结束且成功获取数据时，全选输入框
  useEffect(() => {
    if (!isLoading && wordData && inputRef.current) {
      // 稍微延迟一下确保 input 已经解除 disabled 状态
      const timer = setTimeout(() => {
        inputRef.current?.select();
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [isLoading, wordData]);

  const playAudio = (url: string) => {
    try {
      const audio = new Audio(url);
      audio.play().catch(e => console.error('Audio play failed:', e));
    } catch (e) {
      console.error('Audio error:', e);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setError('');
    setWordData(null);

    try {
      const result = await searchWord(searchTerm.trim());
      setWordData(result);
      onWordFound?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search word');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBookmark = () => {
    if (!wordData) return;
    
    if (isInWordbook(wordData.word)) {
      removeWord(wordData.word);
    } else {
      addWord(wordData);
    }
  };

  const handlePractice = () => {
    if (!wordData) return;
    navigate('/practice', { state: { initialWord: wordData.word, wordData } });
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-5 sm:space-y-6">
      <form onSubmit={handleSearch} className="group">
        <div className="transform transition-all duration-200 group-hover:-translate-y-0.5">
          <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="输入要查询的单词..."
            className="w-full rounded-2xl border-2 border-slate-200 bg-white py-4 pl-12 pr-4 text-base shadow-sm transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 sm:pl-14 sm:pr-32 sm:text-lg"
            disabled={isLoading}
          />
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-slate-400 transition-colors group-focus-within:text-blue-500 sm:left-5 sm:h-6 sm:w-6" />
          </div>
          <button
            type="submit"
            disabled={isLoading || !searchTerm.trim()}
            className="mt-3 flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-md transition-all active:scale-95 hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none sm:absolute sm:right-3 sm:top-1/2 sm:mt-0 sm:w-auto sm:-translate-y-1/2 sm:py-2"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>查询中</span>
              </div>
            ) : '查询'}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center animate-in fade-in slide-in-from-top-2">
          <span className="mr-2">⚠️</span> {error}
        </div>
      )}

      {wordData && (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
           {/* Header Area */}
           <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-5 sm:px-8 sm:py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                      <h2 className="break-words text-3xl font-bold tracking-tight text-slate-800 sm:text-4xl">{wordData.word}</h2>
                      <div className="mt-2 flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            {wordData.phonetic && (
                              <span className="break-all rounded-md border border-slate-200 bg-white px-3 py-1 font-mono text-sm text-slate-500 shadow-sm">
                                  {wordData.phonetic}
                              </span>
                            )}
                            {wordData.audio?.us && (
                              <button 
                                onClick={() => playAudio(wordData.audio!.us!)}
                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                                title="美式发音"
                              >
                                <Volume2 className="w-4 h-4" />
                                <span className="sr-only">美式发音</span>
                              </button>
                            )}
                            {wordData.audio?.uk && (
                              <button 
                                onClick={() => playAudio(wordData.audio!.uk!)}
                                className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-colors"
                                title="英式发音"
                              >
                                <Volume2 className="w-4 h-4" />
                                <span className="text-[10px] font-bold ml-0.5">UK</span>
                              </button>
                            )}
                          </div>
                          {/* Word Forms */}
                          {wordData.wfs && wordData.wfs.length > 0 && (
                             <div className="mt-1 flex flex-wrap gap-2 text-sm text-slate-600">
                                {wordData.wfs.map((wf, i) => (
                                    <span key={i} className="break-all rounded border border-slate-200/50 bg-white/60 px-2 py-0.5">{wf}</span>
                                ))}
                             </div>
                          )}
                      </div>
                  </div>
                  <div className="flex w-full gap-3 sm:w-auto">
                      <button
                        onClick={toggleBookmark}
                        className={`flex flex-1 items-center justify-center rounded-xl border p-3 shadow-sm transition-all duration-200 sm:flex-none ${
                          isInWordbook(wordData.word)
                            ? 'bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-200'
                            : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                        }`}
                        title={isInWordbook(wordData.word) ? '从单词本移除' : '添加到单词本'}
                      >
                        {isInWordbook(wordData.word) ? (
                          <BookmarkCheck className="w-6 h-6" />
                        ) : (
                          <Bookmark className="w-6 h-6" />
                        )}
                      </button>
                      <button
                        onClick={handlePractice}
                        className="flex flex-1 items-center justify-center rounded-xl border border-green-200 bg-green-50 p-3 text-green-600 shadow-sm transition-all hover:border-green-300 hover:bg-green-100 sm:flex-none"
                        title="进入例句练习"
                      >
                        <BookOpen className="w-6 h-6" />
                      </button>
                  </div>
              </div>
           </div>

           {/* Content Area */}
           <div className="space-y-6 p-4 sm:space-y-8 sm:p-8">
               {/* Basic Meanings */}
               <div className="space-y-5 sm:space-y-6">
                   {wordData.meanings.filter(m => m.partOfSpeech !== '网络释义').map((meaning, i) => (
                       <div key={i} className="group flex flex-col gap-3 sm:flex-row sm:gap-4">
                           <div className="flex-shrink-0 sm:w-16 sm:pt-1">
                               <span className="inline-block rounded-md bg-blue-100 px-2 py-1 text-center text-xs font-bold uppercase tracking-wider text-blue-700 sm:w-full">
                                   {meaning.partOfSpeech}
                               </span>
                           </div>
                           <div className="flex-grow space-y-3">
                               {meaning.definitions.map((def, j) => (
                                   <div key={j} className="break-words text-slate-700 leading-relaxed">
                                       <span className="mb-1 block text-base font-medium sm:text-lg">{def.definition}</span>
                                       {def.example && (
                                           <div className="break-words border-l-2 border-slate-200 py-1 pl-3 text-sm italic text-slate-500 sm:pl-4">
                                               {def.example}
                                           </div>
                                       )}
                                   </div>
                               ))}
                           </div>
                       </div>
                   ))}
               </div>

               {/* Examples */}
               {wordData.examples && wordData.examples.length > 0 && (
                   <div className="mt-6 border-t border-slate-100 pt-6 sm:mt-8 sm:pt-8">
                       <h3 className="mb-4 flex items-center gap-3 text-center text-xs font-bold uppercase tracking-wider text-slate-400 sm:mb-6">
                           <span className="h-px flex-1 bg-slate-100"></span>
                           双语例句
                           <span className="h-px flex-1 bg-slate-100"></span>
                       </h3>
                       <div className="space-y-4">
                           {wordData.examples.slice(0, 5).map((ex, i) => (
                               <div key={i} className="group relative border-l-2 border-slate-200 pl-4 transition-colors hover:border-blue-400">
                                   <p className="break-words text-slate-700 mb-1">{ex.sentence}</p>
                                   <p className="break-words text-sm text-slate-500">{ex.translation}</p>
                               </div>
                           ))}
                       </div>
                   </div>
               )}

               {/* Network Definitions */}
               {wordData.meanings.some(m => m.partOfSpeech === '网络释义') && (
                   <div className="mt-6 border-t border-slate-100 pt-6 sm:mt-8 sm:pt-8">
                       <h3 className="mb-4 flex items-center gap-3 text-center text-xs font-bold uppercase tracking-wider text-slate-400 sm:mb-6">
                           <span className="h-px flex-1 bg-slate-100"></span>
                           网络释义
                           <span className="h-px flex-1 bg-slate-100"></span>
                       </h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {wordData.meanings.filter(m => m.partOfSpeech === '网络释义').flatMap(m => m.definitions).map((def, k) => (
                               <div key={k} className="break-words rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 transition-all duration-200 hover:border-slate-200 hover:bg-white hover:shadow-md">
                                   {def.definition}
                               </div>
                           ))}
                       </div>
                   </div>
               )}
           </div>
        </div>
      )}
    </div>
  );
}
