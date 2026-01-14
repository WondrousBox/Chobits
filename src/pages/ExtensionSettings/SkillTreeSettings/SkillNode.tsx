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

  const nodeSize = 64;
  const iconSize = 26;

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
      {/* 外圈脉冲光晕 - 激活状态 */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            className="absolute rounded-full"
            style={{
              width: nodeSize + 24,
              height: nodeSize + 24,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${colors.glowColor} 0%, transparent 70%)`
            }}
            initial={{ scale: 0.8, opacity: 0, transform: 'translate(-50%, -50%)' }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 0.2, 0.5],
              transform: 'translate(-50%, -50%)'
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>

      {/* 悬停光晕 - 仅激活状态显示 */}
      <AnimatePresence>
        {isHovered && isActive && (
          <motion.div
            className="absolute rounded-full"
            style={{
              width: nodeSize + 12,
              height: nodeSize + 12,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${colors.glowColor} 0%, transparent 70%)`
            }}
            initial={{ scale: 0.9, opacity: 0, transform: 'translate(-50%, -50%)' }}
            animate={{ scale: 1.1, opacity: 0.4, transform: 'translate(-50%, -50%)' }}
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
          background: isActive ? `linear-gradient(135deg, ${colors.gradientFrom} 0%, ${colors.gradientTo} 100%)` : 'linear-gradient(135deg, #374151 0%, #1f2937 100%)',
          border: `3px solid ${isActive ? colors.color : '#4b5563'}`,
          boxShadow: isActive ? `0 0 20px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.1)` : 'inset 0 2px 4px rgba(0,0,0,0.3)',
          opacity: isUnlocked ? 1 : 0.6
        }}
        animate={
          isActive
            ? {
              scale: [1, 1.05, 1],
              boxShadow: [
                `0 0 20px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.1)`,
                `0 0 35px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.2)`,
                `0 0 20px ${colors.glowColor}, inset 0 2px 4px rgba(255,255,255,0.1)`
              ]
            }
            : {}
        }
        transition={isActive ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
        whileHover={isUnlocked ? { scale: 1.1 } : {}}
        whileTap={isUnlocked ? { scale: 0.95 } : {}}
      >
        {/* 内圈装饰 */}
        {isActive && (
          <motion.div
            className="absolute rounded-full"
            style={{
              width: nodeSize - 12,
              height: nodeSize - 12,
              border: `1px solid ${colors.color}40`
            }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}

        {/* 图标 - 只有图标保持高亮 */}
        <div
          style={{
            width: iconSize,
            height: iconSize,
            color: isActive ? '#ffffff' : (isUnlocked ? colors.color : '#6b7280'),
            filter: isActive ? `drop-shadow(0 0 8px ${colors.color}) drop-shadow(0 2px 4px rgba(0,0,0,0.5))` : (isUnlocked ? `drop-shadow(0 0 4px ${colors.color})` : undefined)
          }}
        >
          <Icon className="w-full h-full" />
        </div>

        {/* 锁定遮罩 */}
        {!isUnlocked && (
          <motion.div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <TbLock className="w-5 h-5 text-gray-400" />
          </motion.div>
        )}
      </motion.div>

      {/* 节点名称 */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none"
        style={{ top: nodeSize + 6, transform: 'translateX(-50%)' }}
        initial={{ opacity: 0, y: -5, transform: 'translateX(-50%)' }}
        animate={{ opacity: 1, y: 0, transform: 'translateX(-50%)' }}
        transition={{ delay: 0.2 }}
      >
        <span
          className="text-xs font-medium px-2 py-0.5 rounded backdrop-blur-sm"
          style={{
            color: isActive ? colors.color : (isUnlocked ? '#94a3b8' : '#6b7280'),
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            textShadow: isActive ? `0 0 8px ${colors.glowColor}` : undefined
          }}
        >
          {node.name}
        </span>
      </motion.div>

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
