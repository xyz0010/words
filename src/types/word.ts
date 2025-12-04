export interface WordDefinition {
  word: string;
  phonetic?: string;
  meanings: Meaning[];
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
  addWord: (word: WordDefinition) => void;
  removeWord: (word: string) => void;
  isInWordbook: (word: string) => boolean;
  setFilter: (filter: Partial<WordbookState['filter']>) => void;
  clearFilter: () => void;
}