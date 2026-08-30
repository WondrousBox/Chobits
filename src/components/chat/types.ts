/**
 * 聊天卡片消息类型定义
 */

/** 卡片类型 */
export type ChatCardType = 'resource' | 'video' | 'audio' | 'image' | 'document' | 'link' | 'file';

/** 单个卡片数据 */
export interface ChatCard {
  /** 卡片类型 */
  type: ChatCardType;
  /** 资源 ID（用于从数据库加载完整资源信息） */
  resourceId?: string;
  /** 内嵌的资源数据（用于临时卡片，无需从数据库加载） */
  data?: { id: string } & Record<string, unknown>;
}

/** 扩展的消息 metadata */
export interface ChatMessageMetadata {
  /** 卡片列表 */
  cards?: ChatCard[];
  /** 其他扩展字段 */
  [key: string]: unknown;
}

/** 扩展的聊天消息类型 */
export interface ChatMessageWithCards {
  id?: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  metadata?: ChatMessageMetadata;
  createdAt?: number;
}

/** 卡片标记解析结果 */
export interface ParsedCardToken {
  type: 'card';
  cardType: string;
  id: string;
  raw: string;
}

/** 图片标记解析结果：[image:url|alt] */
export interface ParsedImageToken {
  type: 'image';
  url: string;
  alt?: string;
  raw: string;
}

/** 消息内容解析结果 */
export interface ParsedContent {
  type: 'text' | 'card' | 'image';
  content?: string;
  card?: ParsedCardToken;
  image?: ParsedImageToken;
}

/** 卡片正则表达式匹配模式：[card:type:id] */
export const CARD_TOKEN_REGEX = /\[card:(resource|video|audio|image|document|link|file):([a-zA-Z0-9_-]+)\]/g;
export const IMAGE_TOKEN_REGEX = /\[image:([^\]|]+)(?:\|([^\]]+))?\]/g;
const CONTENT_TOKEN_REGEX = /\[card:(resource|video|audio|image|document|link|file):([a-zA-Z0-9_-]+)\]|\[image:([^\]|]+)(?:\|([^\]]+))?\]/g;
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/;

/**
 * 解析消息内容中的卡片标记
 * @param content 原始消息内容
 * @returns 解析后的内容片段数组
 */
export function parseMessageContent(content: string): ParsedContent[] {
  const result: ParsedContent[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CONTENT_TOKEN_REGEX.lastIndex = 0;

  while ((match = CONTENT_TOKEN_REGEX.exec(content)) !== null) {
    // 添加卡片之前的文本
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index);
      if (textContent.trim()) {
        result.push({ type: 'text', content: textContent });
      }
    }

    if (match[1] && match[2]) {
      // 添加卡片标记
      result.push({
        type: 'card',
        card: {
          type: 'card',
          cardType: match[1],
          id: match[2],
          raw: match[0]
        }
      });
    } else if (match[3]) {
      result.push({
        type: 'image',
        image: {
          alt: match[4]?.trim() || undefined,
          raw: match[0],
          type: 'image',
          url: match[3].trim()
        }
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // 添加最后剩余的文本
  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex);
    if (textContent.trim()) {
      result.push({ type: 'text', content: textContent });
    }
  }

  // 如果没有任何卡片，返回整个文本
  if (result.length === 0 && content.trim()) {
    return [{ type: 'text', content }];
  }

  return result;
}

export function hasRenderableRichContent(content: string): boolean {
  CARD_TOKEN_REGEX.lastIndex = 0;
  IMAGE_TOKEN_REGEX.lastIndex = 0;
  return CARD_TOKEN_REGEX.test(content) || IMAGE_TOKEN_REGEX.test(content) || MARKDOWN_IMAGE_REGEX.test(content);
}
