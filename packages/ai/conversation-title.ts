export const DEFAULT_CONVERSATION_TITLE_MAX_LENGTH = 30;

const TITLE_EDGE_QUOTES_REGEX = /^["'“”‘’\u300c\u300d]+|["'“”‘’\u300c\u300d]+$/g;
const TITLE_WHITESPACE_REGEX = /\s+/g;

function normalizeConversationTitleWhitespace(value: string): string {
  return (value || '').trim().replace(TITLE_WHITESPACE_REGEX, ' ');
}

function truncateTitlePreservingMaxLength(value: string, maxLength: number): string {
  const normalized = normalizeConversationTitleWhitespace(value);
  if (!normalized || maxLength <= 0) return '';

  const chars = Array.from(normalized);
  if (chars.length <= maxLength) return normalized;
  if (maxLength === 1) return '\u2026';
  return `${chars.slice(0, maxLength - 1).join('')}\u2026`;
}

export function buildConversationPlaceholderTitle(userContent: string, maxLength: number = DEFAULT_CONVERSATION_TITLE_MAX_LENGTH): string {
  return truncateTitlePreservingMaxLength(userContent, maxLength);
}

export function normalizeGeneratedConversationTitle(title: string, maxLength: number = DEFAULT_CONVERSATION_TITLE_MAX_LENGTH): string {
  const normalized = normalizeConversationTitleWhitespace(title).replace(TITLE_EDGE_QUOTES_REGEX, '').trim();
  return truncateTitlePreservingMaxLength(normalized, maxLength);
}
