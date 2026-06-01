import type { EnglishDetectionResult } from './types';

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g;
const LATIN_RE = /[A-Za-z]/g;
const ENGLISH_WORD_RE = /\b[A-Za-z][A-Za-z'-]{1,}\b/g;

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (/^\s*[{[][\s\S]*[}\]]\s*$/.test(trimmed)) return true;
  if (/^(import|export|const|let|var|function|class|interface|type)\s+/m.test(trimmed)) return true;
  const codeSymbols = countMatches(trimmed, /[{}()[\];=<>]/g);
  const visible = countMatches(trimmed, /\S/g);
  return visible > 0 && codeSymbols / visible > 0.18;
}

function looksLikePathOrUrl(text: string): boolean {
  const trimmed = text.trim();
  if (/^https?:\/\/\S+$/i.test(trimmed)) return true;
  if (/^[A-Za-z]:[\\/][\S ]+$/.test(trimmed)) return true;
  if (/^(?:\.{1,2}[\\/]|[~/])[\S ]+$/.test(trimmed)) return true;
  return false;
}

export function detectEnglishText(text: string, options: { maxLength?: number } = {}): EnglishDetectionResult {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const maxLength = options.maxLength ?? 2000;
  if (!normalizedText) return { confidence: 0, ok: false, reason: 'empty' };
  if (normalizedText.length < 3) return { confidence: 0, ok: false, reason: 'too-short' };
  if (normalizedText.length > maxLength) return { confidence: 0, ok: false, reason: 'too-long' };
  if (looksLikePathOrUrl(normalizedText)) return { confidence: 0.1, ok: false, reason: 'path-or-url' };
  if (looksLikeCode(normalizedText)) return { confidence: 0.2, ok: false, reason: 'code-like' };

  const visibleCount = Math.max(1, countMatches(normalizedText, /\S/g));
  const latinCount = countMatches(normalizedText, LATIN_RE);
  const cjkCount = countMatches(normalizedText, CJK_RE);
  const words = normalizedText.match(ENGLISH_WORD_RE) ?? [];
  const latinRatio = latinCount / visibleCount;
  const cjkRatio = cjkCount / visibleCount;
  const hasSentenceShape = /[.!?;:]($|\s)/.test(normalizedText) || words.length >= 3;

  let confidence = 0;
  if (latinCount >= 2) confidence += 0.25;
  if (words.length >= 1) confidence += 0.25;
  if (words.length >= 3) confidence += 0.15;
  if (latinRatio >= 0.55) confidence += 0.2;
  if (cjkRatio <= 0.2) confidence += 0.1;
  if (hasSentenceShape) confidence += 0.05;
  confidence = Math.min(1, confidence);

  if (latinCount < 2 || words.length < 1) return { confidence, ok: false, reason: 'not-enough-english' };
  if (latinRatio < 0.55) return { confidence, ok: false, reason: 'low-latin-ratio' };
  if (cjkRatio > 0.2) return { confidence, ok: false, reason: 'too-much-cjk' };
  if (confidence < 0.65) return { confidence, ok: false, reason: 'low-confidence' };

  return { confidence, normalizedText, ok: true };
}
