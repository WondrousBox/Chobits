export type SelectedTextLearningConfig = {
  enabled: boolean;
  holdMs: number;
  autoSpeak: boolean;
  showOverlay: boolean;
  maxTextLength: number;
  restoreClipboard: boolean;
  dedupeWindowMs: number;
  providerId: string;
  preferredPresetId?: string;
  modelId?: string;
};

export type SelectedTextLearningConfigPatch = Partial<SelectedTextLearningConfig>;

export type SelectionReadResult = {
  elapsedMs: number;
  error?: string;
  restored: boolean;
  source: 'clipboard-copy';
  text: string;
};

export type EnglishDetectionResult = {
  confidence: number;
  normalizedText?: string;
  ok: boolean;
  reason?: string;
};

export type SelectedTextLearningResult = {
  explanation: string;
  keyWords: Array<{
    meaning: string;
    note?: string;
    word: string;
  }>;
  original: string;
  phrases: Array<{
    meaning: string;
    phrase: string;
  }>;
  translation: string;
  usageTips?: string[];
};

export type SelectedTextLearningRunResult = {
  detection?: EnglishDetectionResult;
  error?: string;
  explanation?: SelectedTextLearningResult;
  ok: boolean;
  read?: SelectionReadResult;
  skipped?: boolean;
};

export type SelectedTextLearningStatus = {
  available: boolean;
  enabled: boolean;
  running: boolean;
};
