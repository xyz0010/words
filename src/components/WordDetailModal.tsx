import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { WordDefinition } from '../types/word';
import { searchWord } from '../services/dictionary';
import { useWordbook } from '../context/WordbookContext';
import { Volume2, Loader2, X, Bookmark, BookmarkCheck, BookOpen } from 'lucide-react';

interface WordDetailModalProps {
  word: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WordDetailModal({ word, isOpen, onClose }: WordDetailModalProps) {
  const [wordData, setWordData] = useState<WordDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { addWord, removeWord, isInWordbook } = useWordbook();

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

  const toggleBookmark = () => {
    if (!wordData) return;
    
    if (isInWordbook(wordData.word)) {
      removeWord(wordData.word);
    } else {
      addWord(wordData);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
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
        
        <div className="px-8 pb-8 -mt-12">
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
              {/* Header Area */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 -mx-8 -mt-0 px-8 py-8 border-b border-blue-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{wordData.word}</h2>
                    <div className="flex flex-col gap-2 mt-3">
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
                  </div>
                </div>
              </div>

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
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
