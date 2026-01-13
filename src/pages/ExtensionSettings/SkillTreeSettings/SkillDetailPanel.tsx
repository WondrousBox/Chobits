import { AnimatePresence, motion } from 'framer-motion';
import React from 'react';
import { TbLock, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

import DailyCareSettings from '../DailyCareSettings';
import MovementSettings from '../MovementSettings';
import RecorderSettings from '../RecorderSettings';
import SpriteSettings from '../SpriteSettings';
import { canUnlockSkill, getNodeColors, getTierConfig, SkillStatus, skillTreeNodes } from './skillTreeData';

interface SkillDetailPanelProps {
  selectedSkillId: string | null;
  skillStatuses: Record<string, SkillStatus>;
  onClose: () => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void;
}

const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({ selectedSkillId, skillStatuses, onClose, onToggleSkill }) => {
  const selectedNode = skillTreeNodes.find((n) => n.id === selectedSkillId);

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
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        {/* 背景遮罩 */}
        <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />

        {/* 面板内容 */}
        <motion.div
          className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
            border: `2px solid ${colors.color}40`,
            boxShadow: `0 0 60px ${colors.glowColor}, 0 0 100px ${colors.glowColor}40, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
          }}
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
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
              <div className="flex items-center gap-4">
                {/* 技能图标 */}
                <motion.div
                  className="relative flex items-center justify-center w-16 h-16 rounded-xl"
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
                      width: 32,
                      height: 32,
                      color: colors.color,
                      filter: `drop-shadow(0 0 8px ${colors.color})`
                    }}
                  >
                    <Icon className="w-full h-full" />
                  </div>

                  {/* 激活状态指示器 */}
                  {isActive && (
                    <motion.div
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full"
                      style={{ backgroundColor: colors.color }}
                      animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </motion.div>

                <div>
                  <h2
                    className="text-2xl font-bold"
                    style={{
                      color: colors.color,
                      textShadow: `0 0 20px ${colors.glowColor}`
                    }}
                  >
                    {selectedNode.name}
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">{selectedNode.description}</p>
                </div>
              </div>

              {/* 关闭按钮 */}
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-700/50" onClick={onClose}>
                <TbX className="h-5 w-5 text-slate-400" />
              </Button>
            </div>

            {/* 技能等级标签 */}
            <div className="flex items-center gap-2 mt-4">
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: `${tierConfig.color}20`,
                  color: tierConfig.color,
                  border: `1px solid ${tierConfig.color}40`
                }}
              >
                {tierConfig.label}技能
              </span>
              <span
                className="px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: `${colors.color}20`,
                  color: colors.color,
                  border: `1px solid ${colors.color}40`
                }}
              >
                {skillTreeNodes.find((n) => n.branch === selectedNode.branch)?.branch === selectedNode.branch ? getNodeColors(selectedNode.branch).name || selectedNode.branch : selectedNode.branch}
              </span>
            </div>

            {/* 前置技能要求 */}
            {prerequisites.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <div className="text-xs text-slate-500 mb-2">前置技能要求</div>
                <div className="flex flex-wrap gap-2">
                  {prerequisites.map((prereq) => (
                    <span
                      key={prereq.id}
                      className="px-2 py-1 rounded text-xs font-medium flex items-center gap-1"
                      style={{
                        backgroundColor: prereq.isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: prereq.isActive ? '#22c55e' : '#ef4444',
                        border: `1px solid ${prereq.isActive ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                      }}
                    >
                      {prereq.isActive ? '✓' : <TbLock className="w-3 h-3" />}
                      {prereq.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 技能开关 */}
            <div className="relative flex items-center justify-between mt-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: isActive ? colors.color : canUnlock ? '#fbbf24' : '#6b7280',
                    boxShadow: isActive ? `0 0 10px ${colors.color}` : 'none'
                  }}
                />
                <span className="text-slate-300 font-medium">{isActive ? '技能已激活' : canUnlock ? '可以解锁' : '需要前置技能'}</span>
              </div>

              <div className="flex items-center gap-3">
                {canUnlock && <span className="text-xs text-slate-500">点击开关激活技能</span>}
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => onToggleSkill(selectedNode.id, checked)}
                  disabled={!canUnlock && !isActive}
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
          </div>

          {/* 内容区域 */}
          <ScrollArea className="h-[calc(85vh-240px)]">
            <div className="p-6">
              {/* 技能详情标题 */}
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{
                    backgroundColor: colors.color,
                    boxShadow: `0 0 10px ${colors.color}`
                  }}
                />
                <h3 className="text-lg font-semibold text-slate-200">技能设置</h3>
              </div>

              {/* 设置内容 - 重新样式化的容器 */}
              <div
                className="rounded-xl p-4"
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SkillDetailPanel;
