import './styles.css';

import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbRefresh, TbSparkles, TbStarFilled, TbX } from 'react-icons/tb';

import SkillDetailPanel from './SkillDetailPanel';
import SkillTreeCanvas from './SkillTreeCanvas';
import { SkillStatus, skillTreeNodes } from './skillTreeData';

// 初始化所有技能的默认状态（考虑等级要求）
const initializeSkillStatuses = (personaLevel: number): Record<string, SkillStatus> => {
  const statuses: Record<string, SkillStatus> = {};
  skillTreeNodes.forEach((node) => {
    // 检查等级要求
    if (node.requiredLevel && personaLevel < node.requiredLevel) {
      statuses[node.id] = 'locked';
      return;
    }
    // 初级技能默认解锁，其他锁定（由于前置技能）
    statuses[node.id] = node.prerequisites.length === 0 ? 'unlocked' : 'locked';
  });
  return statuses;
};

const SkillTreeSettings: React.FC = () => {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [personaLevel, setPersonaLevel] = useState<number>(1);
  const [skillStatuses, setSkillStatuses] = useState<Record<string, SkillStatus>>(() => initializeSkillStatuses(1));

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
        // 加载精灵等级
        let currentLevel = 1;
        try {
          const personaResult = await window.YUA.persona.getState();
          if (personaResult?.ok && personaResult.state?.level) {
            currentLevel = personaResult.state.level;
            setPersonaLevel(currentLevel);
          }
        } catch {
          // Persona API 可能不可用
        }

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

        // 加载 ASR 语音识别服务状态
        let asrRunning = false;
        try {
          const asrStatus = await window.YUA.sherpa.getStatus();
          asrRunning = asrStatus.running;
        } catch {
          // ASR 服务可能未初始化
        }

        setSkillStatuses((prev) => {
          // 先用等级初始化基础状态
          const baseStatuses = initializeSkillStatuses(currentLevel);
          return {
            ...baseStatuses,
            ...prev,
            // 映射到新的技能 ID（覆盖等级检查，因为已经启用）
            movement: movementEnabled ? 'active' : (baseStatuses['movement'] ?? 'unlocked'),
            dailyCare: dailyCareEnabled ? 'active' : (baseStatuses['dailyCare'] ?? 'unlocked'),
            microphone: recorderEnabled ? 'active' : (baseStatuses['microphone'] ?? 'unlocked'),
            systemAudio: recorderEnabled ? 'active' : (baseStatuses['systemAudio'] ?? 'unlocked'),
            screenshot: screenshotEnabled ? 'active' : (baseStatuses['screenshot'] ?? 'unlocked'),
            speechRecognition: asrRunning ? 'active' : (baseStatuses['speechRecognition'] ?? 'locked'),
            spriteManage: 'unlocked', // Sprite 管理始终解锁
            aiChat: 'unlocked' // AI 对话始终解锁
          };
        });
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

      // 麦克风技能：控制 WebRecorder 窗口
      if (skillId === 'microphone') {
        if (enabled) {
          window.YUA.window['window:open']('webRecorder');
        } else {
          window.YUA.window['window:close']('webRecorder');
        }
        setSkillStatuses((prev) => ({
          ...prev,
          [skillId]: enabled ? 'active' : 'unlocked'
        }));
        return;
      }

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
        case 'speechRecognition':
          if (enabled) {
            // 打开 ASR 配置页面来启动服务
            window.YUA.window['window:open']('asrConfig');
          } else {
            // 停止 ASR 服务
            await window.YUA.sherpa.freeInstance();
            await window.YUA.sherpa.saveASRConfig({ enabled: false });
          }
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

  // 计算技能统计
  const skillStats = useMemo(() => {
    const total = skillTreeNodes.length;
    const active = Object.values(skillStatuses).filter((s) => s === 'active').length;
    return { total, active };
  }, [skillStatuses]);

  const handleClose = useCallback(() => {
    window.ipcRenderer.invoke('skillTree:close');
  }, []);

  // 重置等级
  const handleResetLevel = useCallback(async () => {
    const confirmed = window.confirm('确定要重置精灵等级吗？这将清除所有经验值、好感度和成就数据。');
    if (!confirmed) return;

    try {
      await window.YUA.persona.resetState();
      setPersonaLevel(1);
      setSkillStatuses(initializeSkillStatuses(1));
    } catch (error) {
      console.error('重置等级失败:', error);
    }
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* 技能树画布 */}
      <SkillTreeCanvas skillStatuses={skillStatuses} selectedSkill={selectedSkill} onSelectSkill={handleSelectSkill} />

      {/* 顶部 HUD 信息栏 */}
      <motion.div className="fixed top-0 left-0 right-0 z-40 skill-tree-hud" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
        <div className="flex items-center justify-between px-6 py-3">
          {/* 左侧：标题 */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TbSparkles className="w-5 h-5 text-amber-400" style={{ filter: 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.6))' }} />
              <span className="text-sm font-bold text-slate-200" style={{ textShadow: '0 0 10px rgba(255,255,255,0.1)' }}>
                技能树
              </span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            {/* 精灵等级 */}
            <div className="flex items-center gap-1.5">
              <TbStarFilled className="w-3.5 h-3.5 text-amber-400" style={{ filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.6))' }} />
              <span className="text-xs text-slate-400">
                精灵 <span className="text-amber-400 font-bold">Lv.{personaLevel}</span>
              </span>
              {/* 重置等级按钮 */}
              <button onClick={handleResetLevel} className="p-1 rounded hover:bg-slate-700/50 transition-colors group" title="重置等级（测试用）">
                <TbRefresh className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            {/* 技能统计 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52, 211, 153, 0.6)' }} />
                <span className="text-xs text-slate-400">
                  已激活 <span className="text-emerald-400 font-bold">{skillStats.active}</span> / {skillStats.total}
                </span>
              </div>
              {/* 进度条 */}
              <div className="w-24 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, #22c55e, #10b981)',
                    boxShadow: '0 0 8px rgba(34, 197, 94, 0.5)'
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${skillStats.total > 0 ? (skillStats.active / skillStats.total) * 100 : 0}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
            </div>
          </div>

          {/* 右侧：提示 + 关闭 */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500">按住 Cmd/Ctrl + 滚轮缩放 · 拖拽平移</span>
            <button onClick={handleClose} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700/50 transition-colors group">
              <TbX className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* 技能详情面板 */}
      <AnimatePresence>
        {selectedSkill && selectedSkill !== 'core' && (
          <SkillDetailPanel selectedSkillId={selectedSkill} skillStatuses={skillStatuses} personaLevel={personaLevel} onClose={handleClosePanel} onToggleSkill={handleToggleSkill} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SkillTreeSettings;
