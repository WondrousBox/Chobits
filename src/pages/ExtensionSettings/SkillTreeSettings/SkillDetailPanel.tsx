import { AnimatePresence, motion } from 'framer-motion';
import React, { useState } from 'react';
import { TbLock, TbX } from 'react-icons/tb';

import type { SpriteCapabilitySnapshot } from '@packages/sprite-core/capability-registry';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';

import DailyCareSettings from '../DailyCareSettings';
import MovementSettings from '../MovementSettings';
import RecorderSettings from '../RecorderSettings';
import ScreenshotSettings from '../ScreenshotSettings';
import SpeakSettings from '../SpeakSettings';
import SpeechRecognitionSettings from '../SpeechRecognitionSettings';
import SpriteSettings from '../SpriteSettings';
import ShortcutKeyDisplay from './ShortcutKeyDisplay';
import SkillActivationAnimation from './SkillActivationAnimation';
import { getNodeColors, getTierConfig, type SkillStatus, skillTreeNodeMap } from './skillTreeData';

interface SkillDetailPanelProps {
  selectedSkillId: string | null;
  capabilitySnapshot: SpriteCapabilitySnapshot | null;
  onClose: () => void;
  onToggleSkill: (skillId: string, enabled: boolean) => void | Promise<void>;
}

const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({ selectedSkillId, capabilitySnapshot, onClose, onToggleSkill }) => {
  const selectedNode = selectedSkillId ? skillTreeNodeMap.get(selectedSkillId) : undefined;
  const [shortcutVerified, setShortcutVerified] = useState(false);
  const [showActivationAnimation, setShowActivationAnimation] = useState(false);
  const prevStatusRef = React.useRef<SkillStatus>('locked');
  const prevSkillIdRef = React.useRef<string | null>(null);

  if (!selectedNode) {
    return null;
  }

  const personaLevel = capabilitySnapshot?.personaLevel ?? 1;
  const selectedCapability = capabilitySnapshot?.capabilities[selectedNode.id];
  const colors = getNodeColors(selectedNode.branch);
  const tierConfig = getTierConfig(selectedNode.tier);
  const status = selectedCapability?.status ?? 'locked';
  const isActive = selectedCapability?.active ?? status === 'active';
  const canUnlock = selectedCapability?.unlockReady ?? false;
  const meetsLevelRequirement = selectedCapability?.meetsLevelRequirement ?? (!selectedNode.requiredLevel || personaLevel >= selectedNode.requiredLevel);
  const Icon = selectedNode.icon;
  const hasRequiredShortcut = !!selectedNode.requiredShortcut;

  // 如果技能已激活，自动标记快捷键为已验证
  React.useEffect(() => {
    if (isActive) {
      setShortcutVerified(true);
    }
  }, [isActive]);

  // 切换技能时重置状态
  React.useEffect(() => {
    // 如果切换了技能，重置相关状态
    if (prevSkillIdRef.current !== null && prevSkillIdRef.current !== selectedSkillId) {
      setShortcutVerified(false);
      setShowActivationAnimation(false);
      // 重置 prevStatusRef 为当前技能的状态
      prevStatusRef.current = status;
    }
    // 初始化或更新 prevStatusRef
    if (prevSkillIdRef.current !== selectedSkillId) {
      prevStatusRef.current = status;
      prevSkillIdRef.current = selectedSkillId;
    }
  }, [selectedSkillId, status]);

  // 监听技能状态变化，从非 active 变为 active 时显示动画
  React.useEffect(() => {
    const prevStatus = prevStatusRef.current;
    // 如果从非激活状态变为激活状态，显示动画
    // 确保不是首次加载（prevStatus 已设置且不是 'active'）
    if (prevStatus && prevStatus !== 'active' && status === 'active') {
      setShowActivationAnimation(true);
    }
    // 更新 prevStatusRef（只有在状态真正变化时）
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
    }
  }, [status]);

  // 处理快捷键验证
  const handleShortcutVerified = () => {
    setShortcutVerified(true);
  };

  // 处理长按完成（用于截图技能）
  const handleLongPressComplete = () => {
    // 触发技能开启，动画会在状态变化时自动显示
    onToggleSkill(selectedNode.id, true);
  };

  // 处理动画完成
  const handleAnimationComplete = () => {
    setShowActivationAnimation(false);
  };

  // 获取前置技能信息
  const prerequisites = selectedNode.prerequisites.map((prereqId) => {
    const prereqNode = skillTreeNodeMap.get(prereqId);
    const prereqStatus = capabilitySnapshot?.capabilities[prereqId]?.status ?? 'locked';
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
        return <MovementSettings capability={selectedCapability ?? null} />;
      case 'speak':
        return <SpeakSettings />;
      case 'dailyCare':
        return <DailyCareSettings capability={selectedCapability ?? null} />;
      case 'sprite':
        return <SpriteSettings />;
      case 'recorder':
        return <RecorderSettings capability={selectedCapability ?? null} />;
      case 'speechRecognition':
        return <SpeechRecognitionSettings capability={selectedCapability ?? null} />;
      case 'screenshot':
        return <ScreenshotSettings capability={selectedCapability ?? null} />;
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
              {colors.name || selectedNode.branch}
            </span>
          </div>

          {/* 前置技能要求 - 紧凑版 */}
          {(prerequisites.length > 0 || selectedNode.requiredLevel) && (
            <div className="mt-3 p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <div className="text-[10px] text-slate-500 mb-1">前置技能要求</div>
              <div className="flex flex-wrap gap-1">
                {/* 等级要求 */}
                {selectedNode.requiredLevel && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"
                    style={{
                      backgroundColor: meetsLevelRequirement ? 'rgba(34, 197, 94, 0.2)' : 'rgba(251, 191, 36, 0.2)',
                      color: meetsLevelRequirement ? '#22c55e' : '#fbbf24',
                      border: `1px solid ${meetsLevelRequirement ? 'rgba(34, 197, 94, 0.4)' : 'rgba(251, 191, 36, 0.4)'}`
                    }}
                  >
                    {meetsLevelRequirement ? '✓' : <TbLock className="w-2.5 h-2.5" />}
                    Lv.{selectedNode.requiredLevel}
                  </span>
                )}
                {/* 前置技能 */}
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
                {isActive
                  ? '技能已激活'
                  : !meetsLevelRequirement
                    ? `需要精灵 Lv.${selectedNode.requiredLevel}`
                    : hasRequiredShortcut && !shortcutVerified
                      ? '请先验证快捷键'
                      : canUnlock
                        ? '可以解锁'
                        : '需要前置技能'}
              </span>
            </div>

            <Switch
              checked={isActive}
              onCheckedChange={(checked) => {
                // 如果需要快捷键且未验证，阻止开启
                if (checked && hasRequiredShortcut && !shortcutVerified && !isActive) {
                  return;
                }
                // 如果是从关闭切换到开启，会触发动画（通过状态变化监听）
                onToggleSkill(selectedNode.id, checked);
              }}
              disabled={(!canUnlock && !isActive) || !meetsLevelRequirement || (hasRequiredShortcut && !shortcutVerified && !isActive)}
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
        <SkillActivationAnimation
          show={showActivationAnimation}
          skillName={selectedNode.name}
          skillDescription={selectedNode.description}
          Icon={Icon}
          color={colors.color}
          glowColor={colors.glowColor}
          gradientFrom={colors.gradientFrom}
          gradientTo={colors.gradientTo}
          onComplete={handleAnimationComplete}
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default SkillDetailPanel;
