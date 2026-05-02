export interface PracticeSentence {
  sentence: string;
  translation?: string;
}

export interface Passage {
  id: string;
  title: string;
  level: string;
  topic: string;
  description: string;
  sentences: PracticeSentence[];
  source?: 'builtin' | 'custom';
  createdAt?: string;
}
