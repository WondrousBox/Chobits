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

/**
 * 聊天消息渲染器组件
 * 解析消息内容中的卡片标记，将文本和卡片混合渲染
 */
const ChatMessageRenderer: React.FC<ChatMessageRendererProps> = ({ content, className, compactCards = false }) => {
  // 解析消息内容
  const parsedParts = useMemo(() => parseMessageContent(content), [content]);

  // 如果没有卡片，直接渲染 Markdown
  const hasCards = parsedParts.some((part) => part.type === 'card');

  if (!hasCards) {
    return (
      <div className={`prose prose-sm dark:prose-invert max-w-none ${className || ''}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
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
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true }]]}>
                {part.content}
              </ReactMarkdown>
            </div>
          );
        }

        if (part.type === 'card' && part.card) {
          const { cardType, id } = part.card;
          return (
            <ResourceCard
              key={`card-${index}-${id}`}
              resourceId={id}
              cardType={cardType as any}
              compact={compactCards}
            />
          );
        }

        return null;
      })}
    </div>
  );
};

export default ChatMessageRenderer;
