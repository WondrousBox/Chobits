import React, { useState } from 'react';

import NodePropertyEditor from './NodePropertyEditor';
import type { NodeData } from './types';

interface FloatingInspectorProps {
  node: any;
  onChange: (updater: (prev: NodeData) => Partial<NodeData>) => void;
}

const FloatingInspector: React.FC<FloatingInspectorProps> = ({ node, onChange }) => {
  const [open, setOpen] = useState(true);
  if (!node) return null;
  return (
    <div className="absolute top-2 right-2 z-20 w-60">
      <button onClick={() => setOpen((o) => !o)} className="mb-2 px-2 py-1 rounded bg-neutral-800 text-xs border border-neutral-600 hover:bg-neutral-700 w-full text-left">
        {open ? '收起属性' : '展开属性'}
      </button>
      <div
        className={`transition-all duration-200 ${open ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'} bg-neutral-900/95 backdrop-blur-sm border border-neutral-700 rounded shadow-lg p-2 space-y-2 overflow-auto max-h-[70vh]`}
      >
        <div className="text-xs uppercase font-bold opacity-70">属性</div>
        {!node && <div className="text-xs opacity-60">选择一个节点查看配置</div>}
        {node && <NodePropertyEditor node={node} onChange={onChange} />}
      </div>
    </div>
  );
};

export default FloatingInspector;
