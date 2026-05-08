import {
  isBubbleWindowMode,
  normalizeSpriteBubbleMode,
  type SpriteBubbleMode,
  type SpriteEffectBridgePayload,
  type SpriteEffectClearPayload,
  type SpriteEffectPayload
} from '@packages/sprite-core/types';
import { AnimatePresence, motion } from 'framer-motion';
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbHeartFilled, TbSparkles } from 'react-icons/tb';

type EffectPresentation = 'inline' | 'window';
type GainEffectVariant = 'xp' | 'favor';

interface PersonaGainEffectsProps {
  presentation?: EffectPresentation;
}

interface SpriteEffectItem {
  id: string;
  type: string;
  variant?: string;
  amount?: number;
  title?: string;
  content?: string;
  data?: Record<string, unknown>;
  offsetX: number;
  offsetY: number;
  driftX: number;
  scale: number;
  heartCount: number;
  surfaceWidth: number;
  surfaceHeight: number;
  durationMs: number;
}

const PERSONA_GAIN_EFFECT_TYPE = 'persona-gain';
const EFFECT_LIFETIME_MS = 1800;
const GENERIC_EFFECT_LIFETIME_MS = 2200;
const HIDE_DELAY_MS = 220;
const MAX_EFFECTS = 8;
const MIN_EFFECT_WIDTH = 360;
const MIN_EFFECT_HEIGHT = 220;
const MAX_EFFECT_WIDTH = 640;
const MAX_EFFECT_HEIGHT = 360;
const DEFAULT_PERSONA_GAIN_SURFACE = { width: 420, height: 260 };
const DEFAULT_GENERIC_SURFACE = { width: 360, height: 220 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatGainAmount(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(1).replace(/\.0$/, '');
}

function resolveEffectSurface(payload: SpriteEffectPayload, fallback: { width: number; height: number }): { width: number; height: number } {
  const width = typeof payload.surface?.width === 'number' && Number.isFinite(payload.surface.width) ? payload.surface.width : fallback.width;
  const height = typeof payload.surface?.height === 'number' && Number.isFinite(payload.surface.height) ? payload.surface.height : fallback.height;
  return {
    width: clamp(Math.round(width), MIN_EFFECT_WIDTH, MAX_EFFECT_WIDTH),
    height: clamp(Math.round(height), MIN_EFFECT_HEIGHT, MAX_EFFECT_HEIGHT)
  };
}

function resolveDuration(payload: SpriteEffectPayload, fallback: number): number {
  if (typeof payload.duration !== 'number' || !Number.isFinite(payload.duration)) return fallback;
  return Math.max(300, Math.round(payload.duration));
}

function createEffectItem(payload: SpriteEffectPayload, id: string): SpriteEffectItem | null {
  if (payload.type === PERSONA_GAIN_EFFECT_TYPE) {
    const variant: GainEffectVariant = payload.variant === 'favor' ? 'favor' : 'xp';
    const amount = typeof payload.amount === 'number' && Number.isFinite(payload.amount) ? payload.amount : 0;
    if (!(amount > 0)) return null;

    const surface = resolveEffectSurface(payload, DEFAULT_PERSONA_GAIN_SURFACE);
    return {
      id,
      type: payload.type,
      variant,
      amount,
      title: payload.title,
      content: payload.content,
      data: payload.data,
      offsetX: variant === 'xp' ? 38 + Math.round((Math.random() - 0.5) * 24) : -32 + Math.round((Math.random() - 0.5) * 28),
      offsetY: variant === 'xp' ? 8 + Math.round(Math.random() * 14) : -4 + Math.round(Math.random() * 16),
      driftX: Math.round((Math.random() - 0.5) * (variant === 'xp' ? 42 : 56)),
      scale: 0.92 + Math.random() * 0.2,
      heartCount: variant === 'favor' ? Math.max(1, Math.min(4, Math.ceil(amount))) : 0,
      surfaceWidth: surface.width,
      surfaceHeight: surface.height,
      durationMs: resolveDuration(payload, EFFECT_LIFETIME_MS)
    };
  }

  const surface = resolveEffectSurface(payload, DEFAULT_GENERIC_SURFACE);
  return {
    id,
    type: payload.type,
    variant: payload.variant,
    amount: payload.amount,
    title: payload.title,
    content: payload.content,
    data: payload.data,
    offsetX: 0,
    offsetY: 0,
    driftX: 0,
    scale: 1,
    heartCount: 0,
    surfaceWidth: surface.width,
    surfaceHeight: surface.height,
    durationMs: resolveDuration(payload, GENERIC_EFFECT_LIFETIME_MS)
  };
}

function resolveViewportSize(effects: SpriteEffectItem[]): { width: number; height: number } {
  if (effects.length === 0) return DEFAULT_PERSONA_GAIN_SURFACE;
  return effects.reduce(
    (size, effect) => ({
      width: Math.max(size.width, effect.surfaceWidth),
      height: Math.max(size.height, effect.surfaceHeight)
    }),
    DEFAULT_PERSONA_GAIN_SURFACE
  );
}

export default function PersonaGainEffects({ presentation = 'inline' }: PersonaGainEffectsProps): JSX.Element | null {
  const [effects, setEffects] = useState<SpriteEffectItem[]>([]);
  const [bubbleMode, setBubbleMode] = useState<SpriteBubbleMode>(() => normalizeSpriteBubbleMode(undefined));
  const effectCounterRef = useRef(0);
  const timeoutIdsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVisibleRef = useRef<boolean | null>(null);
  const lastBubbleModeRef = useRef<SpriteBubbleMode | null>(null);

  const isWindowPresentation = presentation === 'window';
  const isWindowMode = isBubbleWindowMode(bubbleMode);
  const viewport = useMemo(() => resolveViewportSize(effects), [effects]);

  const setWindowVisible = useCallback((visible: boolean): void => {
    if (lastVisibleRef.current === visible) return;
    lastVisibleRef.current = visible;
    void window.YUA.sprite.effectSetVisible(visible).catch(() => undefined);
  }, []);

  const clearHideTimer = useCallback((): void => {
    if (!hideTimerRef.current) return;
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const clearEffectTimer = useCallback((id: string): void => {
    const timeoutId = timeoutIdsRef.current.get(id);
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutIdsRef.current.delete(id);
  }, []);

  const clearAllEffectTimers = useCallback((): void => {
    for (const timeoutId of timeoutIdsRef.current.values()) {
      clearTimeout(timeoutId);
    }
    timeoutIdsRef.current.clear();
  }, []);

  const removeEffect = useCallback(
    (id: string): void => {
      clearEffectTimer(id);
      startTransition(() => {
        setEffects((prev) => prev.filter((item) => item.id !== id));
      });
    },
    [clearEffectTimer]
  );

  const clearAllEffects = useCallback((): void => {
    clearAllEffectTimers();
    startTransition(() => {
      setEffects([]);
    });
  }, [clearAllEffectTimers]);

  const clearEffects = useCallback(
    (payload?: SpriteEffectClearPayload): void => {
      if (!payload || payload.type === 'all') {
        clearAllEffects();
        return;
      }

      if (payload.id) {
        removeEffect(payload.id);
        return;
      }

      if (!payload.type) {
        clearAllEffects();
        return;
      }

      startTransition(() => {
        setEffects((prev) => {
          const next = prev.filter((item) => item.type !== payload.type);
          for (const item of prev) {
            if (item.type === payload.type) {
              clearEffectTimer(item.id);
            }
          }
          return next;
        });
      });
    },
    [clearAllEffects, clearEffectTimer, removeEffect]
  );

  const pushEffect = useCallback(
    (payload: SpriteEffectPayload): void => {
      if (!payload || typeof payload.type !== 'string' || !payload.type.trim()) return;

      const explicitId = typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : null;
      const id = explicitId ?? `sprite-effect-${effectCounterRef.current++}`;
      const effect = createEffectItem({ ...payload, type: payload.type.trim() }, id);
      if (!effect) return;

      clearEffectTimer(id);
      startTransition(() => {
        setEffects((prev) => {
          const filtered = explicitId ? prev.filter((item) => item.id !== id) : prev;
          return [...filtered.slice(-(MAX_EFFECTS - 1)), effect];
        });
      });

      const timeoutId = setTimeout(() => {
        removeEffect(id);
      }, effect.durationMs);
      timeoutIdsRef.current.set(id, timeoutId);
    },
    [clearEffectTimer, removeEffect]
  );

  const handleEffectBridge = useCallback(
    (event: SpriteEffectBridgePayload): void => {
      if (event.kind === 'show') {
        pushEffect(event.payload);
        return;
      }

      clearEffects(event.payload);
    },
    [clearEffects, pushEffect]
  );

  useEffect(() => {
    const unsubscribe = window.YUA.sprite.onEffect(handleEffectBridge);
    return () => {
      unsubscribe();
    };
  }, [handleEffectBridge]);

  useEffect(() => {
    let disposed = false;

    window.YUA.sprite
      .getBubbleMode()
      .then((mode) => {
        if (!disposed) setBubbleMode(normalizeSpriteBubbleMode(mode));
      })
      .catch(() => undefined);

    const unsubscribe = window.YUA.sprite.onConfig((config) => {
      if (!config) return;
      setBubbleMode(normalizeSpriteBubbleMode(config.bubbleMode));
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (lastBubbleModeRef.current === null) {
      lastBubbleModeRef.current = bubbleMode;
      return;
    }

    if (lastBubbleModeRef.current === bubbleMode) return;
    lastBubbleModeRef.current = bubbleMode;
    clearAllEffects();
    if (isWindowPresentation && !isBubbleWindowMode(bubbleMode)) {
      clearHideTimer();
      setWindowVisible(false);
    }
  }, [bubbleMode, clearAllEffects, clearHideTimer, isWindowPresentation, setWindowVisible]);

  useEffect(() => {
    if (!isWindowPresentation) return;

    if (!isWindowMode) {
      clearHideTimer();
      setWindowVisible(false);
      return;
    }

    if (effects.length > 0) {
      clearHideTimer();
      void window.YUA.sprite.effectResize(viewport.width, viewport.height).catch(() => undefined);
      setWindowVisible(true);
      return;
    }

    if (lastVisibleRef.current !== false && !hideTimerRef.current) {
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        setWindowVisible(false);
      }, HIDE_DELAY_MS);
    }

    return clearHideTimer;
  }, [clearHideTimer, effects.length, isWindowMode, isWindowPresentation, setWindowVisible, viewport.height, viewport.width]);

  useEffect(() => {
    if (presentation !== 'inline') return;

    const dispatchEffect = (payload: SpriteEffectPayload): void => {
      void window.YUA.sprite.effectShow(payload).catch(() => undefined);
    };

    const unsubscribeXP = window.YUA.persona.onXPGained((data) => {
      if (data.amount <= 0) return;
      dispatchEffect({
        type: PERSONA_GAIN_EFFECT_TYPE,
        variant: 'xp',
        amount: data.amount,
        duration: EFFECT_LIFETIME_MS,
        surface: DEFAULT_PERSONA_GAIN_SURFACE
      });
    });

    const unsubscribeFavor = window.YUA.persona.onFavorChanged((data) => {
      if (data.delta <= 0) return;
      dispatchEffect({
        type: PERSONA_GAIN_EFFECT_TYPE,
        variant: 'favor',
        amount: data.delta,
        duration: EFFECT_LIFETIME_MS,
        surface: DEFAULT_PERSONA_GAIN_SURFACE
      });
    });

    return () => {
      unsubscribeXP();
      unsubscribeFavor();
    };
  }, [presentation]);

  useEffect(() => {
    return () => {
      clearHideTimer();
      clearAllEffectTimers();
    };
  }, [clearAllEffectTimers, clearHideTimer]);

  if (isWindowPresentation && !isWindowMode) {
    return null;
  }

  const anchorClassName = isWindowPresentation ? 'absolute left-1/2 top-[58%] -translate-x-1/2' : 'absolute left-1/2 top-[16%] -translate-x-1/2';

  return (
    <div
      className={
        isWindowPresentation
          ? 'fixed inset-0 flex items-center justify-center overflow-visible pointer-events-none select-none'
          : 'absolute inset-0 z-[11] overflow-visible pointer-events-none select-none'
      }
    >
      <div
        className={isWindowPresentation ? 'relative overflow-visible' : 'absolute inset-0 overflow-visible'}
        style={isWindowPresentation ? { width: viewport.width, height: viewport.height } : undefined}
      >
        <AnimatePresence initial={false}>
          {effects.map((effect) => (
            <div key={effect.id} className={anchorClassName}>
              <SpriteEffectRenderer effect={effect} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SpriteEffectRenderer({ effect }: { effect: SpriteEffectItem }): JSX.Element {
  if (effect.type === PERSONA_GAIN_EFFECT_TYPE) {
    return effect.variant === 'favor' ? <FavorGainEffect effect={effect} /> : <XPGainEffect effect={effect} />;
  }

  return <GenericEffect effect={effect} />;
}

function XPGainEffect({ effect }: { effect: SpriteEffectItem }): JSX.Element {
  const amount = effect.amount ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: effect.offsetX, y: effect.offsetY + 18, scale: 0.78 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: [effect.offsetX, effect.offsetX + effect.driftX * 0.35, effect.offsetX + effect.driftX],
        y: [effect.offsetY + 18, effect.offsetY - 26, effect.offsetY - 86],
        scale: [0.78, 1.08 * effect.scale, effect.scale]
      }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 1.55, ease: 'easeOut' }}
      className="relative"
    >
      <motion.div
        className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2 rounded-full"
        style={{ background: 'linear-gradient(90deg, rgba(253, 224, 71, 0), rgba(251, 191, 36, 0.9), rgba(253, 224, 71, 0))' }}
        initial={{ opacity: 0, scaleX: 0.2 }}
        animate={{ opacity: [0, 0.9, 0], scaleX: [0.2, 1.2, 1.5] }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />

      <div className="relative flex items-center gap-1 rounded-full border border-amber-200/90 bg-amber-50/90 px-2.5 py-1 shadow-[0_0_28px_rgba(251,191,36,0.35)] backdrop-blur-sm">
        <div className="absolute inset-0 rounded-full opacity-80" style={{ background: 'linear-gradient(90deg, rgba(252, 211, 77, 0.18), rgba(255, 251, 235, 0.05), rgba(252, 211, 77, 0.18))' }} />
        <TbSparkles className="relative h-3.5 w-3.5 text-amber-500" />
        <span className="relative text-sm font-black tracking-wide text-amber-600">+{formatGainAmount(amount)}</span>
        <span className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">XP</span>
      </div>
    </motion.div>
  );
}

function FavorGainEffect({ effect }: { effect: SpriteEffectItem }): JSX.Element {
  const amount = effect.amount ?? 0;
  const heartOffsets = Array.from({ length: effect.heartCount }, (_, index) => (index - (effect.heartCount - 1) / 2) * 12);

  return (
    <motion.div
      initial={{ opacity: 0, x: effect.offsetX, y: effect.offsetY + 24, scale: 0.82 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: [effect.offsetX, effect.offsetX + effect.driftX * 0.25, effect.offsetX + effect.driftX * 0.55],
        y: [effect.offsetY + 24, effect.offsetY - 18, effect.offsetY - 74],
        scale: [0.82, 1.04 * effect.scale, effect.scale]
      }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ duration: 1.65, ease: 'easeOut' }}
      className="relative"
    >
      {heartOffsets.map((x, index) => (
        <motion.div
          key={`${effect.id}-heart-${index}`}
          className="absolute left-1/2 top-0"
          initial={{ opacity: 0, x, y: 6, scale: 0.45 }}
          animate={{
            opacity: [0, 0.95, 0],
            x: [x, x + (index % 2 === 0 ? -8 : 8), x + (index % 2 === 0 ? -14 : 14)],
            y: [8, -24 - index * 8, -52 - index * 10],
            scale: [0.45, 1, 0.82]
          }}
          transition={{ duration: 1.15, delay: index * 0.08, ease: 'easeOut' }}
        >
          <TbHeartFilled className="h-4 w-4 text-rose-400 drop-shadow-[0_0_10px_rgba(251,113,133,0.65)]" />
        </motion.div>
      ))}

      <div className="relative flex items-center gap-1 rounded-full border border-rose-200/90 bg-rose-50/90 px-2.5 py-1 shadow-[0_0_28px_rgba(251,113,133,0.28)] backdrop-blur-sm">
        <div className="absolute inset-0 rounded-full opacity-80" style={{ background: 'linear-gradient(90deg, rgba(251, 113, 133, 0.18), rgba(255, 241, 242, 0.08), rgba(251, 113, 133, 0.18))' }} />
        <TbHeartFilled className="relative h-3.5 w-3.5 text-rose-500" />
        <span className="relative text-sm font-black tracking-wide text-rose-500">+{formatGainAmount(amount)}</span>
      </div>
    </motion.div>
  );
}

function GenericEffect({ effect }: { effect: SpriteEffectItem }): JSX.Element {
  const title = effect.title || effect.type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.88 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [28, -2, -48],
        scale: [0.88, 1, 0.96]
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1.8, ease: 'easeOut' }}
      className="relative"
    >
      <motion.div
        className="absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 rounded-full"
        style={{ background: 'linear-gradient(90deg, rgba(125, 211, 252, 0), rgba(59, 130, 246, 0.72), rgba(125, 211, 252, 0))' }}
        initial={{ opacity: 0, scaleX: 0.3 }}
        animate={{ opacity: [0, 0.7, 0], scaleX: [0.3, 1.1, 1.4] }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      <div className="relative max-w-[360px] rounded-xl border border-sky-200/90 bg-sky-50/90 px-3 py-2 shadow-[0_0_28px_rgba(59,130,246,0.24)] backdrop-blur-sm">
        <div className="absolute inset-0 rounded-xl opacity-70" style={{ background: 'linear-gradient(90deg, rgba(125, 211, 252, 0.16), rgba(240, 249, 255, 0.08), rgba(147, 197, 253, 0.14))' }} />
        <div className="relative flex items-center gap-1.5">
          <TbSparkles className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          <span className="min-w-0 truncate text-sm font-black text-sky-600">{title}</span>
          {typeof effect.amount === 'number' && <span className="shrink-0 text-sm font-black text-sky-500">+{formatGainAmount(effect.amount)}</span>}
        </div>
        {effect.content && <div className="relative mt-0.5 max-w-full break-words text-xs font-medium leading-snug text-sky-700/80">{effect.content}</div>}
      </div>
    </motion.div>
  );
}
