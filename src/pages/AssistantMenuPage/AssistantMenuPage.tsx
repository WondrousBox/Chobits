import React, { useMemo } from 'react';
import RadialMenu, { RadialMenuItem } from '../../components/common/RadialMenu/RadialMenu';

interface AssistantMenuPageProps { }

const characterPosition: { x: number; y: number } = { x: 300, y: 300 };

const AssistantMenuPage: React.FC<AssistantMenuPageProps> = () => {
  const menuItems: RadialMenuItem[] = useMemo(
    () => [
      {
        id: 'quit',
        label: '退出',
        icon: '❌',
        shortcut: 'q',
        action: () => window.ipcRenderer?.send('menu-command', 'quit-app')
      },
      {
        id: 'status',
        label: '状态',
        icon: '💬',
        shortcut: 'i',
        action: () => window.YUA.window.openWindow('status'),
        children: [
          { id: 'status', label: '状态', icon: '📖', action: () => window.YUA.window.openWindow('status') },
          { id: 'walk', label: '立即随机走动', icon: '👣', action: () => window.ipcRenderer?.send('menu-command', 'walk-once') }
        ]
      },
      {
        id: 'tagger',
        label: '总结打标',
        icon: '🏷️',
        shortcut: 't',
        action: () => window.YUA.window.openWindow('tagger')
      },
      {
        id: 'chat',
        label: '聊天',
        icon: '🗨️',
        shortcut: 'c',
        action: () => window.YUA.window.openWindow('chat')
      },
      {
        id: 'resources',
        label: '资源库',
        icon: '📚',
        shortcut: 'r',
        action: () => window.YUA.window.openWindow('resources'),
        children: [
          { id: 'library', label: '浏览库', icon: '📖', action: () => window.YUA.window.openWindow('resources') },
          { id: 'import', label: '导入', icon: '⬇️', action: () => window.ipcRenderer?.send('menu-command', 'resource-import') }
        ]
      },
      {
        id: 'recycle',
        label: '回收站',
        icon: '🗑️',
        shortcut: 'b',
        action: () => window.YUA.window.openWindow('recycle')
      },
      {
        id: 'settings',
        label: '设置',
        icon: '⚙️',
        shortcut: 's',
        action: () => window.YUA.window.openWindow('settings')
      }
    ],
    []
  );
  return <RadialMenu items={menuItems} open anchor={characterPosition} onClose={() => window.YUA.window.closeWindow('menu')} />;
};

export default AssistantMenuPage;
