export interface WordDefinition {
  word: string;
  phonetic?: string;
  audio?: {
    us?: string;
    uk?: string;
  };
  meanings: Meaning[];
  wfs?: string[];
  examples?: {
    sentence: string;
    translation: string;
  }[];
  dateAdded?: string;
}

export interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
}

export interface Definition {
  definition: string;
  example?: string;
}

export interface WordbookState {
  words: WordDefinition[];
  searchHistory: string[];
  filter: {
    dateFrom?: string;
    dateTo?: string;
    searchTerm?: string;
  };
}

export interface WordbookContextType {
  state: WordbookState;
  isSyncing: boolean;
  syncError: string;
  addWord: (word: WordDefinition) => Promise<void>;
  removeWord: (word: string) => Promise<void>;
  isInWordbook: (word: string) => boolean;
  setFilter: (filter: Partial<WordbookState['filter']>) => void;
  clearFilter: () => void;
  refreshWordbook: () => Promise<void>;
}
