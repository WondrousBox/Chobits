import clsx from 'clsx';
import React, { useEffect, useMemo, useState } from 'react';
import { TbBook2, TbHighlight, TbNote, TbX } from 'react-icons/tb';

import type { AnnotationItem } from '../SubtitlePlayer/useAnnotations';
import { ANNOTATION_ALERT_EVENT, type AnnotationAlertEventDetail } from './annotationAlertEvent';

interface AnnotationAlertOverlayProps {
  className?: string;
}

/**
 * 获取标注类型图标
 */
const getTypeIcon = (type: string): React.ReactNode => {
  switch (type) {
    case 'vocabulary':
      return <TbBook2 className="w-4 h-4" />;
    case 'note':
      return <TbNote className="w-4 h-4" />;
    case 'highlight':
      return <TbHighlight className="w-4 h-4" />;
    default:
      return <TbHighlight className="w-4 h-4" />;
  }
};

/**
 * 解析Markdown格式的单词表内容
 * 将 **word** 转换为粗体，处理音标、词性等
 */
const parseVocabularyContent = (text: string): React.ReactNode => {
  // 分段处理
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    // 处理 **word** 格式
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      parts.push(
        <strong key={match[1]} className="font-bold text-foreground">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }

    return (
      <div key={idx} className="leading-relaxed">
        {parts.length > 0 ? parts : line}
      </div>
    );
  });
};

/**
 * 单个标注Alert卡片
 */
const AnnotationAlertCard: React.FC<{
  annotation: AnnotationItem;
  currentTime: number;
  onClose?: () => void;
}> = ({ annotation, currentTime, onClose }) => {
  const color = annotation.color || 'hsl(48, 95%, 55%)';
  const isVocabulary = annotation.type === 'vocabulary';

  // 计算进度（当前时间在标注时间范围内的位置）
  // 如果当前时间超过标注结束时间（延展显示期间），进度保持100%
  const duration = annotation.endTime - annotation.startTime;
  const progress = duration > 0 ? Math.min(1, Math.max(0, (currentTime - annotation.startTime) / duration)) : 1;

  return (
    <div
      className={clsx('relative bg-popover/95 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden', 'animate-in slide-in-from-right fade-in duration-300', 'max-w-[320px]')}
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span style={{ color }} className="flex items-center">
            {getTypeIcon(annotation.type)}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {isVocabulary ? '单词表' : annotation.type === 'note' ? '备注' : annotation.type === 'highlight' ? '高亮' : annotation.type}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <TbX className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 高亮文本 */}
      {annotation.text && (
        <div className="px-3 pt-2 pb-1">
          <div
            className="text-sm font-medium px-2 py-1 rounded inline"
            style={{
              backgroundColor: `${color}25`,
              textDecoration: 'underline',
              textDecorationColor: color,
              textDecorationStyle: 'wavy',
              textUnderlineOffset: '3px'
            }}
          >
            {annotation.text}
          </div>
        </div>
      )}

      {/* 单词表/备注内容 */}
      {annotation.description && (
        <div className="px-3 py-2 text-xs text-muted-foreground leading-relaxed max-h-[150px] overflow-y-auto">
          {isVocabulary ? parseVocabularyContent(annotation.description) : annotation.description}
        </div>
      )}

      {/* 进度条 */}
      <div className="h-0.5 bg-muted/50">
        <div className="h-full transition-all duration-100" style={{ width: `${progress * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

/**
 * 标注Alert叠加层组件
 * 监听 custom:annotation-alert 事件，在视频右上角显示标注alert卡片。
 * 类似YouTube的视频提示效果。
 */
export const AnnotationAlertOverlay: React.FC<AnnotationAlertOverlayProps> = ({ className = '' }) => {
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: Event): void => {
      const ce = e as CustomEvent<AnnotationAlertEventDetail>;
      setAnnotations(ce.detail.annotations);
      setCurrentTime(ce.detail.currentTime);
      // 当新的标注出现时，清除之前的dismiss状态
      if (ce.detail.annotations.length > 0) {
        const newIds = new Set(ce.detail.annotations.map((a) => a.id));
        setDismissedIds((prev) => {
          const next = new Set(prev);
          // 只保留仍然存在的标注的dismiss状态
          for (const id of next) {
            if (!newIds.has(id)) next.delete(id);
          }
          return next;
        });
      }
    };
    window.addEventListener(ANNOTATION_ALERT_EVENT, handler);
    return () => {
      window.removeEventListener(ANNOTATION_ALERT_EVENT, handler);
    };
  }, []);

  // 过滤掉已关闭的标注
  const visibleAnnotations = useMemo(() => {
    return annotations.filter((a) => !dismissedIds.has(a.id));
  }, [annotations, dismissedIds]);

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  if (visibleAnnotations.length === 0) return null;

  return (
    <div className={`absolute top-4 right-4 flex flex-col gap-2 pointer-events-auto z-20 ${className}`}>
      {visibleAnnotations.map((annotation) => (
        <AnnotationAlertCard key={annotation.id} annotation={annotation} currentTime={currentTime} onClose={() => handleDismiss(annotation.id)} />
      ))}
    </div>
  );
};
