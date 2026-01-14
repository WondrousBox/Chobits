import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useRef, useState } from 'react';
import { TbCheck, TbKey } from 'react-icons/tb';

interface ShortcutKeyDisplayProps {
  shortcut: {
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    meta?: boolean;
    key: string;
  };
  onVerified: () => void;
  color: string;
  glowColor: string;
  requireLongPress?: boolean; // 是否需要长按
  longPressDuration?: number; // 长按持续时间（毫秒），默认2000ms
  onLongPressComplete?: () => void; // 长按完成回调
}

const ShortcutKeyDisplay: React.FC<ShortcutKeyDisplayProps> = ({ shortcut, onVerified, color, glowColor, requireLongPress = false, longPressDuration = 2000, onLongPressComplete }) => {
  const [isVerified, setIsVerified] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdStartTimeRef = useRef<number | null>(null);
  const isHoldingRef = useRef(false);

  // 格式化按键显示名称
  const formatKeyName = (key: string): string => {
    const keyMap: Record<string, string> = {
      ' ': 'Space',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      Enter: 'Enter',
      Escape: 'Esc',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Del'
    };
    return keyMap[key] || key.toUpperCase();
  };

  // 检查按键是否匹配
  const checkShortcutMatch = (e: KeyboardEvent): boolean => {
    // 在 Mac 上，Command 键会同时触发 ctrlKey 和 metaKey
    // 在 Windows/Linux 上，Ctrl 键只触发 ctrlKey
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const hasCtrl = e.ctrlKey || (isMac && e.metaKey);
    const hasMeta = e.metaKey;

    const ctrlMatch = shortcut.ctrl ? hasCtrl : !hasCtrl;
    const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
    const altMatch = shortcut.alt ? e.altKey : !e.altKey;
    const metaMatch = shortcut.meta ? hasMeta : !hasMeta;

    // 检查主键匹配（支持 key 和 code）
    const keyUpper = e.key.toUpperCase();
    const shortcutKeyUpper = shortcut.key.toUpperCase();
    const keyMatch = keyUpper === shortcutKeyUpper || e.code === `Key${shortcutKeyUpper}` || e.code === shortcutKeyUpper;

    return ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch;
  };

  useEffect(() => {
    if (isVerified) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // 忽略在输入框中的按键
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      setIsListening(true);

      // 更新按下的按键 - 基于当前所有按下的键，而不是单个事件
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      setPressedKeys((prev) => {
        const newPressedKeys = new Set(prev);
        // 更新修饰键状态（基于事件对象的当前状态，这样可以捕获所有同时按下的修饰键）
        if (e.ctrlKey || (isMac && e.metaKey)) {
          newPressedKeys.add('ctrl');
        } else {
          newPressedKeys.delete('ctrl');
        }
        if (e.shiftKey) {
          newPressedKeys.add('shift');
        } else {
          newPressedKeys.delete('shift');
        }
        if (e.altKey) {
          newPressedKeys.add('alt');
        } else {
          newPressedKeys.delete('alt');
        }
        if (e.metaKey) {
          newPressedKeys.add('meta');
        } else {
          newPressedKeys.delete('meta');
        }
        // 添加主键（只添加字母和数字等可打印字符）
        const keyUpper = e.key.toUpperCase();
        if (keyUpper && keyUpper.length === 1 && /[A-Z0-9]/.test(keyUpper)) {
          newPressedKeys.add(keyUpper);
        }
        return newPressedKeys;
      });

      // 检查是否匹配快捷键
      if (checkShortcutMatch(e)) {
        e.preventDefault();

        if (requireLongPress) {
          // 如果已经在长按中，不重复创建定时器
          if (isHoldingRef.current && holdTimerRef.current) {
            return;
          }

          // 需要长按：开始计时
          isHoldingRef.current = true;
          setIsHolding(true);
          const startTime = Date.now();
          holdStartTimeRef.current = startTime;
          setHoldProgress(0);

          // 清除之前的定时器（防止重复）
          if (holdTimerRef.current) {
            clearInterval(holdTimerRef.current);
          }

          // 创建进度更新定时器
          const progressTimer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / longPressDuration) * 100, 100);
            setHoldProgress(progress);

            if (progress >= 100) {
              // 长按完成
              clearInterval(progressTimer);
              holdTimerRef.current = null;
              isHoldingRef.current = false;
              setIsHolding(false);
              setHoldProgress(100);
              setIsVerified(true);
              setIsListening(false);
              onVerified();
              if (onLongPressComplete) {
                onLongPressComplete();
              }
            }
          }, 16); // 约60fps更新

          holdTimerRef.current = progressTimer;
        } else {
          // 不需要长按：立即验证
          setIsVerified(true);
          setIsListening(false);
          onVerified();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      // 只清除当前松开的键，而不是清除所有
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      setPressedKeys((prev) => {
        const newPressedKeys = new Set(prev);
        // 检查修饰键是否仍然按下（基于事件对象的当前状态）
        if (!e.ctrlKey && !(isMac && e.metaKey)) {
          newPressedKeys.delete('ctrl');
        }
        if (!e.shiftKey) {
          newPressedKeys.delete('shift');
        }
        if (!e.altKey) {
          newPressedKeys.delete('alt');
        }
        if (!e.metaKey) {
          newPressedKeys.delete('meta');
        }
        // 清除主键
        const keyUpper = e.key.toUpperCase();
        if (keyUpper && keyUpper.length === 1) {
          newPressedKeys.delete(keyUpper);
        }

        // 检查快捷键是否仍然完整（用于长按检测）
        const hasCtrl = newPressedKeys.has('ctrl') || newPressedKeys.has('meta');
        const hasShift = newPressedKeys.has('shift');
        const hasAlt = newPressedKeys.has('alt');
        const hasMainKey = newPressedKeys.has(shortcut.key.toUpperCase());

        const stillMatches = (shortcut.ctrl ? hasCtrl : !hasCtrl) && (shortcut.shift ? hasShift : !hasShift) && (shortcut.alt ? hasAlt : !hasAlt) && hasMainKey;

        // 如果快捷键不再匹配，重置长按状态
        if (requireLongPress && isHoldingRef.current && !stillMatches) {
          isHoldingRef.current = false;
          setIsHolding(false);
          setHoldProgress(0);
          holdStartTimeRef.current = null;
          if (holdTimerRef.current) {
            clearInterval(holdTimerRef.current);
            holdTimerRef.current = null;
          }
        }

        // 如果所有键都松开了，清除监听状态
        if (newPressedKeys.size === 0) {
          setIsListening(false);
          if (requireLongPress && isHoldingRef.current) {
            isHoldingRef.current = false;
            setIsHolding(false);
            setHoldProgress(0);
            holdStartTimeRef.current = null;
            if (holdTimerRef.current) {
              clearInterval(holdTimerRef.current);
              holdTimerRef.current = null;
            }
          }
        }
        return newPressedKeys;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, [shortcut, isVerified, onVerified, requireLongPress, longPressDuration, onLongPressComplete]);

  // 渲染单个按键
  const renderKey = (label: string, isPressed: boolean = false, isMainKey: boolean = false) => {
    const isActive = isPressed || (isVerified && !isMainKey);
    return (
      <motion.div
        key={label}
        className="relative flex items-center justify-center min-w-[36px] h-8 px-2 rounded-md text-xs font-semibold select-none"
        style={{
          backgroundColor: isActive ? color : 'rgba(71, 85, 105, 0.3)',
          color: isActive ? '#ffffff' : '#94a3b8',
          border: `1px solid ${isActive ? color : 'rgba(71, 85, 105, 0.5)'}`,
          boxShadow: isActive ? `0 0 12px ${glowColor}` : 'none',
          transform: isPressed ? 'scale(0.95)' : 'scale(1)'
        }}
        animate={isPressed ? { scale: 0.95 } : { scale: 1 }}
        transition={{ duration: 0.1 }}
      >
        {label}
        {isPressed && (
          <motion.div
            className="absolute inset-0 rounded-md"
            style={{
              background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
              opacity: 0.6
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.6, 0.3, 0.6] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        )}
      </motion.div>
    );
  };

  const keys: Array<{ label: string; isPressed: boolean }> = [];

  if (shortcut.ctrl || shortcut.meta) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    keys.push({
      label: isMac ? '⌘' : 'Ctrl',
      isPressed: pressedKeys.has('ctrl') || pressedKeys.has('meta')
    });
  }
  if (shortcut.shift) {
    keys.push({
      label: 'Shift',
      isPressed: pressedKeys.has('shift')
    });
  }
  if (shortcut.alt) {
    keys.push({
      label: 'Alt',
      isPressed: pressedKeys.has('alt')
    });
  }
  keys.push({
    label: formatKeyName(shortcut.key),
    isPressed: pressedKeys.has(shortcut.key.toUpperCase())
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TbKey className="w-4 h-4" style={{ color: color }} />
        <span className="text-sm font-medium text-slate-300">激活快捷键</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {keys.map((key, index) => (
          <React.Fragment key={index}>
            {renderKey(key.label, key.isPressed, index === keys.length - 1)}
            {index < keys.length - 1 && <span className="text-slate-500 text-sm font-bold">+</span>}
          </React.Fragment>
        ))}
      </div>

      {/* 长按进度条 */}
      <AnimatePresence>
        {requireLongPress && isHolding && !isVerified && (
          <motion.div className="space-y-2" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <div className="text-xs text-slate-400 font-medium">长按快捷键以激活技能...</div>
            <div className="relative h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${color}, ${glowColor})`,
                  boxShadow: `0 0 10px ${glowColor}`
                }}
                initial={{ width: 0 }}
                animate={{ width: `${holdProgress}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)`,
                  backgroundSize: '200% 100%'
                }}
                animate={{
                  backgroundPosition: ['200% 0', '-200% 0']
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'linear'
                }}
              />
            </div>
            <div className="text-xs text-slate-500 text-center">{Math.round(holdProgress)}%</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isVerified && (
          <motion.div
            className="flex items-center gap-2 text-sm"
            initial={{ opacity: 0, y: -5, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5 }}
            style={{ color: color }}
          >
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} transition={{ duration: 0.5, ease: 'easeOut' }}>
              <TbCheck className="w-4 h-4" />
            </motion.div>
            <span className="font-medium">{requireLongPress ? '技能激活成功！' : '快捷键验证通过，可以开启技能'}</span>
          </motion.div>
        )}
        {!isVerified && isListening && !isHolding && (
          <motion.div className="text-xs text-slate-400" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {requireLongPress ? '请长按上述快捷键 2 秒以激活技能...' : '请按下上述快捷键...'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShortcutKeyDisplay;
