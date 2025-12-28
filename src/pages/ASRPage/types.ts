export interface RecognizedSegment {
  id?: number;
  text: string;
  start: number;
  end: number;
  translation?: string;
  isFinal?: boolean;
}

export interface WaveBar {
  x: number;
  y: number;
  height: number;
  width: number;
}
