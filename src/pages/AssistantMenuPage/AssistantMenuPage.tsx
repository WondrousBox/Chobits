import React, { useEffect, useMemo, useState } from 'react';

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
        id: 'web-recorder',
        label: '录音',
        icon: '🎙️',
        shortcut: 'm',
        action: () => {
          window.YUA.window['window:open']('webRecorder');
        }
      },
      {
        id: 'asr-config',
        label: 'ASR 测试',
        icon: '🎤',
        shortcut: 'a',
        action: () => {
          window.YUA.window['window:open']('asrConfig');
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
        id: 'settings',
        label: '设置',
        icon: '⚙️',
        shortcut: 's',
        action: () => {
          window.YUA.window['window:open']('settings');
        }
      }
    ],
    []
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
        // 窗口显示时，播放入场动画
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
