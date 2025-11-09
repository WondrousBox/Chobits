import React from 'react';

import type { NodeSpec } from '@/types/workflow';

import type { NodeData } from './types';
import { Input } from '@/components/ui/input';

interface NodePropertyEditorProps {
  node: any;
  onChange: (updater: (prev: NodeData) => Partial<NodeData>) => void;
}

const NodePropertyEditor: React.FC<NodePropertyEditorProps> = ({ node, onChange }) => {
  if (!node) return null;
  const data = node.data as NodeData;
  const spec: NodeSpec = data.spec;
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{spec.label}</div>
      <div className="text-xs opacity-70">ID: {node.id}</div>
      {spec.config && spec.config.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase opacity-70">配置</div>
          {spec.config.map((c) => (
            <div key={c.key} className="space-y-1">
              <label className="block text-xs">{c.key}</label>
              <Input
                value={String((data.config || {})[c.key] ?? '')}
                onChange={(e) => onChange((prev) => ({ config: { ...prev.config, [c.key]: e.target.value } }))}
                placeholder={c.description || ''}
              />
            </div>
          ))}
        </div>
      )}
      {/* {spec.inputs && spec.inputs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase opacity-70">输入默认值</div>
          {spec.inputs.map((inp) => (
            <div key={inp.key} className="space-y-1">
              <label className="block text-xs">{inp.key}</label>
              <Input
                value={String((data.inputDefaults || {})[inp.key] ?? '')}
                onChange={(e) => onChange((prev) => ({ inputDefaults: { ...prev.inputDefaults, [inp.key]: e.target.value } }))}
                placeholder={inp.description || ''}
              />
            </div>
          ))}
        </div>
      )} */}
    </div>
  );
};

export default NodePropertyEditor;
