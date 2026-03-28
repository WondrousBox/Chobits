import React, { useMemo } from 'react';
import { TbAlertCircle, TbCheck, TbClock, TbDownload, TbPlayerStop, TbX } from 'react-icons/tb';

import { cn } from '@/lib/utils';

import { useDownloadTasks, type UseDownloadTasksOptions } from '../../hooks/useDownloadTasks';

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** SVG circular progress ring */
const CircularProgress: React.FC<{
  percent: number;
  size?: number;
  strokeWidth?: number;
  status?: string;
}> = ({ percent, size = 56, strokeWidth = 4, status = 'downloading' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  const gradientId = `dl-progress-gradient-${status}`;
  const glowId = `dl-progress-glow-${status}`;

  return (
    <svg width={size} height={size} className="absolute inset-0" viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          {status === 'completed' ? (
            <>
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </>
          ) : status === 'failed' ? (
            <>
              <stop offset="0%" stopColor="#f87171" />
              <stop offset="100%" stopColor="#ef4444" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="50%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#a78bfa" />
            </>
          )}
        </linearGradient>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background track */}
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted-foreground/15" />

      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        filter={`url(#${glowId})`}
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatSpeed(speed?: string): string {
  if (!speed) return '';
  return speed;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export interface DownloadBubbleProps {
  /** Pass options to the underlying useDownloadTasks hook */
  hookOptions?: UseDownloadTasksOptions;
  /** Additional CSS class */
  className?: string;
  /** If true, the component renders nothing when there are no tasks */
  hideWhenEmpty?: boolean;
  /** Ball size in px (default 56) */
  size?: number;
}

/**
 * A "traffic ball" style download progress component.
 *
 * Shows a circular progress ring with percentage / status icon inside.
 * When downloading, a stop button appears inside the ball on hover.
 *
 * Can be used:
 *  - As the root component of the floating download window
 *  - Embedded in any page as a child component
 */
const DownloadBubble: React.FC<DownloadBubbleProps> = ({ hookOptions, className, hideWhenEmpty = true, size = 56 }) => {
  const { tasks, activeTasks, completedTasks, failedTasks, overallProgress, cancelTask } = useDownloadTasks(hookOptions);

  // Determine the dominant status
  const dominantStatus = useMemo(() => {
    if (activeTasks.length > 0) return 'downloading';
    if (failedTasks.length > 0) return 'failed';
    if (completedTasks.length > 0) return 'completed';
    return 'idle';
  }, [activeTasks, failedTasks, completedTasks]);

  // Hide when empty?
  if (hideWhenEmpty && tasks.length === 0) {
    return null;
  }

  const currentTask = activeTasks[0] ?? tasks[0];
  const displayPercent = Math.min(Math.max(overallProgress, 0), 100);

  const handleStop = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (currentTask && (currentTask.status === 'downloading' || currentTask.status === 'queued')) {
      cancelTask(currentTask.id);
    }
  };

  return (
    <div className={cn('flex flex-col select-none w-full', className)}>
      {/* ---------- Ball + info row ---------- */}
      <div className="flex items-center gap-2.5 px-2.5 py-1.5">
        {/* Circular progress ball */}
        <div className={cn('group relative shrink-0 rounded-full')} style={{ width: size, height: size }}>
          <CircularProgress percent={displayPercent} size={size} strokeWidth={4} status={dominantStatus} />

          <div className="absolute inset-1 rounded-full overflow-hidden bg-card border border-border/30">
            {/* Center content: percent / icon */}
            <div className="absolute inset-0 flex items-center justify-center z-[1] transition-opacity duration-200 group-hover:opacity-30">
              {dominantStatus === 'downloading' ? (
                <>
                  <span className="text-[15px] font-extrabold leading-none bg-gradient-to-br from-blue-400 to-violet-400 bg-clip-text text-transparent">{displayPercent.toFixed(0)}</span>
                  <span className="text-[9px] font-semibold mt-px bg-gradient-to-br from-blue-400 to-violet-400 bg-clip-text text-transparent">%</span>
                </>
              ) : dominantStatus === 'completed' ? (
                <TbCheck className="w-5 h-5 text-emerald-400" />
              ) : dominantStatus === 'failed' ? (
                <TbAlertCircle className="w-5 h-5 text-red-400" />
              ) : (
                <TbDownload className="w-4 h-4 text-muted-foreground" />
              )}
            </div>

            {/* Stop button overlay – visible on hover when downloading */}
            {(dominantStatus === 'downloading' || dominantStatus === 'idle') && currentTask && (
              <button
                className="absolute inset-0 z-[2] flex items-center justify-center rounded-full border-none bg-card/85 text-red-400 opacity-0 transition-all duration-200 hover:bg-red-100/90 hover:text-red-500 group-hover:opacity-100"
                onClick={handleStop}
                title="停止下载"
                style={{ WebkitAppRegion: 'no-drag', cursor: 'pointer' } as React.CSSProperties}
              >
                <TbPlayerStop className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Info strip next to ball */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1">
            {activeTasks.length > 0 ? (
              <>
                下载中
                {activeTasks.length > 1 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-br from-indigo-400 to-indigo-500">
                    {activeTasks.length}
                  </span>
                )}
              </>
            ) : completedTasks.length > 0 ? (
              '下载完成'
            ) : failedTasks.length > 0 ? (
              '下载失败'
            ) : (
              '无任务'
            )}
          </div>

          {currentTask && dominantStatus === 'downloading' && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {currentTask.progress.downloadSpeed && (
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-primary/85 font-medium">
                  <TbDownload className="w-3 h-3" />
                  {formatSpeed(currentTask.progress.downloadSpeed)}
                </span>
              )}
              {currentTask.progress.eta && (
                <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
                  <TbClock className="w-3 h-3" />
                  {currentTask.progress.eta}
                </span>
              )}
              {currentTask.progress.totalSize && <span className="inline-flex items-center gap-0.5 whitespace-nowrap">{currentTask.progress.totalSize}</span>}
            </div>
          )}

          {currentTask && (
            <div
              className="text-[10px] text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px]"
              title={currentTask.filename || currentTask.videoInfo?.title || currentTask.url}
            >
              {currentTask.filename || currentTask.videoInfo?.title || currentTask.url}
            </div>
          )}

          {currentTask?.status === 'failed' && currentTask.error && (
            <div className="flex items-center gap-0.5 text-[10px] text-red-400 mt-px">
              <TbX className="w-3 h-3 flex-shrink-0" />
              <span>{currentTask.error.slice(0, 60)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DownloadBubble;
