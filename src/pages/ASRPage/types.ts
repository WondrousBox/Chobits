export interface RecognizedSegment {
  text: string;
  start: number;
  end: number;
  translation?: string;
}

export interface WaveBar {
  x: number;
  y: number;
  height: number;
  width: number;
}
