import { AnimatePresence, motion } from 'framer-motion';
import React, { startTransition, useEffect, useRef, useState } from 'react';
import { TbHeartFilled, TbSparkles } from 'react-icons/tb';

type GainEffectType = 'xp' | 'favor';

interface GainEffect {
  id: string;
  type: GainEffectType;
  amount: number;
  offsetX: number;
  offsetY: number;
  driftX: number;
  scale: number;
  heartCount: number;
}

const EFFECT_LIFETIME_MS = 1800;
const MAX_EFFECTS = 8;

function formatGainAmount(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(1).replace(/\.0$/, '');
}

export default function PersonaGainEffects(): JSX.Element {
  const [effects, setEffects] = useState<GainEffect[]>([]);
  const effectCounterRef = useRef(0);
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    const pushEffect = (type: GainEffectType, amount: number): void => {
      if (!(amount > 0)) return;

      const id = `persona-gain-${effectCounterRef.current++}`;
      const effect: GainEffect = {
        id,
        type,
        amount,
        offsetX: type === 'xp' ? 38 + Math.round((Math.random() - 0.5) * 24) : -32 + Math.round((Math.random() - 0.5) * 28),
        offsetY: type === 'xp' ? 8 + Math.round(Math.random() * 14) : -4 + Math.round(Math.random() * 16),
        driftX: Math.round((Math.random() - 0.5) * (type === 'xp' ? 42 : 56)),
        scale: 0.92 + Math.random() * 0.2,
        heartCount: Math.max(1, Math.min(4, Math.ceil(amount)))
      };

      startTransition(() => {
        setEffects((prev) => [...prev.slice(-(MAX_EFFECTS - 1)), effect]);
      });

      const timeoutId = window.setTimeout(() => {
        startTransition(() => {
          setEffects((prev) => prev.filter((item) => item.id !== id));
        });
        timeoutIdsRef.current = timeoutIdsRef.current.filter((currentId) => currentId !== timeoutId);
      }, EFFECT_LIFETIME_MS);

      timeoutIdsRef.current.push(timeoutId);
    };

    const unsubscribeXP = window.YUA.persona.onXPGained((data) => {
      pushEffect('xp', data.amount);
    });

    const unsubscribeFavor = window.YUA.persona.onFavorChanged((data) => {
      if (data.delta > 0) {
        pushEffect('favor', data.delta);
      }
    });

    return () => {
      unsubscribeXP();
      unsubscribeFavor();
      timeoutIdsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeoutIdsRef.current = [];
    };
  }, []);

  return (
    <div className="absolute inset-0 z-[11] overflow-visible pointer-events-none">
      <AnimatePresence initial={false}>
        {effects.map((effect) => (
          <div key={effect.id} className="absolute left-1/2 top-[16%] -translate-x-1/2">
            {effect.type === 'xp' ? <XPGainEffect effect={effect} /> : <FavorGainEffect effect={effect} />}
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function XPGainEffect({ effect }: { effect: GainEffect }): JSX.Element {
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
        <div
          className="absolute inset-0 rounded-full opacity-80"
          style={{ background: 'linear-gradient(90deg, rgba(252, 211, 77, 0.18), rgba(255, 251, 235, 0.05), rgba(252, 211, 77, 0.18))' }}
        />
        <TbSparkles className="relative h-3.5 w-3.5 text-amber-500" />
        <span className="relative text-sm font-black tracking-wide text-amber-600">+{formatGainAmount(effect.amount)}</span>
        <span className="relative text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">XP</span>
      </div>
    </motion.div>
  );
}

function FavorGainEffect({ effect }: { effect: GainEffect }): JSX.Element {
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
        <div
          className="absolute inset-0 rounded-full opacity-80"
          style={{ background: 'linear-gradient(90deg, rgba(251, 113, 133, 0.18), rgba(255, 241, 242, 0.08), rgba(251, 113, 133, 0.18))' }}
        />
        <TbHeartFilled className="relative h-3.5 w-3.5 text-rose-500" />
        <span className="relative text-sm font-black tracking-wide text-rose-500">+{formatGainAmount(effect.amount)}</span>
      </div>
    </motion.div>
  );
}
