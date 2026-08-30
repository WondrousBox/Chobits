/**
 * 聊天消息渲染器
 * 支持解析消息中的图片标记 [image:url] 并渲染为内嵌图片；
 * 历史消息中的 [card:type:id] 资源卡片标记不再渲染，直接忽略
 */

import type { SpeechDisplayTextFilter } from '@packages/ai/speech-display-filter';
import { sanitizeSpeechTextForDisplay } from '@packages/ai/speech-display-filter';
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { parseMessageContent } from './types';

interface ChatMessageRendererProps {
  /** 消息内容 */
  content: string;
  /** 自定义类名 */
  className?: string;
  /** Text filter for speech-only tags that should be hidden from chat display. */
  speechDisplayTextFilter?: SpeechDisplayTextFilter;
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
 * 解析消息内容中的标记，将文本和图片混合渲染；
 * 已移除资源卡片支持，[card:type:id] 标记直接忽略
 */
const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({ content, className, speechDisplayTextFilter }) => {
  const displayContent = useMemo(() => sanitizeSpeechTextForDisplay(content, speechDisplayTextFilter), [content, speechDisplayTextFilter]);
  // 解析消息内容
  const parsedParts = useMemo(() => parseMessageContent(displayContent), [displayContent]);

  // 如果没有卡片或图片标记，直接渲染 Markdown
  const hasRichTokens = parsedParts.some((part) => part.type === 'card' || part.type === 'image');

  if (!hasRichTokens) {
    return (
      <div className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}>
        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]} urlTransform={allowChatMediaUrl}>
          {displayContent}
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

        if (part.type === 'image' && part.image) {
          return <ChatInlineImage key={`image-${index}`} src={part.image.url} alt={part.image.alt} />;
        }

        return null;
      })}
    </div>
  );
};

export default ChatMessageRenderer;
