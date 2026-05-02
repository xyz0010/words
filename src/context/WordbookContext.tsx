import { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import { WordbookState, WordDefinition, WordbookContextType } from '../types/word';
import {
  fetchWordbookWords,
  importLegacyWordbook,
  LEGACY_WORD_STORAGE_KEY,
  removeWordFromWordbook,
  saveWordToWordbook,
} from '../services/wordbook';

interface WordbookAction {
  type: string;
  payload?: any;
}

const initialState: WordbookState = {
  words: [],
  searchHistory: [],
  filter: {},
};

const HISTORY_STORAGE_KEY = 'wordbook_history';

// 取消默认示例词，避免覆盖用户本地收藏

function wordbookReducer(state: WordbookState, action: WordbookAction): WordbookState {
  switch (action.type) {
    case 'ADD_WORD':
      return {
        ...state,
        words: [{ ...action.payload, dateAdded: new Date().toISOString() }, ...state.words],
      };
    case 'REMOVE_WORD':
      return {
        ...state,
        words: state.words.filter(word => word.word.toLowerCase() !== action.payload.toLowerCase()),
      };
    case 'SET_FILTER':
      return {
        ...state,
        filter: { ...state.filter, ...action.payload },
      };
    case 'CLEAR_FILTER':
      return {
        ...state,
        filter: {},
      };
    case 'LOAD_DATA':
      return {
        ...state,
        words: action.payload.words || [],
        searchHistory: action.payload.searchHistory || state.searchHistory,
      };
    default:
      return state;
  }
}

const WordbookContext = createContext<WordbookContextType | undefined>(undefined);

export function WordbookProvider({ children }: { children: React.ReactNode }) {
  const hasLoadedRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [state, dispatch] = useReducer(wordbookReducer, initialState, (init) => {
    try {
      const historyRaw = localStorage.getItem(HISTORY_STORAGE_KEY);
      const searchHistory = historyRaw ? JSON.parse(historyRaw) : [];
      return {
        ...init,
        searchHistory: Array.isArray(searchHistory) ? searchHistory : [],
      };
    } catch {
      return init;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.searchHistory));
    } catch (error) {
      console.error('Failed to save search history to localStorage:', error);
    }
  }, [state.searchHistory]);

  const refreshWordbook = async () => {
    setIsSyncing(true);
    setSyncError('');

    try {
      const remoteWords = await fetchWordbookWords();
      if (remoteWords.length > 0) {
        dispatch({ type: 'LOAD_DATA', payload: { words: remoteWords } });
        localStorage.removeItem(LEGACY_WORD_STORAGE_KEY);
        return;
      }

      const wordsRaw = localStorage.getItem(LEGACY_WORD_STORAGE_KEY);
      const legacyWords = wordsRaw ? JSON.parse(wordsRaw) : [];
      if (Array.isArray(legacyWords) && legacyWords.length > 0) {
        const importedWords = await importLegacyWordbook(legacyWords);
        dispatch({ type: 'LOAD_DATA', payload: { words: importedWords } });
        localStorage.removeItem(LEGACY_WORD_STORAGE_KEY);
        return;
      }

      dispatch({ type: 'LOAD_DATA', payload: { words: [] } });
    } catch (error) {
      console.error('Failed to sync wordbook from server:', error);
      try {
        const wordsRaw = localStorage.getItem(LEGACY_WORD_STORAGE_KEY);
        const legacyWords = wordsRaw ? JSON.parse(wordsRaw) : [];
        dispatch({ type: 'LOAD_DATA', payload: { words: Array.isArray(legacyWords) ? legacyWords : [] } });
      } catch {
        dispatch({ type: 'LOAD_DATA', payload: { words: [] } });
      }
      setSyncError('单词本服务暂时不可用，当前显示的是本地数据。');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void refreshWordbook();
  }, []);

  const addWord = async (word: WordDefinition) => {
    if (state.words.some(w => w.word.toLowerCase() === word.word.toLowerCase())) return;
    setIsSyncing(true);
    setSyncError('');
    try {
      const savedWord = await saveWordToWordbook(word);
      dispatch({ type: 'ADD_WORD', payload: savedWord });
    } catch (error) {
      console.error('Failed to add word to server wordbook:', error);
      setSyncError('添加单词失败，请稍后重试。');
    } finally {
      setIsSyncing(false);
    }
  };

  const removeWord = async (word: string) => {
    setIsSyncing(true);
    setSyncError('');
    try {
      await removeWordFromWordbook(word);
      dispatch({ type: 'REMOVE_WORD', payload: word });
    } catch (error) {
      console.error('Failed to remove word from server wordbook:', error);
      setSyncError('移除单词失败，请稍后重试。');
    } finally {
      setIsSyncing(false);
    }
  };

  const isInWordbook = (word: string): boolean => {
    return state.words.some(w => w.word.toLowerCase() === word.toLowerCase());
  };

  const setFilter = (filter: Partial<WordbookState['filter']>) => {
    dispatch({ type: 'SET_FILTER', payload: filter });
  };

  const clearFilter = () => {
    dispatch({ type: 'CLEAR_FILTER' });
  };

  const value: WordbookContextType = {
    state,
    isSyncing,
    syncError,
    addWord,
    removeWord,
    isInWordbook,
    setFilter,
    clearFilter,
    refreshWordbook,
  };

  return <WordbookContext.Provider value={value}>{children}</WordbookContext.Provider>;
}

export function useWordbook() {
  const context = useContext(WordbookContext);
  if (context === undefined) {
    throw new Error('useWordbook must be used within a WordbookProvider');
  }
  return context;
}
