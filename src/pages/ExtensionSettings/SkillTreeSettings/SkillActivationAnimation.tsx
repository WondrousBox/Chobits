import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';

interface SkillActivationAnimationProps {
  show: boolean;
  skillName: string;
  skillDescription?: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  glowColor: string;
  gradientFrom: string;
  gradientTo: string;
  onComplete?: () => void;
}

const SkillActivationAnimation: React.FC<SkillActivationAnimationProps> = ({
  show,
  skillName,
  skillDescription,
  Icon,
  color,
  glowColor,
  gradientFrom,
  gradientTo,
  onComplete
}) => {
  React.useEffect(() => {
    if (show && onComplete) {
      const timer = setTimeout(() => {
        onComplete();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 背景光晕 */}
          <motion.div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle, ${glowColor}40 0%, transparent 70%)`
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 1.2, 1.5], opacity: [0, 0.6, 0] }}
            transition={{ duration: 2, ease: 'easeOut' }}
          />

          {/* 中心图标动画 */}
          <motion.div
            className="relative flex items-center justify-center w-32 h-32"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: [0, 1.2, 1], rotate: [180, 0, 0] }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
                boxShadow: `0 0 60px ${glowColor}, 0 0 100px ${glowColor}`
              }}
            />
            <motion.div
              className="relative z-10"
              style={{
                width: 64,
                height: 64,
                color: '#ffffff',
                filter: `drop-shadow(0 0 20px rgba(255,255,255,0.8))`
              }}
              animate={{ scale: [1, 1.1, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.5, repeat: 2 }}
            >
              <Icon className="w-full h-full" />
            </motion.div>
          </motion.div>

          {/* 成功文字 */}
          <motion.div
            className="absolute bottom-32 left-0 right-0 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -20] }}
            transition={{ duration: 2, times: [0, 0.2, 0.8, 1] }}
          >
            <div
              className="text-2xl font-bold"
              style={{
                color: color,
                textShadow: `0 0 20px ${glowColor}, 0 0 40px ${glowColor}`
              }}
            >
              技能激活成功！
            </div>
            <div className="text-sm text-slate-300 mt-2">{skillName}</div>
            {skillDescription && <div className="text-xs text-slate-400 mt-1">{skillDescription}</div>}
          </motion.div>

          {/* 粒子效果 */}
          {[...Array(12)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: `0 0 10px ${glowColor}`
              }}
              initial={{
                x: '50%',
                y: '50%',
                scale: 0,
                opacity: 1
              }}
              animate={{
                x: `calc(50% + ${Math.cos((i * 360) / 12) * 100}px)`,
                y: `calc(50% + ${Math.sin((i * 360) / 12) * 100}px)`,
                scale: [0, 1, 0],
                opacity: [1, 1, 0]
              }}
              transition={{
                duration: 1.5,
                delay: 0.2,
                ease: 'easeOut'
              }}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SkillActivationAnimation;
