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
        action: () => window.ipcRenderer?.send('window:command', { type: 'quit-app' })
      },
      {
        id: 'status',
        label: '状态',
        icon: '💬',
        shortcut: 'i',
        action: () => window.YUA.window['window:open']('status'),
        children: [
          { id: 'status', label: '状态', icon: '📖', action: () => window.YUA.window['window:open']('status') },
          { id: 'walk', label: '立即随机走动', icon: '👣', action: () => window.ipcRenderer?.send('window:command', { type: 'walk-once' }) }
        ]
      },
      {
        id: 'tagger',
        label: '总结打标',
        icon: '🏷️',
        shortcut: 't',
        action: () => window.YUA.window['window:open']('tagger')
      },
      {
        id: 'workflow',
        label: '工作流',
        icon: '🛠️',
        shortcut: 'w',
        action: () => window.YUA.window['window:open']('workflowPage'),
        children: [
          { id: 'workflow-list', label: '管理工作流', icon: '🧩', action: () => window.YUA.window['window:open']('workflowPage') },
          { id: 'workflow-builder', label: '打开设计器', icon: '🛠️', action: () => window.YUA.window['window:open']('workflowBuilder', undefined, { sameDisplayAsSender: true }) }
        ]
      },
      {
        id: 'chat',
        label: '聊天',
        icon: '🗨️',
        shortcut: 'c',
        action: () => window.YUA.window['window:open']('chat')
      },
      {
        id: 'resources',
        label: '资源库',
        icon: '📚',
        shortcut: 'r',
        action: () => window.YUA.window['window:open']('resources')
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
        action: () => window.YUA.window['window:open']('settings')
      }
    ],
    []
  );
  return <RadialMenu items={menuItems} open anchor={characterPosition} onClose={() => window.YUA.window['window:close']('menu')} />;
};

export default AssistantMenuPage;
