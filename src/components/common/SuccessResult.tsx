import React, { useEffect, ReactNode } from 'react';
import { motion } from 'framer-motion';

export type ResultVariant = 'success' | 'warning' | 'error' | 'info' | 'loading' | 'neutral';

export interface SuccessResultProps {
  title?: string;
  description?: string;
  /** 动画时长（主内容出现 + 勾号描边），默认 ~300ms */
  animationDurationMs?: number;
  /** 动画结束后停留的时间（不包含上述动画时长） */
  dwellDurationMs?: number;
  /** 动画与停留全部结束后的回调 */
  onDone?: () => void;
  /** 是否自动在动画 + 停留完成后触发 onDone */
  autoClose?: boolean;
  /** 视觉变体: success | warning | error */
  variant?: ResultVariant;
  /** 自定义图标（完全替换内置 SVG 内容） */
  customIcon?: ReactNode;
  /** 自定义图标渲染函数（可获知 variant） */
  renderIcon?: (variant: ResultVariant) => ReactNode;
  /** 图标线条颜色（默认随 variant） */
  iconColor?: string;
  /** 自定义渐变色（from, via, to） 优先级高于 variant 默认 */
  gradient?: [string, string, string];
  /** 外圈光圈是否显示 */
  glow?: boolean;
  /** 主圆缩放出现时长 (s) */
  circleScaleDurationSec?: number;
  /** 图标描边/绘制时长 (s) */
  iconDrawDurationSec?: number;
  /** 初始延迟 (s) */
  enterDelaySec?: number;
  /** 图标开始绘制的附加延迟 (s) */
  iconDelaySec?: number;
  /** 文本出现延迟 (s) */
  textDelaySec?: number;
  /** 额外 className */
  className?: string;
}

/**
 * 一次性播放的成功结果动画组件。
 * 结构：外层圆渐显缩放 + 勾号描边 + 单次外圈闪光。
 */
