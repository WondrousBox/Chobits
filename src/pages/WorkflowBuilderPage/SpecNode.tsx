import React from 'react';
import { Handle, NodeProps, Position, useReactFlow } from 'reactflow';

import type { NodeSpec } from '@/types/workflow';

type NodeData = { label: string; specId: string; spec: NodeSpec; config: Record<string, any>; inputDefaults: Record<string, any> };

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function typesCompatible(source: string | string[] | undefined, target: string | string[] | undefined): boolean {
  const s = toArray(source);
  const t = toArray(target);
  if (s.length === 0 || t.length === 0) return true; // be permissive when unspecified
  if (s.includes('any') || s.includes('*')) return true;
  if (t.includes('any') || t.includes('*')) return true;
  return s.some((x) => t.includes(x));
}

const SpecNode: React.FC<NodeProps<NodeData>> = ({ data, selected }) => {
  const spec = data.spec;
  const rf = useReactFlow<NodeData>();

  const hasRequires = !!(spec.requires && spec.requires.length > 0);

  return (
    <div className={`rounded-md border border-solid border-ring min-w-[180px] overflow-hidden ${selected ? 'border-primary ring-2 ring-primary' : ''}`}>
      <div className="bg-background text-foreground p-2">
        {spec.label}
        {hasRequires && <span className="ml-2 text-[10px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground">{spec.requires!.join(',')}</span>}
      </div>
      <div className="px-2 py-2 text-[11px] space-y-2 bg-muted">
        <div className="opacity-70">{spec.description || ''}</div>
        {/* Ports area */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            {(spec.inputs || []).map((inp) => (
              <div key={inp.key} className="relative">
                <Handle
                  id={inp.key}
                  type="target"
                  position={Position.Left}
                  isValidConnection={(conn) => {
                    // validate against source output type
                    const source = conn.source ? rf.getNode(conn.source) : undefined;
                    const outKey = conn.sourceHandle || '';
                    const sourceSpec = (source?.data as any)?.spec as NodeSpec | undefined;
                    const outType = sourceSpec?.outputs?.find((o) => o.key === outKey)?.type;
                    return typesCompatible(outType, inp.type);
                  }}
                  className="!w-2 !h-2 !bg-rose-400"
                />
                <div className="pl-3">{inp.key}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {(spec.outputs || []).map((out) => (
              <div key={out.key} className="relative text-right">
                <div className="pr-3 inline-block">{out.key}</div>
                <Handle id={out.key} type="source" position={Position.Right} className="!w-2 !h-2 !bg-sky-400" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpecNode;
