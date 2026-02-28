/**
 * LevelUp 页面 - 升级动画全屏展示
 *
 * 在屏幕中央显示升级动画，包括：
 * - 金色徽章 + 粒子爆发效果
 * - "Level Up!" 文字 + 等级变化显示
 * - 解锁内容提示
 * - 4秒后自动关闭窗口
 */
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { TbSparkles, TbStarFilled } from 'react-icons/tb';

import { LevelUnlock } from '../config/levelUnlocks';
import { getUnlocksAtLevel } from '../config/levelUnlocks';

interface LevelUpData {
  oldLevel: number;
  newLevel: number;
}

/** 粒子配置 */
const PARTICLE_COUNT = 16;
const PARTICLE_COLORS = ['#fbbf24', '#f59e0b', '#fcd34d', '#fde68a', '#ffffff', '#fef3c7'];

/** 生成粒子数据 */
const generateParticles = () => {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    angle: (360 / PARTICLE_COUNT) * i,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
    delay: i * 0.02,
    size: 8 + Math.random() * 8,
    distance: 100 + Math.random() * 60
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
        boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`
      }}
      initial={{ x: '-50%', y: '-50%', scale: 0, opacity: 1 }}
      animate={{
        x: `calc(-50% + ${x}px)`,
        y: `calc(-50% + ${y}px)`,
        scale: [0, 1.8, 0.3],
        opacity: [1, 1, 0]
      }}
      transition={{
        duration: 1,
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
      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/95 shadow-xl"
      initial={{ opacity: 0, y: 30, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.5, type: 'spring' }}
    >
      <div
        className={`
        flex items-center justify-center w-10 h-10 rounded-full text-lg
        bg-gradient-to-br ${typeColors[unlock.type] || 'from-gray-500 to-gray-600'}
        text-white shadow-lg
      `}
      >
        {unlock.icon || '🎁'}
      </div>
      <div className="flex flex-col">
        <span className="text-base font-bold text-slate-800">{unlock.name}</span>
        <span className="text-sm text-slate-500">{unlock.description}</span>
      </div>
    </motion.div>
  );
};

const LevelUpPage: React.FC = () => {
  const [data, setData] = useState<LevelUpData | null>(null);
  const [particles] = useState(() => generateParticles());

  // 获取升级数据（从窗口 payload 获取）
  useEffect(() => {
    const fetchPayload = async (): Promise<void> => {
      try {
        const payload = await window.YUA.window['window:payload:get']('levelUp');
        if (payload) {
          setData(payload as LevelUpData);
        }
      } catch (error) {
        console.error('Failed to get level up payload:', error);
      }
    };
    fetchPayload();
  }, []);

  // 自动关闭
  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => {
        window.YUA.window['window:close']('levelUp');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [data]);

  // 获取解锁内容
  const unlocks = data ? getUnlocksAtLevel(data.newLevel) : [];

  return (
    <div className="w-screen h-screen bg-transparent overflow-hidden">
      <AnimatePresence>
        {data && (
          <motion.div className="w-full h-full flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            {/* 粒子效果层 */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {particles.map((particle) => (
                <Particle key={particle.id} particle={particle} />
              ))}
            </div>

            {/* 主内容 */}
            <motion.div
              className="relative flex flex-col items-center"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.6, damping: 15 }}
            >
              {/* 徽章 */}
              <motion.div
                className="
                  flex items-center justify-center w-32 h-32 rounded-full
                  bg-gradient-to-br from-amber-400 via-yellow-400 to-orange-500
                  shadow-2xl mb-6
                "
                style={{
                  boxShadow: '0 0 80px rgba(251, 191, 36, 0.7), 0 0 120px rgba(251, 191, 36, 0.4)'
                }}
                animate={{
                  boxShadow: [
                    '0 0 80px rgba(251, 191, 36, 0.7), 0 0 120px rgba(251, 191, 36, 0.4)',
                    '0 0 100px rgba(251, 191, 36, 0.9), 0 0 150px rgba(251, 191, 36, 0.5)',
                    '0 0 80px rgba(251, 191, 36, 0.7), 0 0 120px rgba(251, 191, 36, 0.4)'
                  ],
                  scale: [1, 1.05, 1]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <TbStarFilled className="w-16 h-16 text-white drop-shadow-lg" />
              </motion.div>

              {/* Level Up! 文字 */}
              <motion.div className="flex items-center gap-3 mb-3" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5, type: 'spring' }}>
                <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 0.5, delay: 0.3 }}>
                  <TbSparkles className="w-8 h-8 text-amber-400" />
                </motion.div>
                <span
                  className="text-4xl font-black bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 bg-clip-text text-transparent"
                  style={{
                    textShadow: '0 0 30px rgba(251, 191, 36, 0.6)',
                    filter: 'drop-shadow(0 0 10px rgba(251, 191, 36, 0.4))'
                  }}
                >
                  Level Up!
                </span>
                <motion.div animate={{ rotate: [0, -15, 15, 0] }} transition={{ duration: 0.5, delay: 0.3 }}>
                  <TbSparkles className="w-8 h-8 text-amber-400" />
                </motion.div>
              </motion.div>

              {/* 等级变化 */}
              <motion.div
                className="flex items-center gap-4 text-3xl font-bold mb-6"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5, type: 'spring' }}
              >
                <span className="text-slate-400/60 line-through text-2xl">Lv.{data.oldLevel}</span>
                <motion.span className="text-4xl text-amber-400" animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.5, delay: 0.5 }}>
                  →
                </motion.span>
                <motion.span className="text-4xl text-amber-400" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6, type: 'spring', damping: 8 }}>
                  Lv.{data.newLevel}
                </motion.span>
              </motion.div>

              {/* 解锁内容 */}
              {unlocks.length > 0 && (
                <motion.div className="flex flex-col gap-3 mt-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5 }}>
                  <motion.span className="text-sm text-amber-300/80 text-center mb-1 font-medium" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
                    🎉 解锁新内容
                  </motion.span>
                  {unlocks.map((unlock, index) => (
                    <UnlockCard key={unlock.id} unlock={unlock} delay={0.9 + index * 0.15} />
                  ))}
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LevelUpPage;
