import type { SpritePurposeDailyRetrospective, SpritePurposeRetrospectiveItem } from '@packages/sprite-core/purpose';
import React from 'react';
import { TbAlertTriangle, TbChecks, TbFlag, TbHistory, TbSparkles } from 'react-icons/tb';

interface PurposeRetrospectivePanelProps {
  retrospective: SpritePurposeDailyRetrospective | null;
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return '刚刚';
  }
  if (ms < 1000) {
    return `${Math.max(0, Math.round(ms))}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)}s`;
  }
  return `${Math.round(ms / 60_000)}m`;
}

function getPurposeKindLabel(kind: string): string {
  switch (kind) {
    case 'file.drop':
      return '文件投递';
    default:
      return kind;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return '完成';
    case 'cancelled':
      return '取消';
    case 'failed':
      return '失败';
    case 'superseded':
      return '切换';
    default:
      return status;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'failed':
      return 'text-red-600 dark:text-red-400';
    case 'cancelled':
    case 'superseded':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-muted-foreground';
  }
}

function PurposeItem({ item }: { item: SpritePurposeRetrospectiveItem }): JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted/35 px-2 py-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        {item.memoryCandidate ? <TbSparkles className="h-4 w-4" /> : <TbFlag className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <span className="truncate font-medium text-foreground">{getPurposeKindLabel(item.purposeKind)}</span>
          <span className={getStatusClass(item.status)}>{getStatusLabel(item.status)}</span>
        </div>
        <div className="truncate text-[11px] text-muted-foreground">
          {item.summary || item.outcome} · {item.stepCount} steps · {formatDuration(item.durationMs)}
        </div>
      </div>
    </div>
  );
}

const PurposeRetrospectivePanel: React.FC<PurposeRetrospectivePanelProps> = ({ retrospective }) => {
  if (!retrospective) {
    return null;
  }

  const items = retrospective.items.slice(0, 4);

  return (
    <div className="border-b border-border px-2 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <TbHistory className="h-4 w-4 text-muted-foreground" />
          今日目的
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <TbChecks className="h-3.5 w-3.5" />
            {retrospective.completedCount}
          </span>
          {(retrospective.failedCount > 0 || retrospective.cancelledCount > 0) && (
            <span className="flex items-center gap-1">
              <TbAlertTriangle className="h-3.5 w-3.5" />
              {retrospective.failedCount + retrospective.cancelledCount}
            </span>
          )}
          <span className="flex items-center gap-1">
            <TbSparkles className="h-3.5 w-3.5" />
            {retrospective.memoryCandidateCount}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md bg-muted/30 px-2 py-2 text-xs text-muted-foreground">今天还没有需要复盘的目的。</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <PurposeItem key={`${item.purposeId}-${item.endedAt}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default PurposeRetrospectivePanel;
