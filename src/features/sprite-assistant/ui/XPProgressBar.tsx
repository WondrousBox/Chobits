/**
 * XPProgressBar - 精灵经验条组件
 *
 * 显示在精灵底部，展示当前等级和经验进度
 * - 等级徽章 + 进度条 + XP 数字
 * - XP 变化时播放动画和发光脉冲
 * - 拖拽或行走时隐藏
 */
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { TbStarFilled } from 'react-icons/tb';

import { usePersonaState, useSpriteState } from '../context/SpriteStateContext';

const XPProgressBar: React.FC = () => {
  const personaState = usePersonaState();
  const { isDragging, isWalking } = useSpriteState();

  // 追踪 XP 变化用于触发脉冲动画
  const [prevXP, setPrevXP] = useState(personaState?.xp ?? 0);
  const [isPulsing, setIsPulsing] = useState(false);

  // 监听 XP 变化
  useEffect(() => {
    if (personaState && personaState.xp !== prevXP) {
      setPrevXP(personaState.xp);
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 600);
      return () => clearTimeout(timer);
    }
  }, [personaState?.xp, prevXP]);

  // 拖拽或行走时隐藏
  if (isDragging || isWalking) {
    return null;
  }

  // 无状态数据时隐藏
  if (!personaState) {
    return null;
  }

  const { level, xp, xpToNextLevel } = personaState;
  const progress = xpToNextLevel > 0 ? Math.min(1, xp / xpToNextLevel) : 1;

  return (
    <motion.div
      className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 等级徽章 */}
      <motion.div
        className={`
          flex items-center justify-center px-2 py-0.5 rounded-full
          bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold
          shadow-lg
          ${isPulsing ? 'ring-2 ring-amber-300 ring-opacity-75' : ''}
        `}
        animate={
          isPulsing
            ? {
                scale: [1, 1.15, 1],
                boxShadow: ['0 0 0 0 rgba(251, 191, 36, 0.4)', '0 0 0 8px rgba(251, 191, 36, 0)', '0 0 0 0 rgba(251, 191, 36, 0)']
              }
            : {}
        }
        transition={{ duration: 0.5 }}
      >
        <TbStarFilled className="w-3 h-3 mr-0.5" />
        <span>Lv.{level}</span>
      </motion.div>

      {/* 进度条容器 */}
      <div className="flex items-center gap-1.5">
        {/* 进度条 */}
        <div className="relative w-16 h-1.5 bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
          {/* 发光效果 */}
          {isPulsing && (
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.6), rgba(139, 92, 246, 0.6))',
                filter: 'blur(2px)'
              }}
              initial={{ width: 0 }}
              animate={{ width: `${progress * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          )}
        </div>

        {/* XP 数字 */}
        <motion.span
          className={`text-[10px] font-medium tabular-nums ${isPulsing ? 'text-blue-600' : 'text-slate-600'}`}
          animate={isPulsing ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.3 }}
        >
          {xp}/{xpToNextLevel}
        </motion.span>
      </div>
    </motion.div>
  );
};

export default XPProgressBar;
