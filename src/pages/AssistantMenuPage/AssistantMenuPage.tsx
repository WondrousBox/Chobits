import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

interface SubMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  action: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  shortcut: string;
  action: () => void;
  children?: SubMenuItem[];
}

interface AssistantMenuPageProps { }

const characterPosition: { x: number; y: number } = { x: 300, y: 300 };

const AssistantMenuPage: React.FC<AssistantMenuPageProps> = () => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);
  const [activeParentIndex, setActiveParentIndex] = useState<number | null>(null);
  const [subSelectedIndex, setSubSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        id: 'status',
        label: '状态',
        icon: '💬',
        shortcut: 'i',
        action: () => window.YUA.window.openWindow('status')
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
          { id: 'import', label: '导入', icon: '⬇️', action: () => window.ipcRenderer?.send('menu-command', 'resource-import') },
          { id: 'search', label: '搜索', icon: '🔎', action: () => window.ipcRenderer?.send('menu-command', 'resource-search') }
        ]
      },
      {
        id: 'walk-once',
        label: '立即随机走动',
        icon: '👣',
        shortcut: 'w',
        action: () => window.ipcRenderer?.send('menu-command', 'walk-once')
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
        action: () => window.YUA.window.openWindow('settings'),
        children: [
          { id: 'general', label: '通用', icon: '🧩', action: () => window.YUA.window.openWindow('settings') },
          { id: 'models', label: '模型', icon: '🧠', action: () => window.YUA.window.openWindow('models') },
          { id: 'workspace', label: '工作区', icon: '🗂️', action: () => window.YUA.window.openWindow('workspace') }
        ]
      },
      {
        id: 'quit',
        label: '退出',
        icon: '❌',
        shortcut: 'q',
        action: () => window.ipcRenderer?.send('menu-command', 'quit-app')
      }
    ],
    []
  );

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // ESC 键关闭菜单
      if (e.key === 'Escape') {
        if (isSubMenuOpen) {
          setIsSubMenuOpen(false);
          setActiveParentIndex(null);
          return;
        }
        window.YUA.window.closeWindow('menu');
        return;
      }

      // 数字键 1-9 直接执行对应功能
      const numKey = parseInt(e.key);
      if (!Number.isNaN(numKey)) {
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = menuItems[activeParentIndex].children ?? [];
          if (numKey >= 1 && numKey <= 9 && numKey <= children.length) {
            e.preventDefault();
            children[numKey - 1].action();
            window.YUA.window.closeWindow('menu');
            return;
          }
        } else {
          if (numKey >= 1 && numKey <= 9 && numKey <= menuItems.length) {
            e.preventDefault();
            const item = menuItems[numKey - 1];
            if (item.children && item.children.length > 0) {
              setActiveParentIndex(numKey - 1);
              setIsSubMenuOpen(true);
              setSubSelectedIndex(0);
            } else {
              item.action();
              window.YUA.window.closeWindow('menu');
            }
            return;
          }
        }
      }

      // 方向键导航
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = menuItems[activeParentIndex].children ?? [];
          setSubSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(children.length - 1, 0)));
        } else {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuItems.length - 1));
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = menuItems[activeParentIndex].children ?? [];
          setSubSelectedIndex((prev) => (prev < children.length - 1 ? prev + 1 : 0));
        } else {
          setSelectedIndex((prev) => (prev < menuItems.length - 1 ? prev + 1 : 0));
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isSubMenuOpen && activeParentIndex !== null) {
          const children = menuItems[activeParentIndex].children ?? [];
          if (children.length > 0) {
            children[subSelectedIndex]?.action();
            window.YUA.window.closeWindow('menu');
          }
        } else {
          const item = menuItems[selectedIndex];
          if (item.children && item.children.length > 0) {
            setActiveParentIndex(selectedIndex);
            setIsSubMenuOpen(true);
            setSubSelectedIndex(0);
          } else {
            item.action();
            window.YUA.window.closeWindow('menu');
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, subSelectedIndex, isSubMenuOpen, activeParentIndex, menuItems]);

  // 计算菜单项位置
  const getItemPosition = (index: number, total: number, radius = 140): { x: number; y: number } => {
    const angle = (index * 2 * Math.PI) / total - Math.PI / 2; // 从顶部开始
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  const selectedPosition = getItemPosition(selectedIndex, menuItems.length);
  const activeChildren = activeParentIndex !== null ? (menuItems[activeParentIndex].children ?? []) : [];
  const subSelectedPosition = isSubMenuOpen && activeChildren.length > 0 ? getItemPosition(subSelectedIndex, activeChildren.length, 130) : { x: 0, y: 0 };

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        className="fixed inset-0 pointer-events-auto z-[10000] bg-transparent"
        style={{
          left: characterPosition.x - 300,
          top: characterPosition.y - 300,
          width: 600,
          height: 600
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={() => {
          if (isSubMenuOpen) {
            setIsSubMenuOpen(false);
            setActiveParentIndex(null);
          } else {
            window.YUA.window.closeWindow('menu');
          }
        }}
      >
        {/* 背景遮罩 */}
        <motion.div
          className="absolute inset-0"
          onClick={() => {
            if (isSubMenuOpen) {
              setIsSubMenuOpen(false);
              setActiveParentIndex(null);
            } else {
              window.YUA.window.closeWindow('menu');
            }
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />

        {/* 菜单项容器 */}
        <LayoutGroup>
          <div className="relative w-full h-full">
            {/* 中心到高亮项的连线（一级或二级） */}
            {!isSubMenuOpen && (
              <svg className="absolute inset-0 text-primary" width={600} height={600} viewBox="0 0 600 600" aria-hidden>
                <line x1={300} y1={300} x2={300 + selectedPosition.x} y2={300 + selectedPosition.y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx={300} cy={300} r={6} fill="currentColor" />
                <circle cx={300 + selectedPosition.x} cy={300 + selectedPosition.y} r={3} fill="currentColor" />
              </svg>
            )}

            {isSubMenuOpen && (
              <svg className="absolute inset-0 text-primary" width={600} height={600} viewBox="0 0 600 600" aria-hidden>
                <line x1={300} y1={300} x2={300 + subSelectedPosition.x} y2={300 + subSelectedPosition.y} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx={300} cy={300} r={6} fill="currentColor" />
                <circle cx={300 + subSelectedPosition.x} cy={300 + subSelectedPosition.y} r={3} fill="currentColor" />
              </svg>
            )}

            {/* 一级菜单 */}
            {!isSubMenuOpen && (
              <>
                {menuItems.map((item, index) => {
                  const position = getItemPosition(index, menuItems.length);
                  const isSelected = index === selectedIndex;

                  return (
                    <motion.div
                      key={item.id}
                      layout
                      layoutId={`menu-item-${item.id}`}
                      className={`
                        absolute w-16 h-16 rounded-full flex items-center justify-center
                        cursor-pointer select-none
                        ${isSelected ? 'bg-muted text-muted-foreground shadow-xl ring-2' : 'bg-foreground text-background'}
                      `}
                      style={{
                        left: `calc(50% + ${position.x}px - 32px)`,
                        top: `calc(50% + ${position.y}px - 32px)`
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', delay: index * 0.06, duration: 0.5, layout: { duration: 0.35 } }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.children && item.children.length > 0) {
                          setActiveParentIndex(index);
                          setIsSubMenuOpen(true);
                          setSubSelectedIndex(0);
                        } else {
                          item.action();
                          window.YUA.window.closeWindow('menu');
                        }
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className="text-2xl">{item.icon}</div>
                      <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm shadow-sm">
                        {item.label} <span className="uppercase opacity-80">({item.shortcut})</span>
                      </div>
                    </motion.div>
                  );
                })}
              </>
            )}

            {/* 二级菜单模式：中心显示父级，周围环形显示子项 */}
            {isSubMenuOpen && activeParentIndex !== null && (
              <>
                {/* 中心父级按钮：点击返回一级 */}
                <motion.div
                  layout
                  layoutId={`menu-item-${menuItems[activeParentIndex].id}`}
                  className="absolute w-20 h-20 rounded-full flex items-center justify-center bg-foreground text-background shadow-xl ring-2 cursor-pointer select-none"
                  style={{ left: 'calc(50% - 40px)', top: 'calc(50% - 40px)' }}
                  initial={false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', duration: 0.4, layout: { duration: 0.35 } }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSubMenuOpen(false);
                    setActiveParentIndex(null);
                  }}
                >
                  <div className="text-2xl">{menuItems[activeParentIndex].icon}</div>
                  <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm shadow-sm">
                    {menuItems[activeParentIndex].label}
                  </div>
                </motion.div>

                {/* 子项环形 */}
                {activeChildren.map((child, index) => {
                  const position = getItemPosition(index, activeChildren.length, 130);
                  const isSelected = index === subSelectedIndex;
                  return (
                    <motion.div
                      key={child.id}
                      className={`
                        absolute w-16 h-16 rounded-full flex items-center justify-center
                        cursor-pointer select-none
                        ${isSelected ? 'bg-muted text-muted-foreground shadow-xl ring-2' : 'bg-foreground text-background'}
                      `}
                      style={{
                        left: `calc(50% + ${position.x}px - 32px)`,
                        top: `calc(50% + ${position.y}px - 32px)`
                      }}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', delay: index * 0.06, duration: 0.5 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        child.action();
                        window.YUA.window.closeWindow('menu');
                      }}
                      onMouseEnter={() => setSubSelectedIndex(index)}
                    >
                      <div className="text-2xl">{child.icon ?? '•'}</div>
                      <div className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] leading-4 font-mono whitespace-nowrap px-2 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm shadow-sm">
                        {child.label}
                      </div>
                    </motion.div>
                  );
                })}
              </>
            )}
          </div>
        </LayoutGroup>
      </motion.div>
    </AnimatePresence>
  );
};

export default AssistantMenuPage;
