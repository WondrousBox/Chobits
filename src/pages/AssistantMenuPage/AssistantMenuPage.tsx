import type { SpriteBubbleMode } from '@packages/sprite-core/types';
import { Bug, BugOff, MessageSquare, PanelTop } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { ensureChatApiConfigGoal } from '@/lib/chat-api-config-guide';

import RadialMenu, { RadialMenuItem } from '../../components/common/RadialMenu/RadialMenu';

interface AssistantMenuPageProps {}

const characterPosition: { x: number; y: number } = { x: 300, y: 300 };

/** 退出动画时长 (ms) */
const EXIT_ANIMATION_DURATION = 450;

const AssistantMenuPage: React.FC<AssistantMenuPageProps> = () => {
  // 控制菜单显示状态，初始为 false，等待窗口显示事件后再展开
  const [isOpen, setIsOpen] = useState(false);
  // 是否正在播放关闭动画
  const [isClosing, setIsClosing] = useState(false);
  // ASR 服务运行状态
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [debugOverlay, setDebugOverlay] = useState(false);
  const [bubbleMode, setBubbleMode] = useState<SpriteBubbleMode>('fixed-top');
  const { isEnabled } = useFeatureFlags();

  // 查询 ASR 服务状态
  const checkASRStatus = useCallback(async () => {
    try {
      const status = await window.YUA.sherpa.getStatus();
      setIsASRRunning(status.running);
    } catch (error) {
      console.error('查询 ASR 状态失败:', error);
      setIsASRRunning(false);
    }
  }, []);

  const checkDebugOverlay = useCallback(async () => {
    try {
      setDebugOverlay(await window.YUA.sprite.getDebugOverlay());
    } catch (error) {
      console.error('查询调试线框状态失败:', error);
      setDebugOverlay(false);
    }
  }, []);

  const checkBubbleMode = useCallback(async () => {
    try {
      setBubbleMode(await window.YUA.sprite.getBubbleMode());
    } catch (error) {
      console.error('查询气泡模式失败:', error);
      setBubbleMode('fixed-top');
    }
  }, []);

  const setSpriteBubbleMode = useCallback(
    async (mode: SpriteBubbleMode) => {
      setBubbleMode(mode);
      try {
        const applied = await window.YUA.sprite.setBubbleMode(mode);
        setBubbleMode(applied);
      } catch {
        void checkBubbleMode();
      }
    },
    [checkBubbleMode]
  );

  const emitAssistantMenuItemSelected = useCallback((itemId: string, windowKey?: string, payload?: Record<string, unknown>) => {
    void window.YUA.sprite.emitPurposeEvent({
      source: 'app-event',
      event: 'ASSISTANT_MENU_ITEM_SELECTED',
      payload: {
        itemId,
        windowKey,
        source: 'assistant-context-menu',
        ...payload
      }
    });
  }, []);

  const toggleDebugOverlay = useCallback(async () => {
    const next = !debugOverlay;
    setDebugOverlay(next);
    try {
      const applied = await window.YUA.sprite.setDebugOverlay(next);
      setDebugOverlay(applied);
      toast.success(applied ? '调试线框已开启' : '调试线框已关闭');
    } catch (error) {
      setDebugOverlay(debugOverlay);
      toast.error('切换调试线框失败', { description: error instanceof Error ? error.message : String(error) });
    }
  }, [debugOverlay]);

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
          window.YUA.window['window:open']('status');
        }
      },
      {
        id: 'voice-service',
        label: '语音服务',
        icon: '🎙️',
        shortcut: 'a',
        children: [
          {
            id: 'asr-service',
            label: isASRRunning ? '停止识别服务' : '启动识别服务',
            icon: isASRRunning ? '⏹️' : '🧠',
            shortcut: 's',
            action: async () => {
              if (isASRRunning) {
                emitAssistantMenuItemSelected('asr-service', undefined, { action: 'stop' });
                // 停止 ASR 服务
                try {
                  await window.YUA.sherpa.freeInstance();
                  await window.YUA.sherpa.saveASRConfig({ enabled: false });
                  setIsASRRunning(false);
                } catch (error) {
                  console.error('停止 ASR 服务失败:', error);
                }
              } else {
                // 打开 ASR 配置页面来启动服务
                emitAssistantMenuItemSelected('asr-service', 'asrConfig', { action: 'start' });
                window.YUA.window['window:open']('asrConfig');
              }
            }
          },
          {
            id: 'mic-recording',
            label: '麦克风识别',
            icon: '🎤',
            shortcut: 'm',
            action: () => {
              emitAssistantMenuItemSelected('mic-recording', 'asr', { audioSource: 'microphone' });
              window.YUA.window['window:open']('asr' as any, { audioSource: 'microphone' });
            }
          },
          {
            id: 'system-audio-recording',
            label: '电脑声音识别',
            icon: '🔉',
            shortcut: 'e',
            action: () => {
              emitAssistantMenuItemSelected('system-audio-recording', 'asr', { audioSource: 'system-audio' });
              window.YUA.window['window:open']('asr' as any, { audioSource: 'system-audio' });
            }
          },
          {
            id: 'tts-config',
            label: 'TTS 测试',
            icon: '🔊',
            shortcut: 'v',
            action: () => {
              emitAssistantMenuItemSelected('tts-config', 'ttsConfig');
              window.YUA.window['window:open']('ttsConfig');
            }
          }
        ].filter((item) => {
          // 按功能旗标隐藏录制类菜单项
          if (item.id === 'asr-service') return isEnabled('localAi');
          if (item.id === 'mic-recording' || item.id === 'system-audio-recording') {
            return isEnabled('recording');
          }
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
            const guide = await ensureChatApiConfigGoal({ trigger: 'assistant-menu-chat' });
            if (!guide.configured) {
              return;
            }
            emitAssistantMenuItemSelected('chat', 'chat');
            window.YUA.window['window:open']('chat');
          })();
        }
      },
      // {
      //   id: 'recycle',
      //   label: '回收站',
      //   icon: '🗑️',
      //   shortcut: 'b',
      //   action: () => window.YUA.window['window:open']('recycle')
      // },
      {
        id: 'debug-test',
        label: '调试测试',
        icon: <Bug className="h-6 w-6" />,
        children: [
          {
            id: 'debug-overlay',
            label: debugOverlay ? '关闭线框' : '调试线框',
            icon: debugOverlay ? <BugOff className="h-6 w-6" /> : <Bug className="h-6 w-6" />,
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
          window.YUA.window['window:open']('settings');
        }
      }
    ],
    [bubbleMode, debugOverlay, emitAssistantMenuItemSelected, isASRRunning, isEnabled, setSpriteBubbleMode, toggleDebugOverlay]
  );

  // 处理菜单关闭请求（播放退出动画后关闭窗口）
  const handleClose = useMemo(
    () => (): void => {
      if (isClosing) return; // 防止重复触发

      setIsClosing(true);
      setIsOpen(false);

      // 等待退出动画完成后再关闭窗口
      setTimeout(() => {
        window.YUA.window['window:close']('menu');
        void window.YUA.sprite.interact('context-menu', { open: false });
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
        void window.YUA.sprite.interact('context-menu', { open: true });
        checkASRStatus();
        checkDebugOverlay();
        checkBubbleMode();
        setIsOpen(true);
        setIsClosing(false);
      } else {
        void window.YUA.sprite.interact('context-menu', { open: false });
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
      void window.YUA.sprite.interact('context-menu', { open: false });
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

  return <RadialMenu items={menuItems} open={isOpen} anchor={characterPosition} onClose={handleClose} />;
};

export default AssistantMenuPage;
