import React from 'react';

import { cn } from '@/lib/utils';

/**
 * 设置分组组件 - 用于包裹一组相关设置项
 */
interface SettingGroupProps {
  /** 分组标题 */
  title?: string;
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

export const SettingGroup: React.FC<SettingGroupProps> = ({ title, children, className }) => {
  return (
    <div className={cn('space-y-1', className)}>
      {title && <div className="text-xs font-medium text-muted-foreground px-2 py-1">{title}</div>}
      <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">{children}</div>
    </div>
  );
};

/**
 * 设置项组件 - 单行设置项，左侧标题+描述，右侧操作区
 */
interface SettingItemProps {
  /** 设置项标题 */
  title: string;
  /** 设置项描述 */
  description?: string;
  /** 右侧操作区域 */
  action?: React.ReactNode;
  /** 点击整行的回调 */
  onClick?: () => void;
  /** 自定义类名 */
  className?: string;
  /** 子元素（用于展开内容） */
  children?: React.ReactNode;
}

export const SettingItem: React.FC<SettingItemProps> = ({ title, description, action, onClick, className, children }) => {
  const content = (
    <>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </>
  );

  return (
    <div className={cn('px-4 py-3', className)}>
      {onClick ? (
        <button type="button" onClick={onClick} className="flex items-center justify-between w-full text-left hover:bg-muted/50 -mx-4 -my-3 px-4 py-3 transition-colors">
          {content}
        </button>
      ) : (
        <div className="flex items-center justify-between">{content}</div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};

/**
 * 设置项路径显示组件 - 用于显示文件路径
 */
interface SettingPathProps {
  /** 路径值 */
  path: string;
  /** 占位符 */
  placeholder?: string;
}

export const SettingPath: React.FC<SettingPathProps> = ({ path, placeholder = '未设置' }) => {
  return <div className="px-2 py-1.5 bg-muted rounded text-xs text-muted-foreground font-mono truncate max-w-[200px]">{path || placeholder}</div>;
};
