import './styles.css';

import React, { useCallback, useEffect, useState } from 'react';

import SkillDetailPanel from './SkillDetailPanel';
import SkillTreeCanvas from './SkillTreeCanvas';
import { SkillStatus, skillTreeNodes } from './skillTreeData';

// 初始化所有技能的默认状态
const initializeSkillStatuses = (): Record<string, SkillStatus> => {
  const statuses: Record<string, SkillStatus> = {};
  skillTreeNodes.forEach((node) => {
    // 初级技能默认解锁，其他锁定
    statuses[node.id] = node.prerequisites.length === 0 ? 'unlocked' : 'locked';
  });
  return statuses;
};

const SkillTreeSettings: React.FC = () => {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillStatuses, setSkillStatuses] = useState<Record<string, SkillStatus>>(initializeSkillStatuses);

  // ESC 键退出功能
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.ipcRenderer.invoke('skillTree:close');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // 加载各个扩展的实际启用状态
  useEffect(() => {
    const loadStatuses = async (): Promise<void> => {
      try {
        // 加载 Movement 状态
        const movementEnabled = await window.YUA.window.getAutoWalkEnabled();

        // 加载 DailyCare 状态
        let dailyCareEnabled = false;
        if (window.YUA.dailyCare) {
          const snapshot = await window.YUA.dailyCare['dailyCare:getSnapshot']();
          dailyCareEnabled = snapshot?.enabled ?? false;
        }

        // 加载 Recorder 状态
        let recorderEnabled = false;
        try {
          const recorderConfig = await window.YUA.recorder.getConfig();
          recorderEnabled = recorderConfig?.enabled ?? false;
        } catch {
          // Recorder 可能未初始化
        }

        // 加载截图功能状态
        let screenshotEnabled = false;
        try {
          const enabledConfig = await window.YUA.shortcuts['shortcuts:getEnabledConfig']();
          screenshotEnabled = enabledConfig?.ok && enabledConfig.data?.screenshot === true;
        } catch {
          // 截图功能可能未初始化
        }

        setSkillStatuses((prev) => ({
          ...prev,
          // 映射到新的技能 ID
          movement: movementEnabled ? 'active' : 'unlocked',
          dailyCare: dailyCareEnabled ? 'active' : 'unlocked',
          microphone: recorderEnabled ? 'active' : 'unlocked',
          systemAudio: recorderEnabled ? 'active' : 'unlocked',
          screenshot: screenshotEnabled ? 'active' : 'unlocked',
          spriteManage: 'unlocked', // Sprite 管理始终解锁
          aiChat: 'unlocked' // AI 对话始终解锁
        }));
      } catch (error) {
        console.warn('加载技能状态失败:', error);
      }
    };

    loadStatuses();

    // 监听状态变化
    const handleAutoWalkChange = (_: unknown, isEnabled: boolean): void => {
      setSkillStatuses((prev) => ({
        ...prev,
        movement: isEnabled ? 'active' : 'unlocked'
      }));
    };

    // 监听截图功能启用状态变化
    const handleScreenshotEnabledChange = (_: unknown, data: { screenshot: boolean }): void => {
      setSkillStatuses((prev) => ({
        ...prev,
        screenshot: data.screenshot ? 'active' : 'unlocked'
      }));
    };

    window.ipcRenderer?.on('auto-walk-enabled-changed', handleAutoWalkChange);
    window.ipcRenderer?.on('shortcuts-enabled-updated', handleScreenshotEnabledChange);

    return () => {
      window.ipcRenderer?.off('auto-walk-enabled-changed', handleAutoWalkChange as never);
      window.ipcRenderer?.off('shortcuts-enabled-updated', handleScreenshotEnabledChange as never);
    };
  }, []);

  const handleSelectSkill = useCallback((skillId: string) => {
    setSelectedSkill((prev) => (prev === skillId ? null : skillId));
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedSkill(null);
  }, []);

  const handleToggleSkill = useCallback(async (skillId: string, enabled: boolean) => {
    try {
      // 根据 skillId 执行对应的操作
      const skill = skillTreeNodes.find((n) => n.id === skillId);
      if (!skill) return;

      switch (skill.settingsKey) {
        case 'movement':
          await window.YUA.window.setAutoWalkEnabled(enabled);
          break;
        case 'dailyCare':
          if (window.YUA.dailyCare) {
            await window.YUA.dailyCare['dailyCare:updateSettings']({ enabled });
          }
          break;
        case 'recorder':
          if (enabled) {
            await window.YUA.recorder.start();
          } else {
            await window.YUA.recorder.stop();
          }
          await window.YUA.recorder.updateConfig({ enabled });
          break;
        case 'sprite':
          // Sprite 管理不需要开关
          break;
        default:
          // 对于没有 settingsKey 的技能，检查是否是截图技能
          if (skillId === 'screenshot') {
            await window.YUA.shortcuts['shortcuts:setEnabledConfig']({ screenshot: enabled });
          }
          break;
      }

      setSkillStatuses((prev) => ({
        ...prev,
        [skillId]: enabled ? 'active' : 'unlocked'
      }));
    } catch (error) {
      console.error('切换技能状态失败:', error);
    }
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 技能树画布 */}
      <SkillTreeCanvas skillStatuses={skillStatuses} selectedSkill={selectedSkill} onSelectSkill={handleSelectSkill} />

      {/* 技能详情面板 */}
      {selectedSkill && selectedSkill !== 'core' && <SkillDetailPanel selectedSkillId={selectedSkill} skillStatuses={skillStatuses} onClose={handleClosePanel} onToggleSkill={handleToggleSkill} />}
    </div>
  );
};

export default SkillTreeSettings;
