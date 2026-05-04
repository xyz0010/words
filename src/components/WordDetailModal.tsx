import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { WordDefinition } from '../types/word';
import { searchWord } from '../services/dictionary';
import { useWordbook } from '../context/WordbookContext';
import { Volume2, Loader2, X, Bookmark, BookmarkCheck } from 'lucide-react';

interface WordDetailModalProps {
  word: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WordDetailModal({ word, isOpen, onClose }: WordDetailModalProps) {
  const [wordData, setWordData] = useState<WordDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { addWord, removeWord, isInWordbook, isSyncing, syncError } = useWordbook();

  useEffect(() => {
    if (isOpen && word) {
      const fetchWord = async () => {
        setLoading(true);
        setError('');
        try {
          const data = await searchWord(word);
          setWordData(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : '查询失败');
        } finally {
          setLoading(false);
        }
      };
      fetchWord();
    } else {
      setWordData(null);
    }
  }, [isOpen, word]);

  const playAudio = (url: string) => {
    try {
      const audio = new Audio(url);
      audio.play().catch(e => console.error('Audio play failed:', e));
    } catch (e) {
      console.error('Audio error:', e);
    }
  };

  const toggleBookmark = async () => {
    if (!wordData) return;
    
    if (isInWordbook(wordData.word)) {
      await removeWord(wordData.word);
    } else {
      await addWord(wordData);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div 
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 overscroll-behavior-none"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 right-0 z-10 flex justify-end p-4 bg-gradient-to-b from-white to-transparent pointer-events-none">
           <button 
             onClick={onClose}
             className="p-2 bg-white/80 backdrop-blur rounded-full hover:bg-slate-100 transition-colors pointer-events-auto shadow-sm border border-slate-100"
           >
             <X className="w-5 h-5 text-slate-500" />
           </button>
        </div>
        
        <div className="-mt-12 px-4 pb-4 sm:px-8 sm:pb-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p>正在查询...</p>
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <p className="text-red-600 font-medium">{error}</p>
            </div>
          ) : wordData ? (
            <div className="space-y-8">
              {syncError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {syncError}
                </div>
              )}
              {/* Header Area */}
              <div className="-mx-4 -mt-0 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-6 sm:-mx-8 sm:px-8 sm:py-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">{wordData.word}</h2>
                    <div className="mt-3 flex flex-col gap-2">
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
                      onClick={() => void toggleBookmark()}
                      disabled={isSyncing}
                      className={`flex flex-1 items-center justify-center rounded-xl border p-3 shadow-sm transition-all duration-200 sm:flex-none ${
                        isInWordbook(wordData.word)
                          ? 'bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-200'
                          : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                      } ${isSyncing ? 'cursor-not-allowed opacity-60' : ''}`}
                      title={isInWordbook(wordData.word) ? '从单词本移除' : '添加到单词本'}
                    >
                      {isInWordbook(wordData.word) ? (
                        <BookmarkCheck className="w-6 h-6" />
                      ) : (
                        <Bookmark className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

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
                        <p className="break-words mb-1 text-slate-700">{ex.sentence}</p>
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
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
