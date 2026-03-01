import clsx from 'clsx';
import React, { useCallback } from 'react';
import { TbArrowBarToRight, TbArrowBarToLeft, TbBlur, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

import type { MediaTransition, TransitionType } from '../types';
import { MEDIA_CONFIG } from '../types';

interface MediaTransitionSelectorProps {
  /** Whether the panel is open */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Current transition configuration */
  transition?: MediaTransition;
  /** Position: 'in' for entrance, 'out' for exit */
  position: 'in' | 'out';
  /** Transition change callback */
  onTransitionChange: (transition: MediaTransition | undefined) => void;
  /** Custom class name */
  className?: string;
}

/**
 * Transition type options
 */
const TRANSITION_OPTIONS: { type: TransitionType; label: string; icon: React.ElementType; description: string }[] = [
  { type: 'none', label: '无', icon: TbX, description: '无转场效果' },
  { type: 'fade', label: '淡入淡出', icon: TbBlur, description: '渐变透明度过渡' },
  { type: 'dissolve', label: '溶解', icon: TbBlur, description: '像素级溶解效果' },
  { type: 'wipe-left', label: '左擦除', icon: TbArrowBarToRight, description: '从左向右擦除' },
  { type: 'wipe-right', label: '右擦除', icon: TbArrowBarToLeft, description: '从右向左擦除' }
];

/**
 * MediaTransitionSelector - 转场效果选择器
 *
 * 用于选择和配置媒体片段的转场效果：
 * - 转场类型选择
 * - 转场时长调整
 */
export const MediaTransitionSelector: React.FC<MediaTransitionSelectorProps> = ({
  open,
  onClose,
  transition,
  position,
  onTransitionChange,
  className
}) => {
  const currentType = transition?.type ?? 'none';
  const currentDuration = transition?.duration ?? MEDIA_CONFIG.DEFAULT_TRANSITION_DURATION;

  // Handle type change
  const handleTypeChange = useCallback(
    (type: TransitionType) => {
      if (type === 'none') {
        onTransitionChange(undefined);
      } else {
        onTransitionChange({
          type,
          duration: currentDuration
        });
      }
    },
    [onTransitionChange, currentDuration]
  );

  // Handle duration change
  const handleDurationChange = useCallback(
    (values: number[]) => {
      if (currentType === 'none') return;
      onTransitionChange({
        type: currentType,
        duration: values[0]
      });
    },
    [onTransitionChange, currentType]
  );

  // Remove transition
  const handleRemove = useCallback(() => {
    onTransitionChange(undefined);
  }, [onTransitionChange]);

  if (!open) return null;

  return (
    <div className={clsx('absolute left-0 top-full mt-1 w-56 bg-background border rounded-lg shadow-lg z-50', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h4 className="text-xs font-medium">{position === 'in' ? '入场' : '出场'}转场</h4>
        <Button variant="ghost" size="sm" className="w-5 h-5 p-0" onClick={onClose}>
          <TbX className="w-3 h-3" />
        </Button>
      </div>

      {/* Transition types */}
      <div className="p-2 space-y-1">
        {TRANSITION_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = currentType === option.type;

          return (
            <button
              key={option.type}
              type="button"
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
              )}
              onClick={() => handleTypeChange(option.type)}
              title={option.description}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{option.label}</span>
              {isSelected && <span className="text-[10px] opacity-70">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Duration slider */}
      {currentType !== 'none' && (
        <div className="px-3 pb-3 pt-1 border-t">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-foreground">时长</label>
            <span className="text-xs text-muted-foreground font-mono">{currentDuration.toFixed(1)}s</span>
          </div>
          <Slider
            value={[currentDuration]}
            onValueChange={handleDurationChange}
            min={0.1}
            max={2.0}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0.1s</span>
            <span>2.0s</span>
          </div>
        </div>
      )}

      {/* Footer */}
      {transition && (
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full h-6 text-xs" onClick={handleRemove}>
            移除转场
          </Button>
        </div>
      )}
    </div>
  );
};

/**
 * TransitionTypeButton - 转场类型快捷按钮
 *
 * 用于在片段块上显示的转场快捷操作按钮
 */
interface TransitionTypeButtonProps {
  /** Current transition */
  transition?: MediaTransition;
  /** Position */
  position: 'in' | 'out';
  /** Click callback */
  onClick?: () => void;
  /** Whether selector is open */
  isSelectorOpen?: boolean;
}

export const TransitionTypeButton: React.FC<TransitionTypeButtonProps> = ({
  transition,
  position,
  onClick,
  isSelectorOpen = false
}) => {
  const hasTransition = transition && transition.type !== 'none';

  return (
    <button
      type="button"
      className={clsx(
        'w-5 h-5 rounded flex items-center justify-center transition-colors',
        hasTransition ? 'bg-white/80 text-foreground hover:bg-white' : 'bg-black/30 text-white/70 hover:bg-black/50',
        isSelectorOpen && 'ring-1 ring-primary'
      )}
      onClick={onClick}
      title={hasTransition ? `${position === 'in' ? '入场' : '出场'}: ${transition.type} (${transition.duration}s)` : `添加${position === 'in' ? '入场' : '出场'}转场`}
    >
      {hasTransition ? (
        <span className="text-[10px] font-mono">{transition.duration.toFixed(1)}</span>
      ) : (
        <span className="text-[10px]">+</span>
      )}
    </button>
  );
};
