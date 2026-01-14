import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
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
}

const ShortcutKeyDisplay: React.FC<ShortcutKeyDisplayProps> = ({ shortcut, onVerified, color, glowColor }) => {
  const [isVerified, setIsVerified] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

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
        setIsVerified(true);
        setIsListening(false);
        onVerified();
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
        // 如果所有键都松开了，清除监听状态
        if (newPressedKeys.size === 0) {
          setIsListening(false);
        }
        return newPressedKeys;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [shortcut, isVerified, onVerified]);

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

      <AnimatePresence>
        {isVerified && (
          <motion.div className="flex items-center gap-2 text-sm" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} style={{ color: color }}>
            <TbCheck className="w-4 h-4" />
            <span className="font-medium">快捷键验证通过，可以开启技能</span>
          </motion.div>
        )}
        {!isVerified && isListening && (
          <motion.div className="text-xs text-slate-400" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            请按下上述快捷键...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ShortcutKeyDisplay;
