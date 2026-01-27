import type { RequestInit } from 'node-fetch';

export interface TTSOptions {
  text: string;
  fetchOptions?: Partial<RequestInit>;
}

export interface BaseTTS {
  textToSpeech(options: TTSOptions): Promise<Buffer | string>;
}
