import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface TimecodeControlProps {
  currentTime?: number;
  duration: number;
  onSeek?: (time: number) => void;
  className?: string;
}

type DragState = {
  pointerId: number;
  startX: number;
  startTime: number;
  didDrag: boolean;
};

const DRAG_START_THRESHOLD_PX = 3;
const DRAG_SECONDS_PER_PIXEL = 0.05;
const DRAG_FINE_SECONDS_PER_PIXEL = 0.01;
const DRAG_FAST_SECONDS_PER_PIXEL = 0.2;
const DRAG_SEEK_THROTTLE_MS = 80;
const PREVIEW_HOLD_MS = 300;
const TIMECODE_DIGIT_COUNT = 9;

function clampTime(time: number, duration: number): number {
  return Math.max(0, Math.min(duration, time));
}

function formatTimecode(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const wholeSeconds = Math.floor(safeSeconds);
  const h = Math.floor(wholeSeconds / 3600);
  const m = Math.floor((wholeSeconds % 3600) / 60);
  const s = wholeSeconds % 60;
  const ms = Math.floor((safeSeconds - wholeSeconds) * 1000);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function formatDisplayTimecode(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function maskTimecodeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, TIMECODE_DIGIT_COUNT).padEnd(TIMECODE_DIGIT_COUNT, '0');
  const hours = digits.slice(0, 2);
  const minutes = digits.slice(2, 4);
  const seconds = digits.slice(4, 6);
  const milliseconds = digits.slice(6, 9);

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function parseTimecode(value: string): number {
  const digits = value.replace(/\D/g, '').slice(0, TIMECODE_DIGIT_COUNT).padEnd(TIMECODE_DIGIT_COUNT, '0');
  const hours = Number(digits.slice(0, 2));
  const minutes = Math.min(59, Number(digits.slice(2, 4)));
  const seconds = Math.min(59, Number(digits.slice(4, 6)));
  const milliseconds = Number(digits.slice(6, 9));

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export const TimecodeControl: React.FC<TimecodeControlProps> = ({ currentTime = 0, duration, onSeek, className }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const onSeekRef = useRef(onSeek);
  const lastDragSeekTimeRef = useRef(0);
  const pendingDragSeekTimeRef = useRef<number | null>(null);
  const dragSeekTimerRef = useRef<number | null>(null);
  const previewClearTimerRef = useRef<number | null>(null);
  const skipNextBlurCommitRef = useRef(false);
  const [previewTime, setPreviewTime] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draftValue, setDraftValue] = useState('');

  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  useEffect(() => {
    return () => {
      if (dragSeekTimerRef.current !== null) {
        window.clearTimeout(dragSeekTimerRef.current);
      }
      if (previewClearTimerRef.current !== null) {
        window.clearTimeout(previewClearTimerRef.current);
      }
    };
  }, []);

  const displayTime = previewTime ?? currentTime;
  const currentLabel = useMemo(() => formatDisplayTimecode(displayTime), [displayTime]);
  const currentPreciseLabel = useMemo(() => formatTimecode(displayTime), [displayTime]);
  const activeCurrentLabel = isDragging ? currentPreciseLabel : currentLabel;
  const durationLabel = useMemo(() => formatDisplayTimecode(duration), [duration]);

  const clearPreviewTimer = useCallback((): void => {
    if (previewClearTimerRef.current !== null) {
      window.clearTimeout(previewClearTimerRef.current);
      previewClearTimerRef.current = null;
    }
  }, []);

  const schedulePreviewClear = useCallback((): void => {
    clearPreviewTimer();
    previewClearTimerRef.current = window.setTimeout(() => {
      previewClearTimerRef.current = null;
      setPreviewTime(null);
    }, PREVIEW_HOLD_MS);
  }, [clearPreviewTimer]);

  const commitSeek = useCallback((time: number): void => {
    onSeekRef.current?.(time);
    lastDragSeekTimeRef.current = performance.now();
  }, []);

  const scheduleDragSeek = useCallback(
    (time: number): void => {
      pendingDragSeekTimeRef.current = time;

      const elapsed = performance.now() - lastDragSeekTimeRef.current;
      if (elapsed >= DRAG_SEEK_THROTTLE_MS) {
        if (dragSeekTimerRef.current !== null) {
          window.clearTimeout(dragSeekTimerRef.current);
          dragSeekTimerRef.current = null;
        }
        pendingDragSeekTimeRef.current = null;
        commitSeek(time);
        return;
      }

      if (dragSeekTimerRef.current === null) {
        dragSeekTimerRef.current = window.setTimeout(() => {
          dragSeekTimerRef.current = null;
          const pendingTime = pendingDragSeekTimeRef.current;
          pendingDragSeekTimeRef.current = null;

          if (pendingTime !== null && dragStateRef.current?.didDrag) {
            commitSeek(pendingTime);
          }
        }, DRAG_SEEK_THROTTLE_MS - elapsed);
      }
    },
    [commitSeek]
  );

  const flushDragSeek = useCallback(
    (time?: number): void => {
      if (dragSeekTimerRef.current !== null) {
        window.clearTimeout(dragSeekTimerRef.current);
        dragSeekTimerRef.current = null;
      }

      const finalTime = time ?? pendingDragSeekTimeRef.current;
      pendingDragSeekTimeRef.current = null;

      if (finalTime !== undefined && finalTime !== null) {
        commitSeek(finalTime);
      }
    },
    [commitSeek]
  );

  const enterEditMode = useCallback((): void => {
    setDraftValue(formatTimecode(displayTime));
    setIsEditing(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [displayTime]);

  const commitDraft = useCallback((): void => {
    const nextTime = clampTime(parseTimecode(draftValue), duration);
    clearPreviewTimer();
    setPreviewTime(nextTime);
    setIsEditing(false);
    commitSeek(nextTime);
    schedulePreviewClear();
  }, [clearPreviewTimer, commitSeek, draftValue, duration, schedulePreviewClear]);

  const cancelEdit = useCallback((): void => {
    skipNextBlurCommitRef.current = true;
    setIsEditing(false);
    setDraftValue(formatTimecode(displayTime));
  }, [displayTime]);

  const handleDraftBlur = useCallback((): void => {
    if (skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      return;
    }

    commitDraft();
  }, [commitDraft]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (isEditing || event.button !== 0) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      clearPreviewTimer();
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startTime: clampTime(displayTime, duration),
        didDrag: false
      };
    },
    [clearPreviewTimer, displayTime, duration, isEditing]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - dragState.startX;
      if (!dragState.didDrag && Math.abs(deltaX) < DRAG_START_THRESHOLD_PX) return;

      dragState.didDrag = true;
      setIsDragging(true);
      const secondsPerPixel = event.altKey ? DRAG_FAST_SECONDS_PER_PIXEL : event.shiftKey ? DRAG_FINE_SECONDS_PER_PIXEL : DRAG_SECONDS_PER_PIXEL;
      const nextTime = clampTime(dragState.startTime + deltaX * secondsPerPixel, duration);
      setPreviewTime(nextTime);
      scheduleDragSeek(nextTime);
      event.preventDefault();
    },
    [duration, scheduleDragSeek]
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (dragState.didDrag) {
        const deltaX = event.clientX - dragState.startX;
        const secondsPerPixel = event.altKey ? DRAG_FAST_SECONDS_PER_PIXEL : event.shiftKey ? DRAG_FINE_SECONDS_PER_PIXEL : DRAG_SECONDS_PER_PIXEL;
        const nextTime = clampTime(dragState.startTime + deltaX * secondsPerPixel, duration);
        setPreviewTime(nextTime);
        flushDragSeek(nextTime);
        schedulePreviewClear();
      } else {
        enterEditMode();
      }

      setIsDragging(false);
      dragStateRef.current = null;
    },
    [duration, enterEditMode, flushDragSeek, schedulePreviewClear]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      flushDragSeek();
      dragStateRef.current = null;
      setIsDragging(false);
      schedulePreviewClear();
    },
    [flushDragSeek, schedulePreviewClear]
  );

  const handleDraftChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    setDraftValue(maskTimecodeInput(event.target.value));
  }, []);

  const handleDraftKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitDraft();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    },
    [cancelEdit, commitDraft]
  );

  if (isEditing) {
    return (
      <div className={clsx('flex items-center flex-col text-xl font-mono text-foreground whitespace-nowrap', className)}>
        <input
          ref={inputRef}
          value={draftValue}
          onChange={handleDraftChange}
          onKeyDown={handleDraftKeyDown}
          onBlur={handleDraftBlur}
          className="h-6 w-[12ch] border-0 bg-transparent p-0 text-center font-mono text-lg text-primary outline-none ring-0 font-bold"
          inputMode="numeric"
          aria-label="Current timecode"
        />
        <span className="h-3 text-[11px] leading-3 text-center text-muted-foreground">{durationLabel}</span>
      </div>
    );
  }

  return (
    <div
      className={clsx('group flex cursor-ew-resize touch-none select-none items-center flex-col text-xl font-mono text-foreground whitespace-nowrap', className)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerCancel}
      title={currentPreciseLabel}
    >
      <span className="h-6 border-b border-dashed border-l-0 border-t-0 border-r-0 border-transparent text-center transition-colors group-hover:border-primary text-primary font-bold">
        {activeCurrentLabel}
      </span>
      <span className="h-3 text-[11px] leading-3 text-center text-muted-foreground">{durationLabel}</span>
    </div>
  );
};
