import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

import { cn } from '@/lib/utils';

import { TabIcon } from './TabIcon';
import type { TabIcon as TabIconType } from './types';

interface SortableTabTriggerProps {
  id: string;
  value: string;
  isActive: boolean;
  className?: string;
  icon?: TabIconType;
  label: string;
  onClick: () => void;
}

/**
 * 可拖拽的 Tab Trigger 组件（类似 Chrome 浏览器标签页）
 */
export const SortableTabTrigger: React.FC<SortableTabTriggerProps> = ({ id, isActive, className, icon, label, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto'
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-selected={isActive}
      data-state={isActive ? 'active' : 'inactive'}
      data-dragging={isDragging}
      style={style}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        'cursor-grab active:cursor-grabbing select-none',
        'rounded-none border-b-2 border-l-0 border-r-0 border-t-0 border-transparent',
        isActive && 'border-primary text-foreground',
        !isActive && 'text-muted-foreground hover:text-foreground',
        className
      )}
      onClick={onClick}
      {...attributes}
      {...listeners}
    >
      {icon && <TabIcon icon={icon} className="w-4 h-4 shrink-0" />}
      <span className="truncate ml-1.5 max-w-[100px]">{label}</span>
    </button>
  );
};

/**
 * Tab 预览组件（用于 DragOverlay）
 */
interface TabPreviewProps {
  icon?: TabIconType;
  label: string;
  isActive: boolean;
}

export const TabPreview: React.FC<TabPreviewProps> = ({ icon, label, isActive }) => {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-xs font-medium',
        'rounded-md border shadow-lg bg-background',
        'cursor-grabbing select-none',
        isActive && 'border-primary text-foreground',
        !isActive && 'text-muted-foreground'
      )}
    >
      {icon && <TabIcon icon={icon} className="w-4 h-4 shrink-0" />}
      <span className="truncate ml-1.5 max-w-[100px]">{label}</span>
    </div>
  );
};
