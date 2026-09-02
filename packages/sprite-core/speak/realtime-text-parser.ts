export type RealtimeSpeechTextSegmentReason = 'sentence' | 'soft-boundary' | 'block-boundary' | 'max-chars' | 'finish';

export interface RealtimeSpeechTextParserOptions {
  minChars: number;
  maxChars: number;
  shouldFlushOnPunctuation: boolean;
}

export interface RealtimeSpeechTextSegment {
  text: string;
  reason: RealtimeSpeechTextSegmentReason;
  flush: boolean;
}

type Boundary = {
  end: number;
  reason: RealtimeSpeechTextSegmentReason;
  flush: boolean;
};

const DEFAULT_OPTIONS: RealtimeSpeechTextParserOptions = {
  shouldFlushOnPunctuation: true,
  maxChars: 80,
  minChars: 8
};

const BLOCK_BOUNDARY = '\n';
const CLOSING_QUOTES = new Set(['"', "'", '”', '’', '）', ')', '】', ']', '》', '」', '』']);
const END_PUNCTUATION = new Set(['。', '！', '？', '!', '?', '…']);
const LINE_END_PUNCTUATION = new Set(['～', '~']);
const SOFT_PUNCTUATION = new Set(['，', ',', '、', '；', ';', '：', ':']);
const SPEAKABLE_RE = /[0-9A-Za-z\u3040-\u30ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af]/;

function clampOptions(options?: Partial<RealtimeSpeechTextParserOptions>): RealtimeSpeechTextParserOptions {
  const minChars = Math.max(1, Math.round(options?.minChars ?? DEFAULT_OPTIONS.minChars));
  const maxChars = Math.max(minChars + 1, Math.round(options?.maxChars ?? DEFAULT_OPTIONS.maxChars));
  return {
    shouldFlushOnPunctuation: options?.shouldFlushOnPunctuation ?? DEFAULT_OPTIONS.shouldFlushOnPunctuation,
    maxChars,
    minChars
  };
}

function hasSpeakableText(text: string): boolean {
  return SPEAKABLE_RE.test(text);
}

function isAsciiWordChar(char: string | undefined): boolean {
  return !!char && /[0-9A-Za-z]/.test(char);
}

function shouldInsertSpace(previous: string, next: string): boolean {
  if (!previous || !next) return false;
  return isAsciiWordChar(previous[previous.length - 1]) && isAsciiWordChar(next[0]);
}

function trimOuterSpaces(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, '');
}

