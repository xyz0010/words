import { createContext, useContext, useReducer, useEffect } from 'react';
import { WordbookState, WordDefinition, WordbookContextType } from '../types/word';

interface WordbookAction {
  type: string;
  payload?: any;
}

const initialState: WordbookState = {
  words: [],
  searchHistory: [],
  filter: {},
};

const WORD_STORAGE_KEY = 'wordbook_words';
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
        searchHistory: action.payload.searchHistory || [],
      };
    default:
      return state;
  }
}

const WordbookContext = createContext<WordbookContextType | undefined>(undefined);

export function WordbookProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(wordbookReducer, initialState, (init) => {
    try {
      const wordsRaw = localStorage.getItem(WORD_STORAGE_KEY);
      const historyRaw = localStorage.getItem(HISTORY_STORAGE_KEY);
      const words = wordsRaw ? JSON.parse(wordsRaw) : [];
      const searchHistory = historyRaw ? JSON.parse(historyRaw) : [];
      return {
        ...init,
        words: Array.isArray(words) ? words : [],
        searchHistory: Array.isArray(searchHistory) ? searchHistory : [],
      };
    } catch {
      return init;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(WORD_STORAGE_KEY, JSON.stringify(state.words));
    } catch (error) {
      console.error('Failed to save words to localStorage:', error);
    }
  }, [state.words]);

  

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.searchHistory));
    } catch (error) {
      console.error('Failed to save search history to localStorage:', error);
    }
  }, [state.searchHistory]);

  const addWord = (word: WordDefinition) => {
    if (!state.words.some(w => w.word.toLowerCase() === word.word.toLowerCase())) {
      dispatch({ type: 'ADD_WORD', payload: word });
    }
  };

  const removeWord = (word: string) => {
    dispatch({ type: 'REMOVE_WORD', payload: word });
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
    addWord,
    removeWord,
    isInWordbook,
    setFilter,
    clearFilter,
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
