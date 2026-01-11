import React from 'react';

import { useResourceTabContext } from './ResourceTabContext';

/**
 * 翻译 Tab 组件
 * 用于显示资源的翻译内容
 */
const TranslateTab: React.FC = () => {
  const { resource } = useResourceTabContext();

  // 占位实现，后续可以替换为实际的翻译组件
  return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">翻译功能开发中...</div>;
};

export default TranslateTab;
