export type SelectedTextLearningConfig = {
  enabled: boolean;
  holdMs: number;
  autoSpeak: boolean;
  showOverlay: boolean;
  maxTextLength: number;
  restoreClipboard: boolean;
  dedupeWindowMs: number;
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

export type SelectedTextLearningRunResult = {
  detection?: EnglishDetectionResult;
  error?: string;
  ok: boolean;
  read?: SelectionReadResult;
  skipped?: boolean;
};

export type SelectedTextLearningPreparedSelection = {
  detection: EnglishDetectionResult;
  read: SelectionReadResult;
  text: string;
};

export type SelectedTextLearningStatus = {
  available: boolean;
  enabled: boolean;
  running: boolean;
};
