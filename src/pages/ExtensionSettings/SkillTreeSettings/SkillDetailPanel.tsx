import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { TbLock, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

import DailyCareSettings from '../DailyCareSettings';
import MovementSettings from '../MovementSettings';
import RecorderSettings from '../RecorderSettings';
import SpriteSettings from '../SpriteSettings';
import ShortcutKeyDisplay from './ShortcutKeyDisplay';
import { canUnlockSkill, getNodeColors, getTierConfig, SkillStatus, skillTreeNodes } from './skillTreeData';

interface SkillDetailPanelProps {
  selectedSkillId: string | null;
  skillStatuses: Record<string, SkillStatus>;
  onClose: () => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
}

const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({ selectedSkillId, skillStatuses, onClose, onToggleSkill }) => {
  const selectedNode = skillTreeNodes.find((n) => n.id === selectedSkillId);
  const [shortcutVerified, setShortcutVerified] = useState(false);
  const [showActivationAnimation, setShowActivationAnimation] = useState(false);

  if (!selectedNode) {
    return null;
  }

  // 计算活跃技能集合
  const activeSkills = new Set(
    Object.entries(skillStatuses)
      .filter(([, status]) => status === 'active')
      .map(([id]) => id)
  );

  const colors = getNodeColors(selectedNode.branch);
  const tierConfig = getTierConfig(selectedNode.tier);
  const status = skillStatuses[selectedNode.id] || 'locked';
  const isActive = status === 'active';
  const isUnlocked = status === 'unlocked' || status === 'active';
  const canUnlock = canUnlockSkill(selectedNode.id, activeSkills);
  const Icon = selectedNode.icon;
  const hasRequiredShortcut = !!selectedNode.requiredShortcut;

  // 如果技能已激活，自动标记快捷键为已验证
  React.useEffect(() => {
    if (isActive) {
      setShortcutVerified(true);
    } else if (selectedSkillId !== selectedNode.id) {
      // 切换技能时重置验证状态和动画
      setShortcutVerified(false);
      setShowActivationAnimation(false);
    }
  }, [isActive, selectedSkillId, selectedNode.id]);

  // 处理快捷键验证
  const handleShortcutVerified = () => {
    setShortcutVerified(true);
  };

  // 处理长按完成（用于截图技能）
  const handleLongPressComplete = () => {
    setShowActivationAnimation(true);
    // 触发技能开启
    setTimeout(() => {
      onToggleSkill(selectedNode.id, true);
      // 动画结束后隐藏
      setTimeout(() => {
        setShowActivationAnimation(false);
      }, 2000);
    }, 500);
  };

  // 获取前置技能信息
  const prerequisites = selectedNode.prerequisites.map((prereqId) => {
    const prereqNode = skillTreeNodes.find((n) => n.id === prereqId);
    const prereqStatus = skillStatuses[prereqId] || 'locked';
    return {
      id: prereqId,
      name: prereqNode?.name || prereqId,
      isActive: prereqStatus === 'active'
    };
  });

  // 根据 settingsKey 渲染对应的设置组件
  const renderSettingsContent = (): React.ReactNode => {
    switch (selectedNode.settingsKey) {
      case 'movement':
        return <MovementSettings expanded={true} onExpand={() => { }} />;
      case 'dailyCare':
        return <DailyCareSettings expanded={true} onExpand={() => { }} />;
      case 'sprite':
        return <SpriteSettings expanded={true} onExpand={() => { }} />;
      case 'recorder':
        return <RecorderSettings expanded={true} onExpand={() => { }} />;
      default:
        return (
          <div className="text-center text-slate-400 py-8">
            <p>该技能暂无详细设置</p>
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      {/* 侧边栏面板 */}
      <motion.div
        className="fixed top-0 right-0 bottom-0 z-50 w-[480px] max-w-[85vw] overflow-hidden"
        style={{
          borderTopLeftRadius: '16px',
          borderBottomLeftRadius: '16px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
          borderLeft: `2px solid ${colors.color}40`,
          boxShadow: `-0 0 60px ${colors.glowColor}, -0 0 100px ${colors.glowColor}40, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
        }}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* 顶部发光条 */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.color}, transparent)`
          }}
        />

        {/* 头部 */}
        <div className="relative p-6 border-b border-slate-700/50">
          {/* 背景装饰 */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              background: `radial-gradient(ellipse at top, ${colors.color}40 0%, transparent 70%)`
            }}
          />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* 技能图标 */}
              <motion.div
                className="relative flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${colors.gradientFrom}30, ${colors.gradientTo}30)`,
                  border: `2px solid ${colors.color}60`,
                  boxShadow: `0 0 20px ${colors.glowColor}`
                }}
                animate={isActive ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    color: colors.color,
                    filter: `drop-shadow(0 0 8px ${colors.color})`
                  }}
                >
                  <Icon className="w-full h-full" />
                </div>

                {/* 激活状态指示器 */}
                {isActive && (
                  <motion.div
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                    style={{ backgroundColor: colors.color }}
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </motion.div>

              <div className="min-w-0">
                <h2
                  className="text-lg font-bold truncate"
                  style={{
                    color: colors.color,
                    textShadow: `0 0 20px ${colors.glowColor}`
                  }}
                >
                  {selectedNode.name}
                </h2>
                <p className="text-xs text-slate-400 truncate">{selectedNode.description}</p>
              </div>
            </div>

            {/* 关闭按钮 */}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-slate-700/50 flex-shrink-0" onClick={onClose}>
              <TbX className="h-4 w-4 text-slate-400" />
            </Button>
          </div>

          {/* 技能等级标签 */}
          <div className="flex items-center gap-2 mt-3">
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: `${tierConfig.color}20`,
                color: tierConfig.color,
                border: `1px solid ${tierConfig.color}40`
              }}
            >
              {tierConfig.label}技能
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: `${colors.color}20`,
                color: colors.color,
                border: `1px solid ${colors.color}40`
              }}
            >
              {skillTreeNodes.find((n) => n.branch === selectedNode.branch)?.branch === selectedNode.branch ? getNodeColors(selectedNode.branch).name || selectedNode.branch : selectedNode.branch}
            </span>
          </div>

          {/* 前置技能要求 - 紧凑版 */}
          {prerequisites.length > 0 && (
            <div className="mt-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <div className="text-[10px] text-slate-500 mb-1">前置技能要求</div>
              <div className="flex flex-wrap gap-1">
                {prerequisites.map((prereq) => (
                  <span
                    key={prereq.id}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                    style={{
                      backgroundColor: prereq.isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                      color: prereq.isActive ? '#22c55e' : '#ef4444',
                      border: `1px solid ${prereq.isActive ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                    }}
                  >
                    {prereq.isActive ? '✓' : <TbLock className="w-2.5 h-2.5" />}
                    {prereq.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 快捷键验证提示 */}
          {hasRequiredShortcut && !isActive && (
            <div className="mt-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <ShortcutKeyDisplay
                shortcut={selectedNode.requiredShortcut!}
                onVerified={handleShortcutVerified}
                color={colors.color}
                glowColor={colors.glowColor}
                requireLongPress={selectedNode.id === 'screenshot'}
                longPressDuration={2000}
                onLongPressComplete={handleLongPressComplete}
              />
            </div>
          )}

          {/* 技能开关 - 紧凑版 */}
          <div className="relative flex items-center justify-between mt-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: isActive ? colors.color : canUnlock ? '#fbbf24' : '#6b7280',
                  boxShadow: isActive ? `0 0 10px ${colors.color}` : 'none'
                }}
              />
              <span className="text-xs text-slate-300 font-medium">
                {isActive ? '技能已激活' : hasRequiredShortcut && !shortcutVerified ? '请先验证快捷键' : canUnlock ? '可以解锁' : '需要前置技能'}
              </span>
            </div>

            <Switch
              checked={isActive}
              onCheckedChange={(checked) => {
                // 如果需要快捷键且未验证，阻止开启
                if (checked && hasRequiredShortcut && !shortcutVerified && !isActive) {
                  return;
                }
                onToggleSkill(selectedNode.id, checked);
              }}
              disabled={(!canUnlock && !isActive) || (hasRequiredShortcut && !shortcutVerified && !isActive)}
              className="data-[state=checked]:bg-primary"
              style={
                isActive
                  ? {
                    backgroundColor: colors.color
                  }
                  : {}
              }
            />
          </div>
        </div>

        {/* 内容区域 */}
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div className="p-4">
            {/* 技能详情标题 */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-1 h-4 rounded-full"
                style={{
                  backgroundColor: colors.color,
                  boxShadow: `0 0 10px ${colors.color}`
                }}
              />
              <h3 className="text-sm font-semibold text-slate-200">技能设置</h3>
            </div>

            {/* 设置内容 - 重新样式化的容器 */}
            <div
              className="rounded-xl p-3"
              style={{
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(71, 85, 105, 0.3)'
              }}
            >
              {renderSettingsContent()}
            </div>
          </div>
        </ScrollArea>

        {/* 底部装饰 */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, transparent, ${colors.color}40, transparent)`
          }}
        />

        {/* 开启动画效果 */}
        <AnimatePresence>
          {showActivationAnimation && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* 背景光晕 */}
              <motion.div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(circle, ${colors.glowColor}40 0%, transparent 70%)`
                }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [0.8, 1.2, 1.5], opacity: [0, 0.6, 0] }}
                transition={{ duration: 2, ease: 'easeOut' }}
              />

              {/* 中心图标动画 */}
              <motion.div
                className="relative flex items-center justify-center w-32 h-32"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.2, 1], rotate: [180, 0, 0] }}
                transition={{ duration: 1, ease: 'easeOut' }}
              >
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${colors.gradientFrom}, ${colors.gradientTo})`,
                    boxShadow: `0 0 60px ${colors.glowColor}, 0 0 100px ${colors.glowColor}`
                  }}
                />
                <motion.div
                  className="relative z-10"
                  style={{
                    width: 64,
                    height: 64,
                    color: '#ffffff',
                    filter: `drop-shadow(0 0 20px rgba(255,255,255,0.8))`
                  }}
                  animate={{ scale: [1, 1.1, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5, repeat: 2 }}
                >
                  <Icon className="w-full h-full" />
                </motion.div>
              </motion.div>

              {/* 成功文字 */}
              <motion.div
                className="absolute bottom-32 left-0 right-0 text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -20] }}
                transition={{ duration: 2, times: [0, 0.2, 0.8, 1] }}
              >
                <div
                  className="text-2xl font-bold"
                  style={{
                    color: colors.color,
                    textShadow: `0 0 20px ${colors.glowColor}, 0 0 40px ${colors.glowColor}`
                  }}
                >
                  技能激活成功！
                </div>
                <div className="text-sm text-slate-300 mt-2">截图功能已启用</div>
              </motion.div>

              {/* 粒子效果 */}
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: colors.color,
                    boxShadow: `0 0 10px ${colors.glowColor}`
                  }}
                  initial={{
                    x: '50%',
                    y: '50%',
                    scale: 0,
                    opacity: 1
                  }}
                  animate={{
                    x: `calc(50% + ${Math.cos((i * 360) / 12) * 100}px)`,
                    y: `calc(50% + ${Math.sin((i * 360) / 12) * 100}px)`,
                    scale: [0, 1, 0],
                    opacity: [1, 1, 0]
                  }}
                  transition={{
                    duration: 1.5,
                    delay: 0.2,
                    ease: 'easeOut'
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

export default SkillDetailPanel;
