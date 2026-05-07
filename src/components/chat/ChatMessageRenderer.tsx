/**
 * 聊天消息渲染器
 * 支持解析消息中的卡片标记 [card:type:id] 并渲染为对应的卡片组件
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { ResourceCard } from './cards';
import { parseMessageContent } from './types';

interface ChatMessageRendererProps {
  /** 消息内容 */
  content: string;
  /** 自定义类名 */
  className?: string;
  /** 是否使用紧凑模式的卡片 */
  compactCards?: boolean;
}

function allowChatMediaUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (/^(https?:|res:|blob:)/i.test(trimmed)) return trimmed;
  if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(trimmed)) return trimmed;
  return '';
}

const ChatInlineImage: React.FC<{ alt?: string; src: string }> = ({ alt, src }) => {
  const safeSrc = allowChatMediaUrl(src);
  if (!safeSrc) return null;

  return (
    <span className="my-2 block overflow-hidden rounded-lg border border-border/60 bg-muted/30">
      <img src={safeSrc} alt={alt || '图片'} loading="lazy" className="block max-h-[360px] max-w-full object-contain" />
    </span>
  );
};

const markdownComponents = {
  img(props: React.ComponentProps<'img'>) {
    return <ChatInlineImage src={props.src || ''} alt={props.alt} />;
  }
};

/**
 * 聊天消息渲染器组件
 * 解析消息内容中的卡片标记，将文本和卡片混合渲染
 */
const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({ content, className, compactCards = false }) => {
  // 解析消息内容
  const parsedParts = useMemo(() => parseMessageContent(content), [content]);

  // 如果没有卡片或图片标记，直接渲染 Markdown
  const hasRichTokens = parsedParts.some((part) => part.type === 'card' || part.type === 'image');

  if (!hasRichTokens) {
    return (
      <div className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}>
        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]} urlTransform={allowChatMediaUrl}>
          {content}
        </ReactMarkdown>
      </div>
    );
  }

  // 有卡片时，分段渲染
  return (
    <div className={`space-y-2 ${className || ''}`}>
      {parsedParts.map((part, index) => {
        if (part.type === 'text' && part.content) {
          return (
            <div key={index} className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]} urlTransform={allowChatMediaUrl}>
                {part.content}
              </ReactMarkdown>
            </div>
          );
        }

        if (part.type === 'card' && part.card) {
          const { cardType, id } = part.card;
          return <ResourceCard key={`card-${index}-${id}`} resourceId={id} cardType={cardType as any} compact={compactCards} />;
        }

        if (part.type === 'image' && part.image) {
          return <ChatInlineImage key={`image-${index}`} src={part.image.url} alt={part.image.alt} />;
        }

        return null;
      })}
    </div>
  );
};

export default ChatMessageRenderer;
