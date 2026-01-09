import React from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface PageToolbarProps {
  /** 页面图标 */
  icon?: React.ReactNode;
  /** 页面标题 */
  title: string;
  /** 左侧额外元素（如复选框、统计信息） */
  leftExtra?: React.ReactNode;
  /** 搜索框占位文字，不传则不显示搜索框 */
  searchPlaceholder?: string;
  /** 搜索值 */
  searchValue?: string;
  /** 搜索回调 */
  onSearchChange?: (value: string) => void;
  /** 右侧操作按钮组 */
  actions?: React.ReactNode;
  /** 额外的 className */
  className?: string;
}

/**
 * 统一的页面工具栏组件
 *
 * 布局结构：
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 📌 标题 │ leftExtra │ (flex-1) │ 搜索框 │ [actions]         │
 * └─────────────────────────────────────────────────────────────┘
 */
const PageToolbar: React.FC<PageToolbarProps> = ({
  icon,
  title,
  leftExtra,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  actions,
  className
}) => {
  return (
    <div className={cn('flex items-center justify-between px-3 py-2 border-b bg-background shrink-0', className)}>
      {/* 左侧：标题 + 额外元素 */}
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-semibold">{title}</span>
        {leftExtra}
      </div>

      {/* 右侧：搜索 + 操作按钮 */}
      <div className="flex items-center gap-2">
        {searchPlaceholder && (
          <Input
            placeholder={searchPlaceholder}
            className="h-8 w-48"
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
          />
        )}
        {actions}
      </div>
    </div>
  );
};

export default PageToolbar;
