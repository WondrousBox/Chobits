import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { TbLock } from 'react-icons/tb';

import { getNodeColors, getTierConfig, SkillNode as SkillNodeType, SkillStatus } from './skillTreeData';

interface SkillNodeProps {
  node: SkillNodeType;
  status: SkillStatus;
  isSelected: boolean;
  onClick: () => void;
  position: { x: number; y: number };
}

const SkillNode: React.FC<SkillNodeProps> = ({ node, status, isSelected, onClick, position }) => {
  const [isHovered, setIsHovered] = useState(false);
  const colors = getNodeColors(node.branch);
  const tierConfig = getTierConfig(node.tier);
  const Icon = node.icon;

  const isActive = status === 'active';
  const isUnlocked = status === 'unlocked' || status === 'active';
  const isLocked = !isUnlocked;

  const nodeSize = 68;
  const iconSize = 28;

  return (
    <motion.div
      className="absolute cursor-pointer skill-node-interactive"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -50%)',
        zIndex: isSelected ? 30 : isHovered ? 20 : 10
      }}
      initial={{ scale: 0, opacity: 0, transform: 'translate(-50%, -50%)' }}
      animate={{ scale: 1, opacity: 1, transform: 'translate(-50%, -50%)' }}
      transition={{ delay: 0.1, duration: 0.4, type: 'spring' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* 外圈装饰环 - 激活状态 */}
      <AnimatePresence>
        {isActive && (
          <>
            {/* 呼吸光晕 */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: nodeSize + 30,
                height: nodeSize + 30,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(circle, ${colors.glowColor} 0%, transparent 70%)`
              }}
              initial={{ scale: 0.8, opacity: 0, transform: 'translate(-50%, -50%)' }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 0.15, 0.4],
                transform: 'translate(-50%, -50%)'
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            {/* 外圈装饰环 */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: nodeSize + 18,
                height: nodeSize + 18,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                border: `1.5px solid ${colors.color}30`
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            />
          </>
        )}
      </AnimatePresence>

      {/* 悬停光晕 - 解锁/激活态显示 */}
      <AnimatePresence>
        {isHovered && isUnlocked && (
          <motion.div
            className="absolute rounded-full"
            style={{
              width: nodeSize + 16,
              height: nodeSize + 16,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${colors.glowColor} 0%, transparent 70%)`
            }}
            initial={{ scale: 0.9, opacity: 0, transform: 'translate(-50%, -50%)' }}
            animate={{ scale: 1.1, opacity: 0.35, transform: 'translate(-50%, -50%)' }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* 等级指示器 */}
      <motion.div
        className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
        style={{
          backgroundColor: `${tierConfig.color}25`,
          color: tierConfig.color,
          border: `1px solid ${tierConfig.color}40`,
          zIndex: 20
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        {tierConfig.label}
      </motion.div>

      {/* 主圆形节点 */}
      <motion.div
        className="relative rounded-full flex items-center justify-center"
        style={{
          width: nodeSize,
          height: nodeSize,
          background: isActive
            ? `linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%)`
            : isUnlocked
              ? `linear-gradient(135deg, ${colors.gradientFrom}20 0%, ${colors.gradientTo}20 100%)`
              : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          border: `3px solid ${isActive ? colors.color : isUnlocked ? `${colors.color}50` : '#374151'}`,
          boxShadow: isActive
            ? `0 0 25px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.15)`
            : isUnlocked
              ? `0 0 8px ${colors.glowColor}40, inset 0 2px 4px rgba(0,0,0,0.2)`
              : 'inset 0 2px 4px rgba(0,0,0,0.4)',
          opacity: isLocked ? 0.5 : 1
        }}
        animate={
          isActive
            ? {
              scale: [1, 1.04, 1],
              boxShadow: [
                `0 0 25px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.15)`,
                `0 0 40px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.25)`,
                `0 0 25px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.15)`
              ]
            }
            : {}
        }
        transition={isActive ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } : {}}
        whileHover={isUnlocked ? { scale: 1.12 } : {}}
        whileTap={isUnlocked ? { scale: 0.93 } : {}}
      >
        {/* 内圈装饰 + shimmer */}
        {isActive && (
          <>
            <motion.div
              className="absolute rounded-full"
              style={{
                width: nodeSize - 10,
                height: nodeSize - 10,
                border: `1px solid ${colors.color}40`
              }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            {/* 内部高光 */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 30% 25%, rgba(255,255,255,0.2) 0%, transparent 60%)'
              }}
            />
          </>
        )}

        {/* 图标 */}
        <div
          style={{
            width: iconSize,
            height: iconSize,
            color: isActive ? '#ffffff' : (isUnlocked ? colors.color : '#4b5563'),
            filter: isActive
              ? `drop-shadow(0 0 10px ${colors.color}) drop-shadow(0 2px 4px rgba(0,0,0,0.5))`
              : (isUnlocked ? `drop-shadow(0 0 6px ${colors.color}80)` : 'brightness(0.5)')
          }}
        >
          <Icon className="w-full h-full" />
        </div>

        {/* 锁定遮罩 */}
        {isLocked && (
          <motion.div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <TbLock className="w-5 h-5 text-gray-500" />
          </motion.div>
        )}
      </motion.div>

      {/* 节点名称 */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none"
        style={{ top: nodeSize + 8, transform: 'translateX(-50%)' }}
        initial={{ opacity: 0, y: -5, transform: 'translateX(-50%)' }}
        animate={{ opacity: 1, y: 0, transform: 'translateX(-50%)' }}
        transition={{ delay: 0.2 }}
      >
        <span
          className="text-[11px] font-semibold px-2.5 py-1 rounded-md"
          style={{
            color: isActive ? colors.color : (isUnlocked ? '#cbd5e1' : '#475569'),
            backgroundColor: 'rgba(10, 14, 26, 0.9)',
            border: `1px solid ${isActive ? `${colors.color}30` : 'rgba(71, 85, 105, 0.3)'}`,
            textShadow: isActive ? `0 0 10px ${colors.glowColor}` : undefined
          }}
        >
          {node.name}
        </span>
      </motion.div>

      {/* 悬浮 Tooltip */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="absolute skill-tooltip rounded-lg px-3 py-2 pointer-events-none z-50"
            style={{
              bottom: nodeSize + 40,
              left: '50%',
              transform: 'translateX(-50%)',
              minWidth: 140
            }}
            initial={{ opacity: 0, y: 8, transform: 'translateX(-50%)' }}
            animate={{ opacity: 1, y: 0, transform: 'translateX(-50%)' }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
          >
            <div className="text-xs font-bold mb-1" style={{ color: colors.color }}>{node.name}</div>
            <div className="text-[10px] text-slate-400 leading-relaxed">{node.description}</div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: isActive ? '#22c55e' : isUnlocked ? colors.color : '#6b7280'
                }}
              />
              <span className="text-[10px]" style={{ color: isActive ? '#22c55e' : isUnlocked ? '#94a3b8' : '#6b7280' }}>
                {isActive ? '已激活' : isUnlocked ? '可解锁' : '已锁定'}
              </span>
            </div>
            {/* Tooltip 箭头 */}
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.98)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderTop: 'none',
                borderLeft: 'none'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 选中指示器 */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            className="absolute rounded-full border-2"
            style={{
              width: nodeSize + 14,
              height: nodeSize + 14,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              borderColor: colors.color
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.8, 0.4, 0.8] }}
            exit={{ scale: 1.2, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SkillNode;
