export type ProfileStats = {
  userId: string;
  todayLocalDate: string;
  todaySentencesCompleted: number;
  totalSentencesCompleted: number;
  totalPracticeDays: number;
  streakDays: number;
  favoriteSentenceCount: number;
  updatedAt: string;
};

export type PracticeSource = 'ai' | 'passage';

export type PracticeRecord = {
  id: string;
  sentence: string;
  translation?: string;
  source: PracticeSource;
  word?: string;
  passageId?: string;
  scenario?: string;
  durationMs?: number;
  localDate: string;
  completedAt: string;
};

export type FavoriteSentence = {
  id: string;
  sentence: string;
  translation?: string;
  source: PracticeSource;
  word?: string;
  passageId?: string;
  scenario?: string;
  createdAt: string;
};

export type MistakeStat = {
  word: string;
  count: number;
  lastAt?: string;
};
