/**
 * LevelUpAnimation - 升级动效组件
 *
 * 全屏覆盖层，居中显示升级效果
 * - 金色徽章 + 粒子爆发效果
 * - "Level Up!" 文字 + 等级变化显示
 * - 解锁内容提示
 * - 3秒后自动消失
 */
import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';
import { TbSparkles, TbStarFilled } from 'react-icons/tb';

import { LevelUnlock } from '../config/levelUnlocks';
import { getUnlocksAtLevel } from '../config/levelUnlocks';

export interface LevelUpData {
  oldLevel: number;
  newLevel: number;
}

interface LevelUpAnimationProps {
  data: LevelUpData | null;
  onComplete?: () => void;
}

/** 粒子配置 */
const PARTICLE_COUNT = 12;
const PARTICLE_COLORS = ['#fbbf24', '#f59e0b', '#fcd34d', '#fde68a', '#ffffff'];

/** 生成粒子数据 */
const generateParticles = () => {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    angle: (360 / PARTICLE_COUNT) * i,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    delay: i * 0.03,
    size: 6 + Math.random() * 6,
    distance: 80 + Math.random() * 40
  }));
};

/** 单个粒子组件 */
const Particle: React.FC<{ particle: ReturnType<typeof generateParticles>[number] }> = ({ particle }) => {
  const x = Math.cos((particle.angle * Math.PI) / 180) * particle.distance;
  const y = Math.sin((particle.angle * Math.PI) / 180) * particle.distance;

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 rounded-full"
      style={{
        width: particle.size,
        height: particle.size,
        backgroundColor: particle.color,
        boxShadow: `0 0 ${particle.size}px ${particle.color}`
      }}
      initial={{ x: '-50%', y: '-50%', scale: 0, opacity: 1 }}
      animate={{
        x: `calc(-50% + ${x}px)`,
        y: `calc(-50% + ${y}px)`,
        scale: [0, 1.5, 0.5],
        opacity: [1, 1, 0]
      }}
      transition={{
        duration: 0.8,
        delay: particle.delay,
        ease: 'easeOut'
      }}
    />
  );
};

/** 解锁内容卡片 */
const UnlockCard: React.FC<{ unlock: LevelUnlock; delay: number }> = ({ unlock, delay }) => {
  const typeColors: Record<string, string> = {
    animation: 'from-pink-500 to-rose-500',
    behavior: 'from-green-500 to-emerald-500',
    skill: 'from-blue-500 to-cyan-500',
    feature: 'from-purple-500 to-violet-500'
  };

  return (
    <motion.div
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/90 shadow-lg"
      initial={{ opacity: 0, y: 20, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.4, type: 'spring' }}
    >
      <div
        className={`
        flex items-center justify-center w-8 h-8 rounded-full
        bg-gradient-to-br ${typeColors[unlock.type] || 'from-gray-500 to-gray-600'}
        text-white text-sm
      `}
      >
        {unlock.icon || '🎁'}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-bold text-slate-800">{unlock.name}</span>
        <span className="text-xs text-slate-500">{unlock.description}</span>
      </div>
    </motion.div>
  );
};

const LevelUpAnimation: React.FC<LevelUpAnimationProps> = ({ data, onComplete }) => {
  // 获取解锁内容
  const unlocks = data ? getUnlocksAtLevel(data.newLevel) : [];

  // 自动关闭
  React.useEffect(() => {
    if (data) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [data, onComplete]);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 背景遮罩 */}
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* 粒子效果 */}
          <div className="absolute inset-0 overflow-hidden">
            {generateParticles().map((particle) => (
              <Particle key={particle.id} particle={particle} />
            ))}
          </div>

          {/* 主内容 */}
          <motion.div
            className="relative flex flex-col items-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.5 }}
          >
            {/* 徽章 */}
            <motion.div
              className="
                flex items-center justify-center w-28 h-28 rounded-full
                bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-500
                shadow-2xl mb-4
              "
              style={{
                boxShadow: '0 0 60px rgba(251, 191, 36, 0.6), 0 0 100px rgba(251, 191, 36, 0.3)'
              }}
              animate={{
                boxShadow: [
                  '0 0 60px rgba(251, 191, 36, 0.6), 0 0 100px rgba(251, 191, 36, 0.3)',
                  '0 0 80px rgba(251, 191, 36, 0.8), 0 0 120px rgba(251, 191, 36, 0.4)',
                  '0 0 60px rgba(251, 191, 36, 0.6), 0 0 100px rgba(251, 191, 36, 0.3)'
                ]
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <TbStarFilled className="w-14 h-14 text-white drop-shadow-lg" />
            </motion.div>

            {/* Level Up! 文字 */}
            <motion.div
              className="flex items-center gap-2 mb-2"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <TbSparkles className="w-6 h-6 text-amber-400" />
              <span
                className="text-3xl font-bold bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 bg-clip-text text-transparent"
                style={{
                  textShadow: '0 0 20px rgba(251, 191, 36, 0.5)'
                }}
              >
                Level Up!
              </span>
              <TbSparkles className="w-6 h-6 text-amber-400" />
            </motion.div>

            {/* 等级变化 */}
            <motion.div
              className="flex items-center gap-3 text-2xl font-bold mb-4"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
            >
              <span className="text-slate-400 line-through">Lv.{data.oldLevel}</span>
              <span className="text-white">→</span>
              <span className="text-amber-400">Lv.{data.newLevel}</span>
            </motion.div>

            {/* 解锁内容 */}
            {unlocks.length > 0 && (
              <motion.div
                className="flex flex-col gap-2 mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
              >
                <span className="text-sm text-amber-300 text-center mb-1">解锁新内容</span>
                {unlocks.map((unlock, index) => (
                  <UnlockCard key={unlock.id} unlock={unlock} delay={0.6 + index * 0.15} />
                ))}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LevelUpAnimation;
