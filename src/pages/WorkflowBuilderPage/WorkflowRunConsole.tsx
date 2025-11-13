import React, { useEffect, useMemo, useRef } from 'react';
import { TbChevronDown, TbChevronUp, TbTerminal2, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ExecutionStatus, WorkflowRunLogEntry } from '@/types/workflow';

type WorkflowRunConsoleProps = {
  logs: WorkflowRunLogEntry[];
  currentRunId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onClear: () => void;
  status?: ExecutionStatus | null;
};

const levelClassMap: Record<WorkflowRunLogEntry['level'], string> = {
  info: 'text-slate-200',
  warn: 'text-amber-300',
  error: 'text-rose-300'
};

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

const statusLabelMap: Partial<Record<ExecutionStatus, { label: string; className: string }>> = {
  queued: { label: '排队中', className: 'text-muted-foreground' },
  running: { label: '运行中', className: 'text-amber-300' },
  completed: { label: '已完成', className: 'text-emerald-300' },
  failed: { label: '已失败', className: 'text-rose-300' },
  canceled: { label: '已取消', className: 'text-orange-300' }
};

const WorkflowRunConsole: React.FC<WorkflowRunConsoleProps> = ({ logs, currentRunId, collapsed, onToggle, onClear, status }) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const hasLogs = logs.length > 0;

  useEffect(() => {
    if (collapsed) return;
    const el = bodyRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [logs, collapsed]);

  const statusLabel = status ? statusLabelMap[status] : null;
  const runHint = useMemo(() => {
    if (!currentRunId) return null;
    return `#${currentRunId.slice(0, 8)}`;
  }, [currentRunId]);

  return (
    <div className="flex h-full flex-col border-t border-border bg-[#0f172a] text-slate-100">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TbTerminal2 className="h-4 w-4" />
          <span>运行日志</span>
          {runHint && <span className="text-xs text-slate-400">{runHint}</span>}
          {statusLabel && <span className={`text-xs font-normal ${statusLabel.className}`}>{statusLabel.label}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-300 hover:text-slate-100" onClick={onClear} disabled={!hasLogs}>
            <TbTrash className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-300 hover:text-slate-100" onClick={onToggle}>
            {collapsed ? <TbChevronUp className="h-4 w-4" /> : <TbChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {!collapsed && (
        <div ref={bodyRef} className="flex-1 overflow-auto px-4 pb-4 font-mono text-xs leading-relaxed">
          {!hasLogs && <div className="text-slate-500">暂无日志输出</div>}
          {logs.map((log, idx) => {
            const levelClass = levelClassMap[log.level];
            return (
              <div key={`${log.timestamp}-${log.nodeId || 'workflow'}-${idx}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-0.5">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">{formatTime(log.timestamp)}</span>
                <span className={`text-[11px] font-semibold ${levelClass}`}>{log.level}</span>
                {log.nodeId && <span className="rounded bg-slate-700/60 px-1 py-0.5 text-[10px] text-slate-200">节点 {log.nodeId}</span>}
                <span className="flex-1 whitespace-pre-wrap break-words text-slate-100">{log.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WorkflowRunConsole;
