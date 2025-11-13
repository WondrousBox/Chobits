import React from 'react';

import NodePropertyEditor from './NodePropertyEditor';
import type { NodeData } from './types';

interface FloatingInspectorProps {
  node: any;
  onChange: (updater: (prev: NodeData) => Partial<NodeData>) => void;
}

const FloatingInspector: React.FC<FloatingInspectorProps> = ({ node, onChange }) => {
  if (!node) {
    return null;
  }
  return (
    <div className="absolute top-1/2 right-2 z-20 w-60 -translate-y-1/2 min-h-20 bg-background shadow-md rounded-md border border-ring border-solid overflow-hidden">
      {node && <NodePropertyEditor node={node} onChange={onChange} />}
    </div>
  );
};

export default FloatingInspector;
