import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React, { useState } from 'react';

import { TabsTrigger } from '@/components/ui/tabs';

import { TabIcon } from './TabIcon';
import type { TabIcon as TabIconType } from './types';

interface SortableTabTriggerProps {
  id: string;
  value: string;
  className?: string;
  icon?: TabIconType;
  label: string;
}

/**
 * 可拖拽的 Tab Trigger 组件（类似 Chrome 浏览器标签页）
 */
export const SortableTabTrigger: React.FC<SortableTabTriggerProps> = ({ id, value, className, icon, label }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const [isCompact, setIsCompact] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 50 : 'auto',
    cursor: 'grab'
  };

  // 使用 ResizeObserver 检测 tab 宽度，决定是否显示为紧凑模式
  const tabRef = React.useCallback(
    (node: HTMLElement | null) => {
      setNodeRef(node);
      if (node) {
        const observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
            // 当宽度小于 80px 时，只显示图标
            setIsCompact(entry.contentRect.width < 80);
          }
        });
        observer.observe(node);
        return () => observer.disconnect();
      }
    },
    [setNodeRef]
  );

  return (
    <TabsTrigger ref={tabRef} value={value} style={style} className={className} data-dragging={isDragging} {...attributes} {...listeners}>
      {icon && <TabIcon icon={icon} className={isCompact ? 'w-4 h-4' : 'w-4 h-4 shrink-0'} />}
      {!isCompact && <span className="truncate ml-1.5">{label}</span>}
    </TabsTrigger>
  );
};
