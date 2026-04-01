import React, { useCallback, useEffect, useMemo, useState } from 'react';

import RadialMenu, { RadialMenuItem } from '../../components/common/RadialMenu/RadialMenu';

interface AssistantMenuPageProps { }

const characterPosition: { x: number; y: number } = { x: 300, y: 300 };

/** 退出动画时长 (ms) */
const EXIT_ANIMATION_DURATION = 250;

const AssistantMenuPage: React.FC<AssistantMenuPageProps> = () => {
  // 控制菜单显示状态，初始为 false，等待窗口显示事件后再展开
  const [isOpen, setIsOpen] = useState(false);
  // 是否正在播放关闭动画
  const [isClosing, setIsClosing] = useState(false);
  // ASR 服务运行状态
  const [isASRRunning, setIsASRRunning] = useState(false);

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
        id: 'asr-service',
        label: isASRRunning ? '停止识别服务' : '启动识别服务',
        icon: isASRRunning ? '⏹️' : '🧠',
        shortcut: 'a',
        action: async () => {
          if (isASRRunning) {
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
          window.YUA.window['window:open']('asr' as any, { audioSource: 'microphone' });
        }
      },
      {
        id: 'system-audio-recording',
        label: '电脑声音识别',
        icon: '🔉',
        shortcut: 'e',
        action: () => {
          window.YUA.window['window:open']('asr' as any, { audioSource: 'system-audio' });
        }
      },
      {
        id: 'web-recorder',
        label: '纯录制',
        icon: '🎙️',
        shortcut: 'p',
        action: () => {
          window.YUA.window['window:open']('webRecorder');
        }
      },
      {
        id: 'tts-config',
        label: 'TTS 测试',
        icon: '🔊',
        shortcut: 'v',
        action: () => {
          window.YUA.window['window:open']('ttsConfig');
        }
      },
      {
        id: 'tagger',
        label: '总结打标',
        icon: '🏷️',
        shortcut: 't',
        action: () => {
          window.YUA.window['window:open']('tagger');
        },
        children: [
          {
            id: 'tagger-sum',
            label: '总结打标',
            icon: '📝',
            shortcut: 's',
            action: () => {
              window.YUA.window['window:open']('tagger');
            }
          },
          {
            id: 'tagger-tag',
            label: '标签打标',
            icon: '🏷️',
            shortcut: 't',
            action: () => {
              // TODO: implement tag tagging
            }
          }
        ]
      },
      {
        id: 'chat',
        label: '聊天',
        icon: '🗨️',
        shortcut: 'c',
        action: () => {
          window.YUA.window['window:open']('chat');
        }
      },
      {
        id: 'resources',
        label: '资源库',
        icon: '📚',
        shortcut: 'r',
        action: () => {
          window.YUA.window['window:open']('resources');
        }
      },
      {
        id: 'skill-tree',
        label: '技能树',
        icon: '🌳',
        shortcut: 'k',
        action: () => {
          window.ipcRenderer.invoke('skillTree:open');
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
        id: 'memory-graph',
        label: '记忆图谱',
        icon: '🧠',
        shortcut: 'g',
        action: () => {
          window.YUA.window['window:open']('memoryGraph');
        }
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
    [isASRRunning]
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
        checkASRStatus();
        setIsOpen(true);
        setIsClosing(false);
      }
      // 注意：隐藏事件在窗口已经隐藏后发送，此时无法播放动画
      // 关闭动画通过 onClose 回调触发
    };

    window.ipcRenderer?.on('window:visibility-changed', handleVisibilityChange);
    return () => {
      window.ipcRenderer?.off('window:visibility-changed', handleVisibilityChange);
    };
  }, [checkASRStatus]);

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
