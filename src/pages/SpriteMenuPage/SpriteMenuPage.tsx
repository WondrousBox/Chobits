import type { SpriteBubbleMode } from '@packages/sprite-core/types';
import { Bug, BugOff, MessageSquare, PanelTop } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { ensureChatApiConfigGoal } from '@/lib/chat-api-config-guide';

import RadialMenu, { RadialMenuItem } from '../../components/common/RadialMenu/RadialMenu';

const menuAnchor: { x: number; y: number } = { x: 300, y: 300 };

/** 退出动画时长 (ms) */
const EXIT_ANIMATION_DURATION = 450;

const SpriteMenuPage: React.FC = () => {
  // 控制菜单显示状态，初始为 false，等待窗口显示事件后再展开
  const [isOpen, setIsOpen] = useState(false);
  // 是否正在播放关闭动画
  const [isClosing, setIsClosing] = useState(false);
  // ASR 服务运行状态
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [isDebugOverlayEnabled, setIsDebugOverlayEnabled] = useState(false);
  const [bubbleMode, setBubbleMode] = useState<SpriteBubbleMode>('fixed-top');
  const { isEnabled } = useFeatureFlags();

  // 查询 ASR 服务状态
  const checkASRStatus = useCallback(async () => {
    try {
      const status = await window.chobits.sherpa.getStatus();
      setIsASRRunning(status.running);
    } catch (error) {
      console.error('查询 ASR 状态失败:', error);
      setIsASRRunning(false);
    }
  }, []);

  const checkDebugOverlay = useCallback(async () => {
    try {
      setIsDebugOverlayEnabled(await window.chobits.sprite.getDebugOverlay());
    } catch (error) {
      console.error('查询调试线框状态失败:', error);
      setIsDebugOverlayEnabled(false);
    }
  }, []);

  const checkBubbleMode = useCallback(async () => {
    try {
      setBubbleMode(await window.chobits.sprite.getBubbleMode());
    } catch (error) {
      console.error('查询气泡模式失败:', error);
      setBubbleMode('fixed-top');
    }
  }, []);

  const setSpriteBubbleMode = useCallback(
    async (mode: SpriteBubbleMode) => {
      setBubbleMode(mode);
      try {
        const applied = await window.chobits.sprite.setBubbleMode(mode);
        setBubbleMode(applied);
      } catch {
        void checkBubbleMode();
      }
    },
    [checkBubbleMode]
  );

  const emitSpriteMenuItemSelected = useCallback((itemId: string, windowKey?: string, payload?: Record<string, unknown>) => {
    void window.chobits.sprite.emitPurposeEvent({
      source: 'app-event',
      event: 'SPRITE_MENU_ITEM_SELECTED',
      payload: {
        itemId,
        windowKey,
        source: 'sprite-context-menu',
        ...payload
      }
    });
  }, []);

  const toggleDebugOverlay = useCallback(async () => {
    const next = !isDebugOverlayEnabled;
    setIsDebugOverlayEnabled(next);
    try {
      const applied = await window.chobits.sprite.setDebugOverlay(next);
      setIsDebugOverlayEnabled(applied);
      toast.success(applied ? '调试线框已开启' : '调试线框已关闭');
    } catch (error) {
      setIsDebugOverlayEnabled(isDebugOverlayEnabled);
      toast.error('切换调试线框失败', { description: error instanceof Error ? error.message : String(error) });
    }
  }, [isDebugOverlayEnabled]);

  const menuItems: RadialMenuItem[] = useMemo(
    () => [
      {
        id: 'quit',
        label: '退出',
        icon: '❌',
        shortcut: 'q',
        action: () => window.ipcRenderer?.send('window:command', { type: 'quit-app' })
      },
      {
        id: 'status',
        label: '状态',
        icon: '💬',
        shortcut: 'i',
        action: () => {
          window.chobits.window['window:open']('status');
        }
      },
      {
        id: 'voice-service',
        label: '语音服务',
        icon: '🎙️',
        shortcut: 'a',
        children: [
          {
            id: 'asr-test',
            label: 'ASR 测试',
            icon: '🎧',
            shortcut: 'r',
            action: async () => {
              if (isASRRunning) {
                // 服务已运行：直接打开测试窗口
                const savedConfig = await window.chobits.sherpa.getASRConfig();
                emitSpriteMenuItemSelected('asr-test', 'asrTest');
                window.chobits.window['window:open']('asrTest' as any, {
                  model: savedConfig?.local?.model,
                  language: savedConfig?.local?.language
                });
              } else {
                // 服务未运行：先打开配置页选择模型并启动（启动成功后会自动进入测试窗口）
                emitSpriteMenuItemSelected('asr-test', 'asrConfig', { action: 'start' });
                window.chobits.window['window:open']('asrConfig');
              }
            }
          },
          {
            id: 'tts-config',
            label: 'TTS 测试',
            icon: '🔊',
            shortcut: 'v',
            action: () => {
              emitSpriteMenuItemSelected('tts-config', 'ttsConfig');
              window.chobits.window['window:open']('ttsConfig');
            }
          }
        ].filter((item) => {
          // 本地 ASR 相关菜单项仅在 localAI 开启时可见
          if (item.id === 'asr-test') return isEnabled('localAI');
          return true;
        })
      },
      {
        id: 'chat',
        label: '聊天',
        icon: '🗨️',
        shortcut: 'c',
        action: () => {
          void (async () => {
            const guide = await ensureChatApiConfigGoal({ trigger: 'sprite-menu-chat' });
            if (!guide.configured) {
              return;
            }
            emitSpriteMenuItemSelected('chat', 'chat');
            window.chobits.window['window:open']('chat');
          })();
        }
      },
      // {
      //   id: 'recycle',
      //   label: '回收站',
      //   icon: '🗑️',
      //   shortcut: 'b',
      //   action: () => window.chobits.window['window:open']('recycle')
      // },
      {
        id: 'debug-test',
        label: '调试测试',
        icon: <Bug className="h-6 w-6" />,
        children: [
          {
            id: 'debug-overlay',
            label: isDebugOverlayEnabled ? '关闭线框' : '调试线框',
            icon: isDebugOverlayEnabled ? <BugOff className="h-6 w-6" /> : <Bug className="h-6 w-6" />,
            shortcut: 'd',
            action: toggleDebugOverlay
          },
          {
            id: 'bubble-mode',
            label: bubbleMode === 'inline' ? '顶部气泡' : '内嵌气泡',
            icon: bubbleMode === 'inline' ? <PanelTop className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />,
            shortcut: 'b',
            action: () => void setSpriteBubbleMode(bubbleMode === 'inline' ? 'fixed-top' : 'inline')
          }
        ]
      },
      {
        id: 'settings',
        label: '设置',
        icon: '⚙️',
        shortcut: 's',
        action: () => {
          window.chobits.window['window:open']('settings');
        }
      }
    ],
    [bubbleMode, isDebugOverlayEnabled, emitSpriteMenuItemSelected, isASRRunning, isEnabled, setSpriteBubbleMode, toggleDebugOverlay]
  );

  // 处理菜单关闭请求（播放退出动画后关闭窗口）
  const handleClose = useMemo(
    () => (): void => {
      if (isClosing) return; // 防止重复触发

      setIsClosing(true);
      setIsOpen(false);

      // 等待退出动画完成后再关闭窗口
      setTimeout(() => {
        window.chobits.window['window:close']('menu');
        void window.chobits.sprite.interact('context-menu', { open: false });
        setIsClosing(false);
      }, EXIT_ANIMATION_DURATION);
    },
    [isClosing]
  );

  // 监听窗口可见性变化事件
  useEffect(() => {
    const handleVisibilityChange = (_event: any, data: { visible: boolean; key: string }): void => {
      // 只处理当前窗口 (menu) 的事件
      if (data.key !== 'menu') return;

      if (data.visible) {
        // 窗口显示时，查询 ASR 状态并播放入场动画
        void window.chobits.sprite.interact('context-menu', { open: true });
        checkASRStatus();
        checkDebugOverlay();
        checkBubbleMode();
        setIsOpen(true);
        setIsClosing(false);
      } else {
        void window.chobits.sprite.interact('context-menu', { open: false });
      }
      // 注意：隐藏事件在窗口已经隐藏后发送，此时无法播放动画
      // 关闭动画通过 onClose 回调触发
    };

    window.ipcRenderer?.on('window:visibility-changed', handleVisibilityChange);
    return () => {
      window.ipcRenderer?.off('window:visibility-changed', handleVisibilityChange);
    };
  }, [checkASRStatus, checkBubbleMode, checkDebugOverlay]);

  useEffect(() => {
    return () => {
      void window.chobits.sprite.interact('context-menu', { open: false });
    };
  }, []);

  // 监听窗口失焦事件（替代 closeOnBlur 配置）
  useEffect(() => {
    const handleBlur = (): void => {
      // 只有在菜单打开且不在关闭过程中时才处理
      if (isOpen && !isClosing) {
        handleClose();
      }
    };

    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
    };
  }, [isOpen, isClosing, handleClose]);

  return <RadialMenu items={menuItems} isOpen={isOpen} anchor={menuAnchor} onClose={handleClose} />;
};

export default SpriteMenuPage;
