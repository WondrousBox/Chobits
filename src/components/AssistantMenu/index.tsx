import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface MenuItem {
  id: string
  label: string
  icon: string
  shortcut: string
  action: () => void
}

interface RadialMenuProps {
  onClose: () => void
  characterPosition: { x: number; y: number }
}

export const RadialMenu: React.FC<RadialMenuProps> = ({ onClose, characterPosition }) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const menuItems: MenuItem[] = [
    {
      id: 'toggle-walk',
      label: '暂停/继续 行走',
      icon: '🕹️',
      shortcut: '1',
      action: () => window.ipcRenderer?.send('menu-command', 'toggle-walk')
    },
    {
      id: 'walk-once',
      label: '立即随机走动',
      icon: '👣',
      shortcut: '2',
      action: () => window.ipcRenderer?.send('menu-command', 'walk-once')
    },
    {
      id: 'file-list',
      label: '文件列表',
      icon: '📁',
      shortcut: '3',
      action: () => window.YUA.window.openFileListWindow([])
    },
    {
      id: 'resources',
      label: '资源管理',
      icon: '📚',
      shortcut: '4',
      action: () => window.YUA.window.openWindow("resources")
    },
    {
      id: 'recycle',
      label: '回收站',
      icon: '🗑️',
      shortcut: '5',
      action: () => window.YUA.window.openWindow("recycle")
    },
    {
      id: 'workspace',
      label: '工作空间',
      icon: '🗃️',
      shortcut: '6',
      action: () => window.YUA.window.openWindow("workspace")
    },
    {
      id: 'model-manager',
      label: '模型管理',
      icon: '🧩',
      shortcut: '7',
      action: () => window.YUA.window.openWindow("modelManager")
    },
    {
      id: 'settings',
      label: '设置',
      icon: '⚙️',
      shortcut: '8',
      action: () => window.YUA.window.openWindow("settings")
    },
    {
      id: 'quit',
      label: '退出',
      icon: '❌',
      shortcut: '9',
      action: () => window.ipcRenderer?.send('menu-command', 'quit-app')
    }
  ]

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 键关闭菜单
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // 数字键 1-9 直接执行对应功能
      const numKey = parseInt(e.key)
      if (numKey >= 1 && numKey <= 9 && numKey <= menuItems.length) {
        e.preventDefault()
        menuItems[numKey - 1].action()
        onClose()
        return
      }

      // 方向键导航
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : menuItems.length - 1)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setSelectedIndex(prev => prev < menuItems.length - 1 ? prev + 1 : 0)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        menuItems[selectedIndex].action()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, menuItems, onClose])

  // 计算菜单项位置
  const getItemPosition = (index: number, total: number) => {
    const angle = (index * 2 * Math.PI) / total - Math.PI / 2 // 从顶部开始
    const radius = 140 // 距离角色中心的距离
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    return { x, y }
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        className="fixed inset-0 pointer-events-auto z-[10000] bg-transparent"
        style={{
          left: characterPosition.x - 300,
          top: characterPosition.y - 300,
          width: 600,
          height: 600,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* 背景遮罩 */}
        <motion.div 
          className="absolute inset-0"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
        
        {/* 菜单项容器 */}
        <div className="relative w-full h-full">
          {menuItems.map((item, index) => {
            const position = getItemPosition(index, menuItems.length)
            const isSelected = index === selectedIndex
            
            return (
              <motion.div
                key={item.id}
                className={`
                  absolute w-16 h-16 rounded-full flex items-center justify-center
                  cursor-pointer
                  ${isSelected 
                    ? 'bg-blue-500/90 shadow-xl ring-2 ring-blue-300/50' 
                    : 'bg-[rgba(30,30,40,0.85)] hover:bg-[rgba(30,30,40,0.95)]'
                  }
                  backdrop-blur-md border border-white/30
                `}
                style={{
                  left: `calc(50% + ${position.x}px - 32px)`,
                  top: `calc(50% + ${position.y}px - 32px)`,
                }}
                initial={{ 
                  scale: 0, 
                  opacity: 0,
                  rotate: -180
                }}
                animate={{ 
                  scale: isSelected ? 1.1 : 1, 
                  opacity: 1,
                  rotate: 0
                }}
                exit={{ 
                  scale: 0, 
                  opacity: 0,
                  rotate: 180
                }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                  delay: index * 0.1,
                  duration: 0.5
                }}
                whileHover={{ 
                  scale: 1.05,
                  transition: { duration: 0.2 }
                }}
                whileTap={{ 
                  scale: 0.95,
                  transition: { duration: 0.1 }
                }}
                onClick={() => {
                  item.action()
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <motion.div 
                  className="text-2xl"
                  animate={{ 
                    rotate: isSelected ? [0, -10, 10, -10, 0] : 0 
                  }}
                  transition={{ 
                    duration: 0.5,
                    repeat: isSelected ? Infinity : 0,
                    repeatDelay: 1
                  }}
                >
                  {item.icon}
                </motion.div>
                
                {/* 快捷键提示 */}
                <motion.div 
                  className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-white/70 font-mono"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 + 0.3 }}
                >
                  {item.shortcut}
                </motion.div>
                
                {/* 标签 */}
                <motion.div 
                  className="absolute -right-2 top-1/2 transform -translate-y-1/2 translate-x-full bg-[rgba(30,30,40,0.9)] text-white text-sm px-2 py-1 rounded whitespace-nowrap backdrop-blur-md border border-white/20"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 + 0.4 }}
                >
                  {item.label}
                </motion.div>
              </motion.div>
            )
          })}
          
          {/* 中心提示 */}
          <motion.div 
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white/60 text-xs text-center bg-[rgba(0,0,0,0.3)] px-3 py-2 rounded-lg backdrop-blur-sm border border-white/10"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.3 }}
          >
            <div className="font-medium">按数字键快速选择</div>
            <div className="text-white/50">ESC 关闭菜单</div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// 保持原有的 AssistantMenu 组件作为备用
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
