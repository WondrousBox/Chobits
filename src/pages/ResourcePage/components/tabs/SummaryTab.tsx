import React from 'react';

import { useResourceTabContext } from './ResourceTabContext';

/**
 * 总结 Tab 组件
 * 用于显示资源的总结内容
 */
const SummaryTab: React.FC = () => {
  const { resource } = useResourceTabContext();

  // 占位实现，后续可以替换为实际的总结组件
  return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">总结功能开发中...</div>;
};

export default SummaryTab;
