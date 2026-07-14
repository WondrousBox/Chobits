import { getSpriteMotionEffectFrame } from '@packages/sprite-core/sprite-motion-effect';
import type { SpriteMotionEffectRun } from '@packages/sprite-core/types';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAssistantMotionEffectResult {
  motionWrapperRef: React.RefObject<HTMLDivElement>;
  motionRunning: boolean;
}

export function useAssistantMotionEffect(enabled: boolean): UseAssistantMotionEffectResult {
  const motionWrapperRef = useRef<HTMLDivElement>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const [motionRunning, setMotionRunning] = useState(false);

  const restore = useCallback((): void => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
    activeRunIdRef.current = null;
    const wrapper = motionWrapperRef.current;
    if (wrapper) {
      wrapper.style.opacity = '1';
      wrapper.style.transform = 'none';
      wrapper.style.filter = 'none';
      wrapper.style.transformOrigin = 'center center';
    }
    setMotionRunning(false);
  }, []);

  const startRun = useCallback(
    (run: SpriteMotionEffectRun): void => {
      if (!enabled || run.type !== 'warp' || !run.runId || activeRunIdRef.current === run.runId) return;
      if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
      activeRunIdRef.current = run.runId;
      setMotionRunning(true);

      const render = (): void => {
        const wrapper = motionWrapperRef.current;
        if (!wrapper || activeRunIdRef.current !== run.runId) return;
        const frame = getSpriteMotionEffectFrame(run, Date.now());
        const arrivalStarted = frame.elapsedMs >= run.timeline.arriveStartMs;
        const visibility = arrivalStarted ? frame.arriveProgress : 1 - frame.dissolveProgress;
        const scale = arrivalStarted ? 0.82 + frame.arriveProgress * 0.18 : 1 - frame.dissolveProgress * 0.08;
        const glow = arrivalStarted ? 1 - frame.arriveProgress : frame.dissolveProgress;
        wrapper.style.opacity = Math.max(0, Math.min(1, visibility)).toFixed(3);
        wrapper.style.transform = `scale(${scale.toFixed(3)})`;
        wrapper.style.filter = run.reducedMotion
          ? 'none'
          : `brightness(${(1 + glow * 0.7).toFixed(3)}) blur(${(glow * 1.6).toFixed(2)}px) drop-shadow(0 0 ${(6 + glow * 16).toFixed(1)}px rgba(47, 225, 255, ${(0.2 + glow * 0.5).toFixed(3)}))`;

        if (!frame.complete) {
          animationFrameIdRef.current = requestAnimationFrame(render);
          return;
        }

        restore();
        void window.YUA.sprite.completeMotionEffect(run.runId).catch(() => undefined);
      };

      animationFrameIdRef.current = requestAnimationFrame(render);
    },
    [enabled, restore]
  );

  useEffect(() => {
    const unsubscribeStart = window.YUA.sprite.onMotionEffectStart(startRun);
    const unsubscribeCancel = window.YUA.sprite.onMotionEffectCancel((payload) => {
      if (activeRunIdRef.current === payload.runId) restore();
    });
    return () => {
      unsubscribeStart();
      unsubscribeCancel();
    };
  }, [restore, startRun]);

  useEffect(() => restore, [restore]);

  return { motionWrapperRef, motionRunning };
}
