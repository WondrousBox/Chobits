export type ThinkingSegment = {
  kind: 'text' | 'thinking';
  text: string;
};

export type ThinkingMetadataBlock = {
  type: 'thinking';
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
};

const OPENING_TAGS = ['<think>', '<thinking>'] as const;
const CLOSING_TAGS = ['</think>', '</thinking>'] as const;

function pushSegment(target: ThinkingSegment[], kind: ThinkingSegment['kind'], text: string): void {
  if (!text) return;

  const last = target[target.length - 1];
  if (last?.kind === kind) {
    last.text += text;
    return;
  }

  target.push({ kind, text });
}

function findEarliestTag(buffer: string, tags: readonly string[]): { index: number; tag: string } | undefined {
  let match: { index: number; tag: string } | undefined;

  for (const tag of tags) {
    const index = buffer.indexOf(tag);
    if (index < 0) continue;
    if (!match || index < match.index || (index === match.index && tag.length > match.tag.length)) {
      match = { index, tag };
    }
  }

  return match;
}

function longestSuffixThatCouldStartTag(buffer: string, tags: readonly string[]): string {
  const maxLength = Math.min(buffer.length, Math.max(...tags.map((tag) => tag.length - 1)));

  for (let length = maxLength; length > 0; length -= 1) {
    const suffix = buffer.slice(-length);
    if (tags.some((tag) => tag.startsWith(suffix))) {
      return suffix;
    }
  }

  return '';
}

export interface ThinkingTagStreamParser {
  flush: () => ThinkingSegment[];
  hasDetectedThinkingTags: () => boolean;
  isInsideThinking: () => boolean;
  push: (text: string) => ThinkingSegment[];
}

export function createThinkingTagStreamParser(): ThinkingTagStreamParser {
  let buffer = '';
  let insideThinking = false;
  let detectedThinkingTags = false;

  function consume(flush: boolean): ThinkingSegment[] {
    const segments: ThinkingSegment[] = [];

    while (buffer.length > 0) {
      const tags = insideThinking ? CLOSING_TAGS : OPENING_TAGS;
      const match = findEarliestTag(buffer, tags);

      if (match) {
        const prefix = buffer.slice(0, match.index);
        pushSegment(segments, insideThinking ? 'thinking' : 'text', prefix);
        buffer = buffer.slice(match.index + match.tag.length);
        insideThinking = !insideThinking;
        detectedThinkingTags = true;
        continue;
      }

      if (flush) {
        pushSegment(segments, insideThinking ? 'thinking' : 'text', buffer);
        buffer = '';
        break;
      }

      const partialTag = longestSuffixThatCouldStartTag(buffer, tags);
      const emitLength = buffer.length - partialTag.length;
      if (emitLength <= 0) {
        break;
      }

      pushSegment(segments, insideThinking ? 'thinking' : 'text', buffer.slice(0, emitLength));
      buffer = partialTag;
    }

    return segments;
  }

  return {
    flush() {
      return consume(true);
    },
    hasDetectedThinkingTags() {
      return detectedThinkingTags;
    },
    isInsideThinking() {
      return insideThinking;
    },
    push(text: string) {
      if (!text) return [];
      buffer += text;
      return consume(false);
    }
  };
}

export function splitThinkingTagsFromText(text: string): {
  content: string;
  hadThinkingTags: boolean;
  segments: ThinkingSegment[];
  thinking: string;
} {
  const parser = createThinkingTagStreamParser();
  const segments = [...parser.push(text), ...parser.flush()];

  return {
    content: segments
      .filter((segment) => segment.kind === 'text')
      .map((segment) => segment.text)
      .join(''),
    hadThinkingTags: parser.hasDetectedThinkingTags(),
    segments,
    thinking: segments
      .filter((segment) => segment.kind === 'thinking')
      .map((segment) => segment.text)
      .join('')
  };
}

export function readThinkingBlocksFromMetadata(metadata: unknown): ThinkingMetadataBlock[] | undefined {
  const candidate = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>).thinkingBlocks : undefined;
  if (!Array.isArray(candidate)) {
    return undefined;
  }

  const blocks = candidate
    .map((block) => {
      if (!block || typeof block !== 'object') {
        return undefined;
      }

      const record = block as Record<string, unknown>;
      if (record.type !== 'thinking' || typeof record.thinking !== 'string' || !record.thinking.trim()) {
        return undefined;
      }

      const normalized: ThinkingMetadataBlock = {
        type: 'thinking',
        thinking: record.thinking
      };

      if (typeof record.thinkingSignature === 'string' && record.thinkingSignature.trim()) {
        normalized.thinkingSignature = record.thinkingSignature;
      }

      if (record.redacted === true) {
        normalized.redacted = true;
      }

      return normalized;
    })
    .filter((block): block is ThinkingMetadataBlock => Boolean(block));

  return blocks.length > 0 ? blocks : undefined;
}

export function extractThinkingTextFromMetadata(metadata: unknown): string | undefined {
  const blocks = readThinkingBlocksFromMetadata(metadata);
  if (!blocks?.length) {
    return undefined;
  }

  const thinking = blocks.map((block) => block.thinking).join('');
  return thinking.trim() ? thinking : undefined;
}
