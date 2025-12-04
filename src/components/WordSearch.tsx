import { useState } from 'react';
import { searchWord } from '../services/dictionary';
import { useWordbook } from '../context/WordbookContext';
import { WordDefinition } from '../types/word';
import { Search, Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';

interface WordSearchProps {
  onWordFound?: (word: WordDefinition) => void;
}

export function WordSearch({ onWordFound }: WordSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [wordData, setWordData] = useState<WordDefinition | null>(null);
  
  const { addWord, removeWord, isInWordbook } = useWordbook();

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

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="输入要查询的单词..."
            className="w-full px-4 py-3 pl-12 text-lg border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 transition-colors"
            disabled={isLoading}
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <button
            type="submit"
            disabled={isLoading || !searchTerm.trim()}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '查询'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {wordData && (
        <div className="bg-white rounded-lg shadow-lg p-6 border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{wordData.word}</h2>
              {wordData.phonetic && (
                <p className="text-gray-600 italic">{wordData.phonetic}</p>
              )}
            </div>
            <button
              onClick={toggleBookmark}
              className={`p-2 rounded-full transition-colors ${
                isInWordbook(wordData.word)
                  ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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

          <div className="space-y-4">
            {wordData.meanings.map((meaning, index) => (
              <div key={index} className="border-l-4 border-blue-200 pl-4">
                <h3 className="font-semibold text-blue-700 mb-2 capitalize">
                  {meaning.partOfSpeech}
                </h3>
                <ul className="space-y-2">
                  {meaning.definitions.map((definition, defIndex) => (
                    <li key={defIndex} className="text-gray-700">
                      <p className="mb-1">{definition.definition}</p>
                      {definition.example && (
                        <p className="text-gray-500 italic text-sm ml-4">
                          例: {definition.example}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}