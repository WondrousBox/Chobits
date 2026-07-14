import { getAssistantEntranceFrame } from '@packages/sprite-core/assistant-entrance';
import type { AssistantEntrancePreparePayload, AssistantEntranceRun } from '@packages/sprite-core/types';
import { useCallback, useEffect, useRef, useState } from 'react';

type AssistantEntrancePhase = 'waiting' | 'running' | 'complete';

interface UseAssistantEntranceOptions {
  enabled: boolean;
  sizeReady: boolean;
  surface: AssistantEntrancePreparePayload['surface'];
  characterRect: AssistantEntrancePreparePayload['characterRect'];
}

interface UseAssistantEntranceResult {
  rendererWrapperRef: React.RefObject<HTMLDivElement>;
  entranceComplete: boolean;
  entranceRunning: boolean;
  reportFirstFrame: () => void;
}

const FIRST_FRAME_FALLBACK_MS = 900;
const PREPARE_WATCHDOG_MS = 3200;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function useAssistantEntrance(options: UseAssistantEntranceOptions): UseAssistantEntranceResult {
  const rendererWrapperRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<AssistantEntrancePhase>('waiting');
  const phaseRef = useRef<AssistantEntrancePhase>('waiting');
  const firstFrameReadyRef = useRef(false);
  const [firstFrameReady, setFirstFrameReady] = useState(false);
  const prepareRequestedRef = useRef(false);
  const activeRunIdRef = useRef<string | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setEntrancePhase = useCallback((nextPhase: AssistantEntrancePhase): void => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const revealImmediately = useCallback((): void => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    if (watchdogTimerRef.current) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    const wrapper = rendererWrapperRef.current;
    if (wrapper) {
      wrapper.style.clipPath = 'inset(0 0 0 0)';
      wrapper.style.filter = 'none';
      wrapper.style.opacity = '1';
    }
    setEntrancePhase('complete');
  }, [setEntrancePhase]);

  const startRun = useCallback(
    (run: AssistantEntranceRun): void => {
      if (!run?.runId || phaseRef.current === 'complete' || activeRunIdRef.current === run.runId) return;
      activeRunIdRef.current = run.runId;
      setEntrancePhase('running');

      if (watchdogTimerRef.current) {
        clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }

      const render = (): void => {
        const wrapper = rendererWrapperRef.current;
        if (!wrapper || activeRunIdRef.current !== run.runId) return;
        const frame = getAssistantEntranceFrame(run, Date.now());
        const topInset = (1 - frame.scanProgress) * 100;
        wrapper.style.clipPath = `inset(${topInset.toFixed(3)}% 0 0 0)`;
        wrapper.style.opacity = frame.elapsedMs >= 0 ? '1' : '0';
        const glowStrength = run.reducedMotion ? 0 : Math.sin(frame.scanProgress * Math.PI) * 0.85;
        wrapper.style.filter =
          glowStrength > 0.01
            ? `brightness(${(1 + glowStrength * 0.12).toFixed(3)}) drop-shadow(0 0 ${(4 + glowStrength * 8).toFixed(1)}px rgba(60, 220, 255, ${(glowStrength * 0.42).toFixed(3)}))`
            : 'none';

        if (!frame.complete) {
          animationFrameIdRef.current = requestAnimationFrame(render);
          return;
        }

        animationFrameIdRef.current = null;
        activeRunIdRef.current = null;
        revealImmediately();
        void window.YUA.sprite.completeEntrance(run.runId).catch(() => undefined);
      };

      animationFrameIdRef.current = requestAnimationFrame(render);
    },
    [revealImmediately, setEntrancePhase]
  );

  const reportFirstFrame = useCallback((): void => {
    if (firstFrameReadyRef.current) return;
    firstFrameReadyRef.current = true;
    setFirstFrameReady(true);
  }, []);

  useEffect(() => {
    const unsubscribe = window.YUA.sprite.onEntranceStart(startRun);
    return unsubscribe;
  }, [startRun]);

  useEffect(() => {
    if (!options.enabled || firstFrameReadyRef.current) return;
    const timer = setTimeout(reportFirstFrame, FIRST_FRAME_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [options.enabled, reportFirstFrame]);

  useEffect(() => {
    if (!options.enabled || !options.sizeReady || !firstFrameReady || prepareRequestedRef.current || phaseRef.current !== 'waiting') return;
    prepareRequestedRef.current = true;
    watchdogTimerRef.current = setTimeout(revealImmediately, PREPARE_WATCHDOG_MS);

    const payload: AssistantEntrancePreparePayload = {
      surface: options.surface,
      characterRect: options.characterRect,
      reducedMotion: prefersReducedMotion()
    };
    void window.YUA.sprite
      .prepareEntrance(payload)
      .then((result) => {
        if (!result.played || !result.run) {
          revealImmediately();
          return;
        }
        startRun(result.run);
      })
      .catch(revealImmediately);
  }, [firstFrameReady, options.characterRect, options.enabled, options.sizeReady, options.surface, revealImmediately, startRun]);

  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
      if (watchdogTimerRef.current) clearTimeout(watchdogTimerRef.current);
    };
  }, []);

  return {
    rendererWrapperRef,
    entranceComplete: phase === 'complete',
    entranceRunning: phase === 'running',
    reportFirstFrame
  };
}
