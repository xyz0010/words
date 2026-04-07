import { useState } from 'react';
import { WordDefinition } from '../types/word';
import { useWordbook } from '../context/WordbookContext';
import { Download, Filter, X, MessageSquare, ArrowDownAZ, ArrowUpAZ, Calendar } from 'lucide-react';

interface WordbookManagerProps {
  onPracticeWord?: (word: WordDefinition) => void;
}

export function WordbookManager({ onPracticeWord }: WordbookManagerProps) {
  const { state, removeWord, setFilter, clearFilter } = useWordbook();
  const [showFilters, setShowFilters] = useState(false);
  const [sortType, setSortType] = useState<'date_desc' | 'date_asc' | 'az' | 'za'>('date_desc');

  const filteredWords = state.words.filter(word => {
    if (state.filter.searchTerm) {
      const searchTerm = state.filter.searchTerm.toLowerCase();
      if (!word.word.toLowerCase().includes(searchTerm)) {
        return false;
      }
    }

    if (state.filter.dateFrom) {
      const wordDate = new Date(word.dateAdded || '');
      const filterDate = new Date(state.filter.dateFrom);
      if (wordDate < filterDate) {
        return false;
      }
    }

    if (state.filter.dateTo) {
      const wordDate = new Date(word.dateAdded || '');
      const filterDate = new Date(state.filter.dateTo);
      if (wordDate > filterDate) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    switch (sortType) {
      case 'date_desc':
        return new Date(b.dateAdded || 0).getTime() - new Date(a.dateAdded || 0).getTime();
      case 'date_asc':
        return new Date(a.dateAdded || 0).getTime() - new Date(b.dateAdded || 0).getTime();
      case 'az':
        return a.word.localeCompare(b.word);
      case 'za':
        return b.word.localeCompare(a.word);
      default:
        return 0;
    }
  });

  const exportToCSV = () => {
    const headers = ['单词', '音标', '词性', '定义', '添加日期'];
    const rows = filteredWords.map(word => {
      const meanings = word.meanings.map(m => 
        `${m.partOfSpeech}: ${m.definitions.map(d => d.definition).join('; ')}`
      ).join(' | ');
      
      return [
        word.word,
        word.phonetic || '',
        meanings,
        word.dateAdded ? new Date(word.dateAdded).toLocaleDateString('zh-CN') : ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `单词本_${new Date().toLocaleDateString('zh-CN')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToTXT = () => {
    const content = filteredWords.map(word => {
      const meanings = word.meanings.map(m => 
        `  ${m.partOfSpeech}: ${m.definitions.map(d => d.definition).join('; ')}`
      ).join('\n');
      
      return `${word.word} ${word.phonetic || ''}\n${meanings}\n添加日期: ${word.dateAdded ? new Date(word.dateAdded).toLocaleDateString('zh-CN') : ''}\n`;
    }).join('\n---\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `单词本_${new Date().toLocaleDateString('zh-CN')}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">我的单词本</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-1 mr-2">
              <button
                onClick={() => setSortType('date_desc')}
                className={`p-1.5 rounded-md transition-colors ${sortType === 'date_desc' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="按时间倒序"
              >
                <Calendar className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSortType('date_asc')}
                className={`p-1.5 rounded-md transition-colors ${sortType === 'date_asc' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="按时间正序"
              >
                <Calendar className="w-4 h-4 rotate-180" />
              </button>
              <button
                onClick={() => setSortType('az')}
                className={`p-1.5 rounded-md transition-colors ${sortType === 'az' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="按字母 A-Z"
              >
                <ArrowDownAZ className="w-4 h-4" />
              </button>
              <button
                onClick={() => setSortType('za')}
                className={`p-1.5 rounded-md transition-colors ${sortType === 'za' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                title="按字母 Z-A"
              >
                <ArrowUpAZ className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                showFilters ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Filter className="w-4 h-4" />
              筛选
            </button>
            <button
              onClick={exportToCSV}
              disabled={filteredWords.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              导出CSV
            </button>
            <button
              onClick={exportToTXT}
              disabled={filteredWords.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              导出TXT
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">搜索单词</label>
                <input
                  type="text"
                  placeholder="输入单词..."
                  value={state.filter.searchTerm || ''}
                  onChange={(e) => setFilter({ searchTerm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
                <input
                  type="date"
                  value={state.filter.dateFrom || ''}
                  onChange={(e) => setFilter({ dateFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
                <input
                  type="date"
                  value={state.filter.dateTo || ''}
                  onChange={(e) => setFilter({ dateTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={clearFilter}
                className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                <X className="w-4 h-4" />
                清除筛选
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 text-sm text-gray-600">
          共 {filteredWords.length} 个单词
        </div>

        {filteredWords.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg">暂无单词</p>
            <p className="text-sm mt-2">在首页查询单词并添加到单词本</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredWords.map((word) => (
              <div key={word.word} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-800">{word.word}</h3>
                    {word.phonetic && (
                      <p className="text-gray-600 italic text-sm">{word.phonetic}</p>
                    )}
                    <div className="mt-2 space-y-1">
                      {word.meanings.slice(0, 2).map((meaning, index) => (
                        <div key={index} className="text-sm">
                          <span className="font-medium text-blue-700 capitalize">{meaning.partOfSpeech}</span>
                          <span className="text-gray-600 ml-2">{meaning.definitions[0]?.definition}</span>
                        </div>
                      ))}
                    </div>
                    {word.dateAdded && (
                      <p className="text-xs text-gray-500 mt-2">
                        添加于 {new Date(word.dateAdded).toLocaleDateString('zh-CN')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => onPracticeWord?.(word)}
                      className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors flex items-center gap-1"
                    >
                      <MessageSquare className="w-4 h-4" /> 例句练习
                    </button>
                    <button
                      onClick={() => removeWord(word.word)}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                    >
                      移除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}