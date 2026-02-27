import './styles.scss';

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
}> = ({ percent, size = 88, strokeWidth = 5, status = 'downloading' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  const gradientId = `dl-progress-gradient-${status}`;
  const glowId = `dl-progress-glow-${status}`;

  return (
    <svg width={size} height={size} className="dl-bubble__ring" viewBox={`0 0 ${size} ${size}`}>
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
        className="dl-bubble__ring-progress"
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
  /** Ball size in px (default 88) */
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
const DownloadBubble: React.FC<DownloadBubbleProps> = ({ hookOptions, className, hideWhenEmpty = true, size = 88 }) => {
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
    <div className={cn('dl-bubble', className)}>
      {/* ---------- Ball + info row ---------- */}
      <div className="dl-bubble__head">
        {/* Circular progress ball */}
        <div className={cn('dl-bubble__ball', `dl-bubble__ball--${dominantStatus}`)}>
          <CircularProgress percent={displayPercent} size={size} strokeWidth={5} status={dominantStatus} />

          <div className="dl-bubble__ball-inner">
            {/* Center content: percent / icon */}
            <div className="dl-bubble__ball-content">
              {dominantStatus === 'downloading' ? (
                <>
                  <span className="dl-bubble__ball-percent">{displayPercent.toFixed(0)}</span>
                  <span className="dl-bubble__ball-percent-sign">%</span>
                </>
              ) : dominantStatus === 'completed' ? (
                <TbCheck className="w-7 h-7 text-emerald-400" />
              ) : dominantStatus === 'failed' ? (
                <TbAlertCircle className="w-7 h-7 text-red-400" />
              ) : (
                <TbDownload className="w-6 h-6 text-muted-foreground" />
              )}
            </div>

            {/* Stop button overlay – visible on hover when downloading */}
            {(dominantStatus === 'downloading' || dominantStatus === 'idle') && currentTask && (
              <button className="dl-bubble__ball-stop" onClick={handleStop} title="停止下载">
                <TbPlayerStop className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Info strip next to ball */}
        <div className="dl-bubble__head-info">
          <div className="dl-bubble__head-title">
            {activeTasks.length > 0 ? (
              <>
                下载中
                {activeTasks.length > 1 && <span className="dl-bubble__badge">{activeTasks.length}</span>}
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
            <div className="dl-bubble__head-detail">
              {currentTask.progress.downloadSpeed && (
                <span className="dl-bubble__speed">
                  <TbDownload className="w-3 h-3" />
                  {formatSpeed(currentTask.progress.downloadSpeed)}
                </span>
              )}
              {currentTask.progress.eta && (
                <span className="dl-bubble__eta">
                  <TbClock className="w-3 h-3" />
                  {currentTask.progress.eta}
                </span>
              )}
              {currentTask.progress.totalSize && <span className="dl-bubble__size">{currentTask.progress.totalSize}</span>}
            </div>
          )}

          {currentTask && (
            <div className="dl-bubble__head-filename" title={currentTask.filename || currentTask.videoInfo?.title || currentTask.url}>
              {currentTask.filename || currentTask.videoInfo?.title || currentTask.url}
            </div>
          )}

          {currentTask?.status === 'failed' && currentTask.error && (
            <div className="dl-bubble__error">
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
