import clsx from 'clsx';
import React, { useEffect, useMemo, useState } from 'react';
import { TbCopy } from 'react-icons/tb';
import { Handle, NodeProps, Position, useReactFlow } from 'reactflow';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';
import type { NodeSpec } from '@/types/workflow';

import { ConfigFieldRenderer } from './ConfigFieldRenderer';
import { getGradientBackgroundStyle, getIconComponent } from './nodeUtils';
import type { NodeData } from './types';

const invoke = window.ipcRenderer.invoke;

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

const SpecNode: React.FC<NodeProps<NodeData>> = ({ id, data, selected }) => {
  const spec = data.spec;
  const config = data.config;
  const rf = useReactFlow<NodeData>();
  const runtime = data.runtime;
  const output = runtime?.output as any | undefined;
  const status = runtime?.status;

  const toResSrc = (p?: string): string | undefined => {
    if (!p) return undefined;
    if (/^https?:\/\//i.test(p)) return p;
    if (p.startsWith('res://')) return p;
    return makeResSrc(p);
  };

  // 根据配置动态获取输入/输出端口（通过 IPC 调用后端的 getInputs/getOutputs 方法）
  const [dynamicInputs, setDynamicInputs] = useState<Array<NodeSpec['inputs'][number] & { showInNode?: boolean }>>(spec.inputs || []);
  const [dynamicOutputs, setDynamicOutputs] = useState<Array<{ key: string; label?: string; type: string | string[] }>>(spec.outputs || []);
  const [dynamicConfig, setDynamicConfig] = useState<Array<NonNullable<NodeSpec['config']>[number] & { showInNode?: boolean }>>(spec.config || []);

  useEffect(() => {
    // 通过 IPC 调用后端获取动态输入
    invoke('wf:getNodeInputs', { nodeId: spec.id, config })
      .then((result: any) => {
        if (result?.ok && Array.isArray(result.inputs)) {
          setDynamicInputs(result.inputs);
        } else {
          // 如果获取失败，使用默认输入
          setDynamicInputs(spec.inputs || []);
        }
      })
      .catch(() => {
        // 如果调用失败，使用默认输入
        setDynamicInputs(spec.inputs || []);
      });
    // 通过 IPC 调用后端获取动态输出
    invoke('wf:getNodeOutputs', { nodeId: spec.id, config })
      .then((result: any) => {
        if (result?.ok && Array.isArray(result.outputs)) {
          setDynamicOutputs(result.outputs);
        } else {
          // 如果获取失败，使用默认输出
          setDynamicOutputs(spec.outputs || []);
        }
      })
      .catch(() => {
        // 如果调用失败，使用默认输出
        setDynamicOutputs(spec.outputs || []);
      });
    // 通过 IPC 调用后端获取动态配置
    if (spec.hasDynamicConfig) {
      invoke('wf:getNodeConfig', { nodeId: spec.id, config })
        .then((result: any) => {
          if (result?.ok && Array.isArray(result.config)) {
            setDynamicConfig(result.config);
          } else {
            // 如果获取失败，使用默认配置
            setDynamicConfig(spec.config || []);
          }
        })
        .catch(() => {
          // 如果调用失败，使用默认配置
          setDynamicConfig(spec.config || []);
        });
    } else {
      // 如果不支持动态配置，直接使用静态配置
      setDynamicConfig(spec.config || []);
    }
  }, [spec.id, spec.inputs, spec.outputs, spec.config, spec.hasDynamicConfig, config]);

  // 内联编辑：更新当前节点的 inputDefaults
  const updateInlineInput = (key: string, value: any) => {
    rf.setNodes((nodes) =>
      nodes.map((n) =>
        n.id === id
          ? {
            ...n,
            data: {
              ...(n.data as NodeData),
              inputDefaults: {
                ...((n.data as NodeData).inputDefaults || {}),
                [key]: value
              }
            }
          }
          : n
      )
    );
  };

  // 内联编辑：更新当前节点的 config
  const updateInlineConfig = (key: string, value: any) => {
    rf.setNodes((nodes) =>
      nodes.map((n) =>
        n.id === id
          ? {
            ...n,
            data: {
              ...(n.data as NodeData),
              config: {
                ...((n.data as NodeData).config || {}),
                [key]: value
              }
            }
          }
          : n
      )
    );
  };

  const inlineInputs = dynamicInputs.filter((inp) => inp.showInNode);
  const inlineConfigs = dynamicConfig.filter((cfg) => cfg.showInNode);

  const baseClass = 'relative rounded-md border border-solid border-ring min-w-[180px] overflow-hidden transition-all duration-200 shadow-sm bg-muted';
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

  // 动态获取图标组件
  const IconComponent = useMemo(() => getIconComponent(spec.icon), [spec.icon]);

  // 计算标题背景颜色样式（从上到下渐变到透明，顶部10%透明度）
  const headerStyle = useMemo(() => getGradientBackgroundStyle(spec.backgroundColor, 0.1), [spec.backgroundColor]);

  return (
    <div className={`${baseClass} ${runtimeClass} ${selectionClass}`}>
      <div className={`${spec.backgroundColor ? '' : 'bg-background'} text-foreground p-2 flex items-center justify-between gap-2`} style={headerStyle}>
        <div className="flex items-center gap-2 truncate">
          {IconComponent && (
            <div className={clsx(['rounded-full p-1 w-4 h-4 flex items-center justify-center bg-primary'])} style={{ backgroundColor: spec.backgroundColor ? spec.backgroundColor : '' }}>
              {React.createElement(IconComponent, { className: 'w-3.5 h-3.5' })}
            </div>
          )}
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
            {dynamicInputs.map((inp) => (
              <div key={inp.key} className="relative">
                <Handle
                  id={inp.key}
                  type="target"
                  position={Position.Left}
                  isValidConnection={(conn) => {
                    // validate against source output type
                    const source = conn.source ? rf.getNode(conn.source) : undefined;
                    const outKey = conn.sourceHandle || '';
                    if (!source) return false;

                    // 获取源节点的动态输出
                    // 注意：这里使用同步方式获取，可能会有延迟，但为了连接验证的性能，先使用 spec.outputs
                    // 实际的动态输出会在节点渲染时通过 useEffect 更新
                    const sourceData = source.data as NodeData;
                    const sourceSpec = sourceData.spec;
                    const sourceOutputs = sourceSpec.outputs || [];

                    const outType = sourceOutputs.find((o) => o.key === outKey)?.type;
                    return typesCompatible(outType, inp.type);
                  }}
                  className="!w-2 !h-2 !bg-rose-400"
                />
                <div className="pl-3">{inp.key}</div>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {dynamicOutputs.map((out) => (
              <div key={out.key} className="relative text-right">
                <div className="pr-3 inline-block">{out.key}</div>
                <Handle id={out.key} type="source" position={Position.Right} className="!w-2 !h-2 !bg-sky-400" />
              </div>
            ))}
          </div>
        </div>
        {/* 内联输入编辑区域：渲染 showInNode 为 true 的输入端口 */}
        {inlineInputs.length > 0 && (
          <div className="mt-2 border-t border-border/60 pt-1 space-y-1">
            {inlineInputs.map((field) => (
              <ConfigFieldRenderer key={field.key} field={field} value={(data.inputDefaults || {})[field.key]} onChange={(val) => updateInlineInput(field.key, val)} nodeData={data} mode="compact" />
            ))}
          </div>
        )}
        {/* 内联配置编辑区域：渲染 showInNode 为 true 的配置字段 */}
        {inlineConfigs.length > 0 && (
          <div className="mt-2 border-t border-border/60 pt-1 space-y-1">
            {inlineConfigs.map((field) => (
              <ConfigFieldRenderer key={field.key} field={field} value={(data.config || {})[field.key]} onChange={(val) => updateInlineConfig(field.key, val)} nodeData={data} mode="compact" />
            ))}
          </div>
        )}
        {/* Display node preview区域：仅对 Display 类节点做简单渲染 */}
        {spec.category === 'Display' && output && (
          <div className="mt-2 border-t border-border/60 pt-1 space-y-1">
            {spec.id === 'ui/display-text' && typeof output.text === 'string' && (
              <div className="relative group">
                <div
                  className="text-[11px] leading-snug max-h-48 max-w-[400px] overflow-auto bg-background/70 rounded px-2 py-1 whitespace-pre-wrap break-words pr-8"
                  onWheel={(e) => {
                    // 阻止滚动事件冒泡，避免触发外部画布的缩放
                    e.stopPropagation();
                  }}
                  onMouseDown={(e) => {
                    // 阻止鼠标按下事件冒泡，避免触发节点拖拽
                    e.stopPropagation();
                  }}
                >
                  {output.text}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await navigator.clipboard.writeText(output.text);
                      toast.success('已复制到剪贴板');
                    } catch (err) {
                      toast.error('复制失败', { description: err instanceof Error ? err.message : String(err) });
                    }
                  }}
                  title="复制文本"
                >
                  <TbCopy className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            {spec.id === 'ui/display-image' && typeof output.image === 'string' && (
              <button
                type="button"
                className="flex w-full items-center justify-center bg-background/60 rounded p-1 cursor-zoom-in hover:bg-background/80 transition-colors"
                onClick={(e) => {
                  // 点击查看大图，阻止事件冒泡，避免拖动画布
                  e.stopPropagation();
                  const src = toResSrc(output.image);
                  if (!src) return;
                  try {
                    window.open(src, '_blank');
                  } catch {
                    // ignore
                  }
                }}
                onMouseDown={(e) => {
                  // 避免按下时触发节点拖拽
                  e.stopPropagation();
                }}
              >
                <img src={toResSrc(output.image)} alt={spec.label} className="max-h-24 max-w-full object-contain rounded" />
              </button>
            )}
            {spec.id === 'ui/display-media' && typeof output.media === 'string' && (
              <div className="flex flex-col gap-1">
                <div className="text-[10px] text-muted-foreground truncate" title={output.media}>
                  {output.media}
                </div>
                {/* 这里不直接嵌入播放器，避免过重；后续可扩展为点击打开资源预览窗口 */}
              </div>
            )}
            {spec.id === 'ui/display-resource-card' && (
              <div className="flex items-center gap-2 bg-background/70 rounded px-2 py-1">
                {output.thumbnailPath && (
                  <div className="w-8 h-8 rounded overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                    <img src={toResSrc(output.thumbnailPath)} alt={output.title || ''} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[11px] font-medium truncate">{output.title || '未命名资源'}</div>
                  {output.description && <div className="text-[10px] text-muted-foreground truncate">{output.description}</div>}
                </div>
              </div>
            )}
          </div>
        )}
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
