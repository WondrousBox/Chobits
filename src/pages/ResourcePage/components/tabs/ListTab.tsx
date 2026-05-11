import React from 'react';

import ResourceFileList from '../ResourceFileList';
import { useResourceTabContext } from './ResourceTabContext';

/**
 * 列表 Tab 组件
 * 用于显示资源文件列表
 */
const ListTab: React.FC = () => {
  const { resource, onResourceChange } = useResourceTabContext();

  return (
    <div className="h-full overflow-hidden">
      <ResourceFileList currentResource={resource} onResourceChange={onResourceChange!} />
    </div>
  );
};

export default ListTab;
