import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpritePlayer } from '@/components/AIAssistant/context/SpritePlayerContext';
import type { SpriteAnimation, SpriteEventType } from '@/components/AIAssistant/types';
import { resolveSpriteSrc } from '@/lib/resourceProtocol';

export type AssistantVisualState = 'idle' | 'dragging' | 'walking' | 'running' | 'click' | 'hold' | 'drop';

function pickByEvent(animations: SpriteAnimation[], event: SpriteEventType): SpriteAnimation | undefined {
  return animations.find((a) => a.meta.eventType === event);
}

function resolveEventsForState(state: AssistantVisualState): SpriteEventType[] {
  switch (state) {
    case 'idle':
      // Prefer common idle-like events; include 'stand' to support assets labeled as standing
      return ['idle', 'stand', 'breath', 'idle2', 'blink'];
    case 'dragging':
      return ['drag'];
    case 'walking':
      return ['walk'];
    case 'running':
      return ['run'];
    case 'click':
      return ['click'];
    case 'hold':
      return ['hold'];
    case 'drop':
      return ['drop'];
  }
}

function findAnimationForState(animations: SpriteAnimation[], state: AssistantVisualState): SpriteAnimation | undefined {
  const events = resolveEventsForState(state);
  for (const e of events) {
    const found = pickByEvent(animations, e);
    if (found) return found;
  }
  return undefined;
}

function preloadSprite(anim?: SpriteAnimation): void {
  if (!anim) return;
  const { url } = resolveSpriteSrc(anim.source);
  if (!url) return;
  // warm up media cache via a detached video element
  const v = document.createElement('video');
  v.src = url;
  v.preload = 'auto';
  v.muted = true;
  // start loading and then cleanup later
  // we don't append to DOM to keep it lightweight
  setTimeout(() => {
    v.src = '';
  }, 5000);
}

export default function useSpriteConductor(): {
  state: AssistantVisualState;
  to: (s: AssistantVisualState) => void;
  playOnce: (s: AssistantVisualState, opts?: { fallback?: AssistantVisualState; durationMs?: number }) => void;
} {
  const { list, setCurrent, currentId } = useSpritePlayer();
  const animations = list();

  const [state, setState] = useState<AssistantVisualState>('idle');
  const stateRef = useRef<AssistantVisualState>('idle');
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStableRef = useRef<AssistantVisualState>('idle');

  const pick = useCallback((s: AssistantVisualState) => findAnimationForState(animations, s), [animations]);

  const switchTo = useCallback(
    (s: AssistantVisualState) => {
      // avoid redundant switches
      const anim = pick(s) || pick('idle');
      if (!anim) return;
      if (anim.meta.id !== currentId) {
        // preload a bit before switch for smoothness
        preloadSprite(anim);
        setCurrent(anim.meta.id);
      }
      stateRef.current = s;
      setState(s);
      if (s !== 'click' && s !== 'hold') previousStableRef.current = s;
    },
    [currentId, pick, setCurrent]
  );

  const to = useCallback(
    (s: AssistantVisualState) => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      // tiny debounce when returning to idle to prevent flicker
      if (s === 'idle' && stateRef.current !== 'idle') {
        pendingTimerRef.current = setTimeout(() => switchTo('idle'), 120);
        return;
      }
      switchTo(s);
    },
    [switchTo]
  );

  const playOnce = useCallback(
    (s: AssistantVisualState, opts?: { fallback?: AssistantVisualState; durationMs?: number }) => {
      const anim = pick(s);
      if (!anim) return;
      const duration = anim.durationMs ?? opts?.durationMs ?? 800;
      switchTo(s);
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      pendingTimerRef.current = setTimeout(
        () => {
          const fb = opts?.fallback ?? previousStableRef.current ?? 'idle';
          switchTo(fb);
        },
        Math.max(200, duration)
      );
    },
    [pick, switchTo]
  );

  // Preload common states on mount/update
  useEffect(() => {
    preloadSprite(pick('idle'));
    preloadSprite(pick('dragging'));
    preloadSprite(pick('walking'));
    preloadSprite(pick('running'));
    preloadSprite(pick('click'));
  }, [pick]);

  // Cleanup timer
  useEffect(() => {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
  }, []);

  return {
    // current visual state
    state,
    // switch to target persistent state
    to,
    // play an ephemeral state then go back
    playOnce
  };
}
