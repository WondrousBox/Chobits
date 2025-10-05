import React from 'react'

export const AssistantMenu: React.FC = () => {
  const send = (action: string) => window.ipcRenderer?.send('menu-command', action)
  return (
    <div className='w-full h-full flex items-center justify-center font-sans'>
      <div className='w-[200px] max-h-[80vh] p-2 rounded-lg bg-[rgba(30,30,40,0.55)] backdrop-blur-[18px] backdrop-saturate-[180%] shadow-[0_4px_18px_-4px_rgba(0,0,0,0.5),0_2px_4px_-1px_rgba(0,0,0,0.4)] text-white border border-white/12'>
        <ul className='list-none m-0 p-0 flex flex-col gap-1 text-sm max-h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent'>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => send('toggle-walk')}
          >
            🕹️ 暂停/继续 行走
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => send('walk-once')}
          >
            👣 立即随机走动
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => window.YUA.window.openFileListWindow([])}
          >
            📁 文件列表
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => window.YUA.window.openWindow("resources")}
          >
            📚 资源管理
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => window.YUA.window.openWindow("recycle")}
          >
            🗑️ 回收站
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => window.YUA.window.openWindow("workspace")}
          >
            🗃️ 工作空间
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => window.YUA.window.openWindow("modelManager")}
          >
            🧩 模型管理
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => window.YUA.window.openWindow("settings")}
          >
            ⚙️ 设置
          </li>
          <li 
            className='px-2.5 py-1.5 rounded-[10px] cursor-pointer select-none flex items-center gap-1.5 transition-all duration-150 hover:bg-white/12'
            onClick={() => send('quit-app')}
          >
            ❌ 退出
          </li>
        </ul>
      </div>
    </div>
  )
}

export default AssistantMenu
