import React from 'react';
import { Handle, NodeProps, Position, useReactFlow } from 'reactflow';

import type { NodeSpec } from '@/types/workflow';

import type { NodeData } from './types';

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
  const runtime = data.runtime;
  const status = runtime?.status;

  const baseClass = 'relative rounded-md border border-solid min-w-[180px] overflow-hidden transition-all duration-200 shadow-sm';
  let runtimeClass = 'border-ring';
  if (status === 'running') {
    runtimeClass = 'border-amber-400 ring-2 ring-amber-300 bg-amber-500/10 animate-pulse shadow-[0_0_0_2px_rgba(251,191,36,0.25)]';
  } else if (status === 'completed') {
    runtimeClass = 'border-emerald-500 ring-2 ring-emerald-300/70 bg-emerald-500/10';
  } else if (status === 'failed') {
    runtimeClass = 'border-rose-500 ring-2 ring-rose-400/70 bg-rose-500/10';
  } else if (status === 'skipped') {
    runtimeClass = 'border-muted-foreground/40 bg-muted';
  }
  const selectionClass = !status || status === 'pending' ? (selected ? 'ring-2 ring-primary border-primary' : '') : '';

  const statusBadge =
    status && status !== 'pending'
      ? {
        running: { label: '运行中', className: 'bg-amber-500/20 text-amber-600' },
        completed: { label: '成功', className: 'bg-emerald-500/20 text-emerald-600' },
        failed: { label: '失败', className: 'bg-rose-500/20 text-rose-600' },
        skipped: { label: '已跳过', className: 'bg-muted text-muted-foreground' }
      }[status]
      : null;

  const hasRequires = !!(spec.requires && spec.requires.length > 0);

  return (
    <div className={`${baseClass} ${runtimeClass} ${selectionClass}`}>
      <div className="bg-background text-foreground p-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <span className="truncate">{spec.label}</span>
          {hasRequires && <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground whitespace-nowrap">{spec.requires!.join(',')}</span>}
        </div>
        {statusBadge && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${statusBadge.className}`}>{statusBadge.label}</span>}
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
      {status === 'failed' && runtime?.error && (
        <div className="pointer-events-none absolute left-1/2 top-full mt-1 w-[240px] -translate-x-1/2">
          <div className="whitespace-pre-wrap rounded-md border border-rose-400/50 bg-rose-500/20 px-3 py-2 text-xs text-rose-700 shadow-lg">{runtime.error}</div>
        </div>
      )}
    </div>
  );
};

export default SpecNode;
