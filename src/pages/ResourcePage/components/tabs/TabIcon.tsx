import React from 'react';

import type { TabIcon as TabIconType } from './types';

interface TabIconProps {
  icon: TabIconType;
  className?: string;
}

/**
 * Tab 图标渲染组件
 * 支持三种类型：
 * 1. React 组件（如 react-icons）
 * 2. SVG 字符串
 * 3. 图片 URL
 */
export const TabIcon: React.FC<TabIconProps> = ({ icon, className = 'w-4 h-4' }) => {
  // 如果是 React 组件
  if (typeof icon === 'function') {
    const IconComponent = icon as React.ComponentType<{ className?: string }>;
    return <IconComponent className={className} />;
  }

  // 如果是字符串
  if (typeof icon === 'string') {
    // 检查是否是 SVG 字符串
    if (icon.trim().startsWith('<svg')) {
      return <div className={className} dangerouslySetInnerHTML={{ __html: icon }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} />;
    }

    // 否则当作图片 URL
    return <img src={icon} alt="" className={className} style={{ objectFit: 'contain' }} />;
  }

  return null;
};
