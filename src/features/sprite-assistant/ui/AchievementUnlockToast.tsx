import { AnimatePresence, motion } from 'framer-motion';
import { Trophy, X } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { AchievementPresentation } from '../config/achievements';

interface AchievementUnlockToastProps {
  achievement: AchievementPresentation | null;
  durationMs: number;
  onClose: () => void;
}

const SPARKS = Array.from({ length: 10 }, (_, index) => ({
  id: index,
  angle: -45 + index * 15,
  delay: index * 0.04
}));

const AchievementUnlockToast: React.FC<AchievementUnlockToastProps> = ({ achievement, durationMs, onClose }) => {
  return (
    <AnimatePresence>
      {achievement && (
        <motion.div className="relative h-full w-full overflow-hidden bg-transparent p-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          <motion.div
            key={achievement.id}
            className="relative h-full w-full overflow-hidden rounded-lg border border-amber-300/45 bg-zinc-950 text-white shadow-[0_18px_52px_rgba(0,0,0,0.48)]"
            initial={{ x: 34, opacity: 0, scale: 0.96 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 28, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-200 via-yellow-400 to-orange-500" />
            <motion.div
              className="absolute -right-10 -top-16 h-32 w-32 rounded-full bg-amber-300/20 blur-2xl"
              animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.08, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent" initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ duration: 1.15, ease: 'easeOut' }} />

            <div className="relative flex h-full min-w-0 items-center gap-3 px-4 py-3 pl-5">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-amber-200/55 bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 shadow-[0_0_28px_rgba(251,191,36,0.5)]">
                <motion.div
                  className="absolute inset-0 rounded-md border border-white/55"
                  animate={{ opacity: [0.65, 0.15, 0.65], scale: [1, 1.18, 1] }}
                  transition={{ duration: 1.7, repeat: Infinity, ease: 'easeOut' }}
                />
                <Trophy className="relative text-zinc-950 drop-shadow-sm" />
                {SPARKS.map((spark) => {
                  const radius = 34;
                  const x = Math.cos((spark.angle * Math.PI) / 180) * radius;
                  const y = Math.sin((spark.angle * Math.PI) / 180) * radius;
                  return (
                    <motion.span
                      key={spark.id}
                      className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-amber-100"
                      initial={{ x: '-50%', y: '-50%', opacity: 0, scale: 0 }}
                      animate={{ x: `calc(-50% + ${x}px)`, y: `calc(-50% + ${y}px)`, opacity: [0, 1, 0], scale: [0, 1.2, 0.2] }}
                      transition={{ duration: 0.9, delay: spark.delay, repeat: Infinity, repeatDelay: 2.2, ease: 'easeOut' }}
                    />
                  );
                })}
              </div>

              <div className="min-w-0 flex-1 pr-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">Achievement</span>
                  {achievement.category && <span className="min-w-0 truncate rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] text-zinc-300">{achievement.category}</span>}
                </div>
                <div className="mt-1 truncate text-base font-bold leading-5 text-white">{achievement.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-zinc-300">{achievement.description}</div>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 rounded-full text-zinc-300 hover:bg-white/10 hover:text-white" onClick={onClose}>
                    <X />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>关闭</TooltipContent>
              </Tooltip>
            </div>

            <motion.div className="absolute bottom-0 left-0 h-0.5 bg-amber-300" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: durationMs / 1000, ease: 'linear' }} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AchievementUnlockToast;