function normalizeMarkdownText(input: string): string {
  let text = input.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');

  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1 ');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/https?:\/\/\S+/gi, ' ');
  text = text.replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1');
  text = text.replace(/(^|\n)\s{0,3}>\s?/g, '$1');
  text = text.replace(/(^|\n)\s{0,3}(?:[-*+]|\d+[.)])\s+/g, '$1');
  text = text.replace(/(^|\n)\s{0,3}\[[ xX]\]\s+/g, '$1');
  text = text.replace(/(^|\n)\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*(?=\n|$)/g, '\n');
  text = text.replace(/`{1,3}/g, '');
  text = text.replace(/[*_~]{1,3}/g, '');
  text = text.replace(/\.{3,}/g, '…');
  text = text.replace(/\([^0-9A-Za-z\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{2,}\)/g, ' ');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/[ \t]*\n[ \t]*/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/\s+([，。！？、；：,.!?;:…])/g, '$1');
  text = text.replace(/([（(【「『])\s+/g, '$1');
  text = text.replace(/\s+([）)】」』])/g, '$1');

  return text;
}

function normalizeSegmentText(input: string): string {
  return normalizeMarkdownText(input).replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isEndPunctuation(text: string, index: number): boolean {
  const char = text[index];
  if (END_PUNCTUATION.has(char)) return true;
  if (char !== '.') return false;

  const previous = text[index - 1];
  const next = text[index + 1];
  if (previous && next && /\d/.test(previous) && /\d/.test(next)) return false;
  return !next || /\s/.test(next) || CLOSING_QUOTES.has(next);
}

function isLineEndPunctuation(text: string, index: number): boolean {
  const char = text[index];
  if (!LINE_END_PUNCTUATION.has(char)) return false;
  const next = text[index + 1];
  return !next || next === BLOCK_BOUNDARY || /\s/.test(next);
}

function expandBoundary(text: string, index: number): number {
  let end = index + 1;
  while (end < text.length) {
    const char = text[end];
    if (isEndPunctuation(text, end) || CLOSING_QUOTES.has(char)) {
      end += 1;
      continue;
    }
    break;
  }
  return end;
}

function findWhitespaceBoundary(text: string, maxEnd: number): number | undefined {
  for (let index = Math.min(maxEnd, text.length - 1); index >= 0; index -= 1) {
    if (/\s/.test(text[index])) {
      return index + 1;
    }
  }
  return undefined;
}

export class RealtimeSpeechTextParser {
  private readonly options: RealtimeSpeechTextParserOptions;
  private buffer = '';
  private inCodeFence = false;

  constructor(options?: Partial<RealtimeSpeechTextParserOptions>) {
    this.options = clampOptions(options);
  }

  append(input: string): RealtimeSpeechTextSegment[] {
    const normalized = this.normalizeInput(input);
    if (!normalized.trim() && !normalized.includes(BLOCK_BOUNDARY)) return [];

    const next = trimOuterSpaces(normalized);
    const separator = this.resolveAppendSeparator(next);
    this.buffer = this.buffer ? `${this.buffer}${separator}${next}` : next;
    return this.drain(false);
  }

  flush(): RealtimeSpeechTextSegment[] {
    return this.drain(false);
  }

  end(): RealtimeSpeechTextSegment[] {
    const segments = this.drain(false);
    const remaining = normalizeSegmentText(this.buffer);
    this.buffer = '';
    this.inCodeFence = false;
    if (hasSpeakableText(remaining)) {
      segments.push({
        flush: true,
        reason: 'finish',
        text: remaining
      });
    }
    return segments;
  }

  reset(): void {
    this.buffer = '';
    this.inCodeFence = false;
  }

  hasPendingText(): boolean {
    return hasSpeakableText(this.buffer);
  }

  private normalizeInput(input: string): string {
    const withoutCodeBlocks = this.stripCodeFenceBlocks(input);
    return normalizeMarkdownText(withoutCodeBlocks);
  }

  private resolveAppendSeparator(next: string): string {
    if (!this.buffer || !next) return '';
    if (this.buffer.endsWith(BLOCK_BOUNDARY) || next.startsWith(BLOCK_BOUNDARY)) return '';
    return shouldInsertSpace(this.buffer, next) ? ' ' : '';
  }

  private stripCodeFenceBlocks(input: string): string {
    const lines = input.replace(/\r\n?/g, '\n').split('\n');
    const kept: string[] = [];

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        this.inCodeFence = !this.inCodeFence;
        continue;
      }
      if (!this.inCodeFence) {
        kept.push(line);
      }
    }

    return kept.join('\n');
  }

  private drain(forceMax: boolean): RealtimeSpeechTextSegment[] {
    const segments: RealtimeSpeechTextSegment[] = [];

    while (this.buffer) {
      const boundary = this.findBoundary(forceMax);
      if (!boundary) break;

      const text = normalizeSegmentText(this.buffer.slice(0, boundary.end));
      this.buffer = this.buffer.slice(boundary.end).trimStart();

      if (hasSpeakableText(text)) {
        segments.push({
          flush: boundary.flush,
          reason: boundary.reason,
          text
        });
      }
    }

    return segments;
  }

  private findBoundary(forceMax: boolean): Boundary | undefined {
    const text = this.buffer;

    const blockIndex = text.indexOf(BLOCK_BOUNDARY);
    if (blockIndex >= 0) {
      return {
        end: blockIndex + 1,
        flush: true,
        reason: 'block-boundary'
      };
    }

    if (this.options.shouldFlushOnPunctuation) {
      for (let index = 0; index < text.length; index += 1) {
        if (isEndPunctuation(text, index) || isLineEndPunctuation(text, index)) {
          return {
            end: expandBoundary(text, index),
            flush: true,
            reason: 'sentence'
          };
        }
      }

      const softMin = Math.max(this.options.minChars, Math.min(24, Math.floor(this.options.maxChars * 0.4)));
      for (let index = 0; index < text.length; index += 1) {
        if (SOFT_PUNCTUATION.has(text[index]) && index + 1 >= softMin) {
          return {
            end: index + 1,
            flush: false,
            reason: 'soft-boundary'
          };
        }
      }
    }

    if (text.length < this.options.maxChars && !forceMax) {
      return undefined;
    }

    const maxEnd = Math.min(this.options.maxChars, text.length);
    if (this.options.shouldFlushOnPunctuation) {
      for (let index = maxEnd - 1; index >= this.options.minChars; index -= 1) {
        if (isEndPunctuation(text, index) || SOFT_PUNCTUATION.has(text[index])) {
          return {
            end: expandBoundary(text, index),
            flush: isEndPunctuation(text, index),
            reason: isEndPunctuation(text, index) ? 'sentence' : 'soft-boundary'
          };
        }
      }
    }

    const whitespaceBoundary = findWhitespaceBoundary(text, maxEnd);
    return {
      end: whitespaceBoundary && whitespaceBoundary >= this.options.minChars ? whitespaceBoundary : maxEnd,
      flush: false,
      reason: 'max-chars'
    };
  }
}
