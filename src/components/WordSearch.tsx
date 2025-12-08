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
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <form onSubmit={handleSearch} className="relative group">
        <div className="relative transform transition-all duration-200 group-hover:-translate-y-0.5">
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="输入要查询的单词..."
            className="w-full px-6 py-4 pl-14 text-lg bg-white border-2 border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-400"
            disabled={isLoading}
          />
          <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-slate-400 w-6 h-6 group-focus-within:text-blue-500 transition-colors" />
          <button
            type="submit"
            disabled={isLoading || !searchTerm.trim()}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 px-6 py-2 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none active:scale-95"
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
           <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-8 py-6 border-b border-blue-100">
              <div className="flex justify-between items-start">
                  <div>
                      <h2 className="text-4xl font-bold text-slate-800 tracking-tight">{wordData.word}</h2>
                      <div className="flex flex-col gap-2 mt-2">
                          <div className="flex items-center gap-3">
                            {wordData.phonetic && (
                              <span className="font-mono text-slate-500 bg-white px-3 py-1 rounded-md border border-slate-200 text-sm shadow-sm">
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
                             <div className="flex flex-wrap gap-2 text-sm text-slate-600 mt-1">
                                {wordData.wfs.map((wf, i) => (
                                    <span key={i} className="bg-white/60 px-2 py-0.5 rounded border border-slate-200/50">{wf}</span>
                                ))}
                             </div>
                          )}
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button
                        onClick={toggleBookmark}
                        className={`p-3 rounded-xl transition-all duration-200 shadow-sm border ${
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
                        className="p-3 rounded-xl bg-green-50 text-green-600 border border-green-200 hover:bg-green-100 hover:border-green-300 transition-all shadow-sm"
                        title="进入例句练习"
                      >
                        <BookOpen className="w-6 h-6" />
                      </button>
                  </div>
              </div>
           </div>

           {/* Content Area */}
           <div className="p-8 space-y-8">
               {/* Basic Meanings */}
               <div className="space-y-6">
                   {wordData.meanings.filter(m => m.partOfSpeech !== '网络释义').map((meaning, i) => (
                       <div key={i} className="flex gap-4 group">
                           <div className="flex-shrink-0 w-16 pt-1">
                               <span className="inline-block w-full text-center px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-bold uppercase tracking-wider">
                                   {meaning.partOfSpeech}
                               </span>
                           </div>
                           <div className="flex-grow space-y-3">
                               {meaning.definitions.map((def, j) => (
                                   <div key={j} className="text-slate-700 leading-relaxed">
                                       <span className="font-medium text-lg block mb-1">{def.definition}</span>
                                       {def.example && (
                                           <div className="text-slate-500 italic pl-4 border-l-2 border-slate-200 text-sm py-1">
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
                   <div className="border-t border-slate-100 pt-8 mt-8">
                       <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-3">
                           <span className="h-px flex-1 bg-slate-100"></span>
                           双语例句
                           <span className="h-px flex-1 bg-slate-100"></span>
                       </h3>
                       <div className="space-y-4">
                           {wordData.examples.slice(0, 5).map((ex, i) => (
                               <div key={i} className="group relative pl-4 border-l-2 border-slate-200 hover:border-blue-400 transition-colors">
                                   <p className="text-slate-700 mb-1">{ex.sentence}</p>
                                   <p className="text-slate-500 text-sm">{ex.translation}</p>
                               </div>
                           ))}
                       </div>
                   </div>
               )}

               {/* Network Definitions */}
               {wordData.meanings.some(m => m.partOfSpeech === '网络释义') && (
                   <div className="border-t border-slate-100 pt-8 mt-8">
                       <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-3">
                           <span className="h-px flex-1 bg-slate-100"></span>
                           网络释义
                           <span className="h-px flex-1 bg-slate-100"></span>
                       </h3>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {wordData.meanings.filter(m => m.partOfSpeech === '网络释义').flatMap(m => m.definitions).map((def, k) => (
                               <div key={k} className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm text-slate-600 hover:bg-white hover:shadow-md hover:border-slate-200 transition-all duration-200">
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