import React from 'react'
import './menu.css'

export const AssistantMenu: React.FC = () => {
  const send = (action: string) => window.ipcRenderer?.send('menu-command', action)
  return (
    <div className='assistant-menu-wrapper'>
      <div className='menu-card glassy'>
        <ul className='menu-list'>
          <li onClick={() => send('toggle-walk')}>🕹️ 暂停/继续 行走</li>
          <li onClick={() => send('walk-once')}>👣 立即随机走动</li>
          <li onClick={() => window.YUA.window.openFileListWindow([])}>📁 文件列表</li>
          <li onClick={() => window.YUA.window.openResourcesWindow()}>📚 资源管理</li>
          <li onClick={() => window.YUA.window.openRecycleWindow()}>🗑️ 回收站</li>
          <li onClick={() => window.YUA.window.openWorkspaceWizardWindow()}>🗂 工作空间向导</li>
          <li onClick={() => send('open-settings')}>⚙️ 设置</li>
          <li className='danger' onClick={() => send('quit-app')}>❌ 退出</li>
        </ul>
      </div>
    </div>
  )
}

export default AssistantMenu