export const SuccessResult: React.FC<SuccessResultProps> = ({
  title = '操作成功',
  description,
  animationDurationMs = 300,
  dwellDurationMs = 1000,
  onDone,
  autoClose = false,
  variant = 'success',
  customIcon,
  renderIcon,
  iconColor,
  gradient,
  glow = true,
  className = ''
}) => {
  const total = animationDurationMs + dwellDurationMs;

  useEffect(() => {
    if (!autoClose) return;
    const t = setTimeout(() => {
      onDone?.();
    }, total);
    return () => clearTimeout(t);
  }, [autoClose, total, onDone]);

  // Default timings (seconds)
  const circleScaleDuration = ((typeof animationDurationMs === 'number' ? animationDurationMs : 300) / 1000) * 0.73; // proportionally allocate
  const drawDuration = ((typeof animationDurationMs === 'number' ? animationDurationMs : 300) / 1000) * 0.93;

  // Variant style map
  const variantStyles: Record<ResultVariant, { gradient: [string, string, string]; ring: string; color: string; icon: 'check' | 'warn' | 'error' | 'info' | 'loading' | 'neutral' }> = {
    success: { gradient: ['from-emerald-400', 'via-emerald-500', 'to-emerald-600'], ring: 'ring-emerald-400/40', color: '#fff', icon: 'check' },
    warning: { gradient: ['from-amber-300', 'via-amber-400', 'to-amber-500'], ring: 'ring-amber-400/40', color: '#111', icon: 'warn' },
    error: { gradient: ['from-rose-400', 'via-rose-500', 'to-rose-600'], ring: 'ring-rose-400/40', color: '#fff', icon: 'error' },
    info: { gradient: ['from-sky-400', 'via-sky-500', 'to-sky-600'], ring: 'ring-sky-400/40', color: '#fff', icon: 'info' },
    loading: { gradient: ['from-indigo-400', 'via-indigo-500', 'to-indigo-600'], ring: 'ring-indigo-400/40', color: '#fff', icon: 'loading' },
    neutral: { gradient: ['from-zinc-300', 'via-zinc-400', 'to-zinc-500'], ring: 'ring-zinc-400/40', color: '#111', icon: 'neutral' }
  };

  const vs = variantStyles[variant];
  const finalGradient = gradient || vs.gradient;
  const finalIconColor = iconColor || vs.color;

  // Icon path definitions
  const iconPaths: Record<string, any> = {
    check: 'M5 13l4 4L19 7',
    warn: 'triangle',
    error: 'cross',
    info: 'info',
    loading: 'loading',
    neutral: 'neutral'
  };

  function defaultIcon(): React.ReactNode {
    if (vs.icon === 'check') {
      return (
        <motion.path
          d={iconPaths.check as string}
          fill="none"
          stroke={finalIconColor}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
          transition={{ duration: drawDuration, ease: 'easeOut', delay: 0.08 }}
        />
      );
    }
    if (vs.icon === 'warn') {
      return (
        <>
          <motion.path
            d="M12 3L2.8 19h18.4L12 3z"
            fill="none"
            stroke={finalIconColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: drawDuration, ease: 'easeOut', delay: 0.04 }}
          />
          <motion.path
            d="M12 9v4"
            stroke={finalIconColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: drawDuration * 0.6, ease: 'easeOut', delay: 0.12 }}
          />
          <motion.path
            d="M12 16.5h.01"
            stroke={finalIconColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.15, ease: 'easeOut', delay: 0.2 }}
          />
        </>
      );
    }
    // error (cross)
    if (vs.icon === 'error') {
      return (
        <>
          <motion.path
            d="M6 6l12 12"
            fill="none"
            stroke={finalIconColor}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: drawDuration * 0.7, ease: 'easeOut', delay: 0.06 }}
          />
          <motion.path
            d="M6 18L18 6"
            fill="none"
            stroke={finalIconColor}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: drawDuration * 0.7, ease: 'easeOut', delay: 0.14 }}
          />
        </>
      );
    }
    if (vs.icon === 'info') {
      return (
        <>
          <motion.circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            stroke={finalIconColor}
            strokeWidth="2"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: drawDuration * 0.7, ease: 'easeOut', delay: 0.05 }}
          />
          <motion.path
            d="M12 10v6"
            stroke={finalIconColor}
            strokeWidth="2"
            strokeLinecap="round"
            variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
            transition={{ duration: drawDuration * 0.6, ease: 'easeOut', delay: 0.14 }}
          />
          <motion.circle
            cx="12"
            cy="7"
            r="1"
            fill={finalIconColor}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, delay: 0.18, ease: 'easeOut' }}
          />
        </>
      );
    }
    if (vs.icon === 'loading') {
      // Simple spinner arc + fade center dot
      return (
        <>
          <motion.circle
            cx="12"
            cy="12"
            r="9"
            stroke={finalIconColor}
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            style={{ pathLength: 0.75 }}
            initial={{ rotate: 0, pathLength: 0 }}
            animate={{ rotate: 360, pathLength: 0.75 }}
            transition={{ duration: 0.6, ease: 'linear' }}
          />
          <motion.circle cx="12" cy="12" r="2" fill={finalIconColor} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25, delay: 0.15 }} />
        </>
      );
    }
    // neutral -> simple dot + ring
    return (
      <>
        <motion.circle
          cx="12"
          cy="12"
          r="8"
          fill="none"
          stroke={finalIconColor}
          strokeWidth="2"
          variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
          transition={{ duration: drawDuration * 0.7, ease: 'easeOut', delay: 0.06 }}
        />
        <motion.circle
          cx="12"
          cy="12"
          r="3"
          fill={finalIconColor}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.22, delay: 0.16, ease: 'easeOut' }}
        />
      </>
    );
  }

  return (
    <div className={'flex flex-col items-center justify-center ' + className}>
      <motion.div className="relative mb-6" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: circleScaleDuration, ease: 'easeOut' }}>
        {glow && (
          <motion.div
            className={`absolute inset-0 rounded-full ring-4 ${vs.ring}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.25, opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        )}
        <motion.div
          className={`w-24 h-24 rounded-full bg-gradient-to-br ${finalGradient.join(' ')} shadow-xl flex items-center justify-center`}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <motion.svg width="50" height="50" viewBox="0 0 24 24" initial="hidden" animate="visible">
            {customIcon ? customIcon : renderIcon ? renderIcon(variant) : defaultIcon()}
          </motion.svg>
        </motion.div>
      </motion.div>
      <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.16, duration: 0.2 }} className="text-base font-medium mb-1">
        {title}
      </motion.div>
      {description && (
        <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.22, duration: 0.2 }} className="text-[11px] text-muted-foreground tracking-wide">
          {description}
        </motion.div>
      )}
    </div>
  );
};

export default SuccessResult;
