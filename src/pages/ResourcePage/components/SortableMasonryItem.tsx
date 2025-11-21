import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import React from 'react';

import { ResourceItem } from '@/types';

interface SortableMasonryItemProps {
  id: string;
  item: ResourceItem;
  children: React.ReactNode;
  disabled?: boolean;
}

export const SortableMasonryItem: React.FC<SortableMasonryItemProps> = ({ id, item, children, disabled }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled
  });

  // 添加 Droppable 能力，用于检测重叠（合并/加入分组）
  // 使用特定的前缀区分 Droppable ID 和 Sortable ID
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${id}`,
    disabled: disabled || isDragging // 拖拽时自己不能作为放置目标
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab'
  };

  // 合并 Refs
  const setRefs = (node: HTMLDivElement | null) => {
    setNodeRef(node);
    setDroppableRef(node);
  };

  // 创建自定义 listeners，只处理左键拖拽
  const customListeners = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      // 只响应左键，右键不处理（让它冒泡到 ContextMenu）
      if (e.button === 0 && listeners?.onPointerDown) {
        listeners.onPointerDown(e as any);
      }
    }
  };

  return (
    <div
      ref={setRefs}
      style={style}
      {...attributes}
      {...customListeners}
      className={`relative rounded-lg transition-all ${isOver && !isDragging ? 'ring-4 ring-primary ring-offset-2 z-10 scale-[1.02] bg-accent' : ''}`}
    >
      {/* 遮罩层：当有其他元素拖拽到其上方时显示 "合并" 或 "加入" 提示 */}
      {isOver && !isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/10 rounded-lg pointer-events-none z-20">
          <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold shadow-lg">{id.startsWith('group-') ? '加入分组' : '创建分组'}</div>
        </div>
      )}
      {children}
    </div>
  );
};
