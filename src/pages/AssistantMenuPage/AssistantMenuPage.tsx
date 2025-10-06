import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface MenuItem {
  id: string
  label: string
  icon: string
  shortcut: string
  action: () => void
}

interface AssistantMenuPageProps {
  characterPosition: { x: number; y: number }
}

const AssistantMenuPage: React.FC<AssistantMenuPageProps> = ({ characterPosition }) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  const menuItems: MenuItem[] = [
    {
      id: 'toggle-walk',
      label: '暂停/继续 行走',
      icon: '🕹️',
      shortcut: 'a',
      action: () => window.ipcRenderer?.send('menu-command', 'toggle-walk')
    },
    {
      id: 'walk-once',
      label: '立即随机走动',
      icon: '👣',
      shortcut: 'w',
      action: () => window.ipcRenderer?.send('menu-command', 'walk-once')
    },
    {
      id: 'file-list',
      label: '文件列表',
      icon: '📁',
      shortcut: 'f',
      action: () => window.YUA.window.openFileListWindow([])
    },
    {
      id: 'resources',
      label: '资源管理',
      icon: '📚',
      shortcut: 'r',
      action: () => window.YUA.window.openWindow("resources")
    },
    {
      id: 'recycle',
      label: '回收站',
      icon: '🗑️',
      shortcut: 'b',
      action: () => window.YUA.window.openWindow("recycle")
    },
    {
      id: 'settings',
      label: '设置',
      icon: '⚙️',
      shortcut: 's',
      action: () => window.YUA.window.openWindow("settings")
    },
    {
      id: 'quit',
      label: '退出',
      icon: '❌',
      shortcut: 'q',
      action: () => window.ipcRenderer?.send('menu-command', 'quit-app')
    }
  ]

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC 键关闭菜单
      if (e.key === 'Escape') {
        window.YUA.window.closeWindow("menu")
        return
      }

      // 数字键 1-9 直接执行对应功能
      const numKey = parseInt(e.key)
      if (numKey >= 1 && numKey <= 9 && numKey <= menuItems.length) {
        e.preventDefault()
        menuItems[numKey - 1].action()
        window.YUA.window.closeWindow("menu")
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
        window.YUA.window.closeWindow("menu")
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex, menuItems])

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
          onClick={() => window.YUA.window.closeWindow("menu")}
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
                    ? 'bg-muted text-muted-foreground shadow-xl ring-2'
                    : 'bg-foreground text-background'
                  }
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
                  scale: 1,
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
                  delay: index * 0.06,
                  duration: 0.5
                }}
                onClick={() => {
                  item.action()
                  window.YUA.window.closeWindow("menu")
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="text-2xl">
                  {item.icon}
                </div>
                <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-white/70 font-mono whitespace-nowrap">
                  {item.label} <span className='uppercase'>({item.shortcut})</span>
                </div>
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

export default AssistantMenuPage
