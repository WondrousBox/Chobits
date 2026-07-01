import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';
import { TbTrophy, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { AchievementPresentation } from '../config/achievements';

interface AchievementUnlockToastProps {
  achievement: (AchievementPresentation & { toastKey?: string }) | null;
  durationMs: number;
  onClose: () => void;
  onExitComplete?: () => void;
}

const AchievementUnlockToast: React.FC<AchievementUnlockToastProps> = ({ achievement, durationMs, onClose, onExitComplete }) => {
  const hasAutoClose = durationMs > 0;

  return (
    <AnimatePresence mode="wait" onExitComplete={onExitComplete}>
      {achievement && (
        <motion.div className="relative h-full w-full overflow-hidden bg-transparent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          <motion.div
            key={achievement.toastKey ?? achievement.id}
            className="relative h-full w-full overflow-hidden rounded-lg border border-amber-300/40 bg-zinc-950 text-white shadow-[0_10px_24px_rgba(0,0,0,0.32)]"
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
            <motion.div
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/90 to-transparent"
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 1.15, ease: 'easeOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -top-24 bottom-auto left-[-35%] h-[280%] w-20 rotate-[40deg] bg-[linear-gradient(90deg,transparent_0%,transparent_22%,rgba(255,255,255,0.08)_23%,rgba(255,255,255,0.34)_36%,rgba(255,255,255,0.82)_50%,rgba(255,255,255,0.34)_64%,rgba(255,255,255,0.08)_77%,transparent_78%,transparent_100%)] opacity-40"
              initial={{ x: '-90%' }}
              animate={{ x: '780%' }}
              transition={{ duration: 1.8, delay: 0.28, repeat: 1, repeatDelay: 0.36, ease: 'easeInOut' }}
            />

            <div className="relative flex h-full min-w-0 items-center gap-3 px-4 py-3 pl-5 box-border">
              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-amber-200/60 bg-gradient-to-br from-yellow-200 via-amber-400 to-orange-500 shadow-[0_0_24px_rgba(251,191,36,0.46)]">
                <motion.div
                  className="absolute inset-0 rounded-md border border-white/60"
                  animate={{ opacity: [0.65, 0.15, 0.65], scale: [1, 1.18, 1] }}
                  transition={{ duration: 1.7, repeat: Infinity, ease: 'easeOut' }}
                />
                <TbTrophy className="relative text-zinc-950 drop-shadow-sm" size={28} />
              </div>

              <div className="min-w-0 flex-1 pr-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[10px] font-semibold tracking-[0.18em] text-amber-200">成就解锁</span>
                  {achievement.category && <span className="min-w-0 truncate rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[10px] text-zinc-300">{achievement.category}</span>}
                </div>
                <div className="mt-1 truncate text-base font-bold leading-5 text-white">{achievement.title}</div>
                <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-zinc-300 truncate">{achievement.description}</div>
              </div>

              <Button size="sm" variant="ghost" className="h-8 w-8 shrink-0 rounded-full text-zinc-300 hover:bg-white/10 hover:text-white" onClick={onClose}>
                <TbX />
              </Button>
            </div>

            <motion.div
              className="absolute bottom-0 left-0 h-0.5 bg-amber-300"
              initial={{ width: '100%' }}
              animate={{ width: hasAutoClose ? '0%' : '100%' }}
              transition={{ duration: hasAutoClose ? durationMs / 1000 : 0, ease: 'linear' }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AchievementUnlockToast;
