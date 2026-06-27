import clsx from 'clsx';
import React from 'react';
import { TbArrowBarRight, TbArrowBarToLeft, TbArrowBarToRight, TbBlur } from 'react-icons/tb';

import { useLabels } from '../../context';
import type { MediaTransition, TransitionType } from '../../types';

interface TransitionIndicatorProps {
  /** 转场配置 */
  transition?: MediaTransition;
  /** 位置：入场或出场 */
  position: 'in' | 'out';
  /** 高度 */
  height: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * 转场类型图标映射
 */
const TransitionIcons: Record<TransitionType, React.ElementType> = {
  none: TbArrowBarRight,
  fade: TbBlur,
  dissolve: TbBlur,
  'wipe-left': TbArrowBarToRight,
  'wipe-right': TbArrowBarToLeft
};

function getTransitionName(labels: ReturnType<typeof useLabels>, type: TransitionType): string {
  const names: Record<TransitionType, string> = {
    none: labels.transitionTypeNone,
    fade: labels.transitionTypeFade,
    dissolve: labels.transitionTypeDissolve,
    'wipe-left': labels.transitionTypeWipeLeft,
    'wipe-right': labels.transitionTypeWipeRight
  };
  return names[type];
}

/**
 * TransitionIndicator - 转场效果指示器
 *
 * 在片段边缘显示转场效果的视觉指示
 */
export const TransitionIndicator: React.FC<TransitionIndicatorProps> = ({ transition, position, height, className }) => {
  const labels = useLabels();
  if (!transition || transition.type === 'none') {
    return null;
  }

  const Icon = TransitionIcons[transition.type] || TbArrowBarRight;
  const transitionName = getTransitionName(labels, transition.type);
  const width = Math.min(24, transition.duration * 50); // 基于转场时长计算宽度

  return (
    <div
      className={clsx(
        'absolute top-0 bottom-0 flex items-center justify-center z-10',
        position === 'in' ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l',
        'from-transparent to-black/20',
        className
      )}
      style={{ width, height }}
      title={`${position === 'in' ? labels.transitionIn : labels.transitionOut} ${labels.transitionLabel}: ${transitionName} (${transition.duration}s)`}
    >
      <Icon className={clsx('w-3 h-3 text-white/70', position === 'in' ? 'ml-0.5' : 'mr-0.5')} />
    </div>
  );
};

/**
 * TransitionBadge - 转场效果标记（用于工具栏选择器）
 */
interface TransitionBadgeProps {
  type: TransitionType;
  selected?: boolean;
  onClick?: () => void;
}

export const TransitionBadge: React.FC<TransitionBadgeProps> = ({ type, selected, onClick }) => {
  const labels = useLabels();
  const Icon = TransitionIcons[type];
  const transitionName = getTransitionName(labels, type);

  return (
    <button
      type="button"
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
        selected ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-foreground'
      )}
      onClick={onClick}
      title={transitionName}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{transitionName}</span>
    </button>
  );
};
