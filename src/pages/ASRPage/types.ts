export interface RecognizedSegment {
  id?: number;
  text: string;
  start: number;
  end: number;
  translation?: string;
  isFinal?: boolean;
}

// 标点符号拆分后的片段
export interface PunctuationSegment {
  text: string;
  tokens: string[];
  timestamps: number[];
  punctuation: string | null;
  start_time: number;
}

// 临时展示的片段（未到 endpoint）
export interface PendingSegment {
  text: string;
  start: number;
  end: number;
  isPending: true;
}

export interface WaveBar {
  x: number;
  y: number;
  height: number;
  width: number;
}
