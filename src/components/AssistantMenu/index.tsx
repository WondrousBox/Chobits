import React from 'react'
import './menu.css'

export const AssistantMenu: React.FC = () => {
  const openSettings = () => {
    window.YUA.window.openSettingsWindow()
  }
  const quit = () => {
    window.ipcRenderer?.send('menu-command', 'quit-app')
  }
  return (
    <div className='assistant-menu-wrapper'>
      <div className='menu-card glassy'>
        <div className='menu-header'>AI 精灵菜单</div>
        <ul className='menu-list'>
          <li onClick={openSettings}>⚙️ 设置</li>
          <li>🕹️ 暂停/继续 行走</li>
          <li>👣 立即随机走动</li>
          <li>📂 打开最近文件</li>
          <li className='danger' onClick={quit}>❌ 退出</li>
        </ul>
      </div>
    </div>
  )
}

export default AssistantMenu
