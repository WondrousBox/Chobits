import React from 'react';

import DragAbleTitle from '@/components/common/DragAbleTitle';

// ResourceHeader 现在只是一个空的拖拽标题栏
const ResourceHeader: React.FC = () => {
  return <DragAbleTitle title={<span />} />;
};

export default ResourceHeader;
