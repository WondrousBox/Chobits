import './styles.css';

import type { SpriteCapabilitySnapshot } from '@packages/sprite-core/capability-registry';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbRefresh, TbSparkles, TbStarFilled, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { ensureSpriteCapabilityAccessible, getSpriteCapabilityLockedReason, getSpriteCapabilityState } from '@/features/sprite-assistant/capability-ui';
import { useSpriteCapabilitySnapshot } from '@/features/sprite-assistant/hooks/useSpriteCapabilitySnapshot';
import { setSpriteAutoWalkEnabled } from '@/pages/ExtensionSettings/auto-walk-bridge';

import SkillDetailPanel from './SkillDetailPanel';
import SkillTreeCanvas from './SkillTreeCanvas';
import { type SkillStatus, skillTreeNodeMap, skillTreeNodes } from './skillTreeData';

const EMPTY_SKILL_STATUSES: Record<string, SkillStatus> = Object.fromEntries(skillTreeNodes.map((node) => [node.id, 'locked'])) as Record<string, SkillStatus>;

function buildSkillStatusesFromSnapshot(snapshot: SpriteCapabilitySnapshot | null): Record<string, SkillStatus> {
  if (!snapshot) return EMPTY_SKILL_STATUSES;

  const statuses: Record<string, SkillStatus> = {};
  for (const node of skillTreeNodes) {
    statuses[node.id] = snapshot.capabilities[node.id]?.status ?? 'locked';
  }
  return statuses;
}

const SkillTreeSettings: React.FC = () => {
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const { snapshot: capabilitySnapshot, refresh: refreshCapabilitySnapshot } = useSpriteCapabilitySnapshot();

  const personaLevel = capabilitySnapshot?.personaLevel ?? 1;
  const skillStatuses = useMemo(() => buildSkillStatusesFromSnapshot(capabilitySnapshot), [capabilitySnapshot]);

  const showLockedCapabilityToast = useCallback((capability: SpriteCapabilityState) => {
    toast.info(`${capability.name} 尚未解锁`, {
      description: getSpriteCapabilityLockedReason(capability)
    });
  }, []);

  // ESC 键退出功能
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        window.YUA.window['window:close']('skillTree');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleSelectSkill = useCallback((skillId: string) => {
    setSelectedSkill((prev) => (prev === skillId ? null : skillId));
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedSkill(null);
  }, []);

  const handleToggleSkill = useCallback(
    async (skillId: string, enabled: boolean) => {
      const capability = getSpriteCapabilityState(capabilitySnapshot, skillId);
      if (enabled && !ensureSpriteCapabilityAccessible(capability, showLockedCapabilityToast)) {
        return;
      }

      try {
        const skill = skillTreeNodeMap.get(skillId);
        if (!skill) return;

        if (skillId === 'microphone') {
          if (enabled) {
            await window.YUA.recorder.start();
            await window.YUA.window['window:open']('webRecorder');
          } else {
            await window.YUA.recorder.stop();
            await window.YUA.window['window:close']('webRecorder');
          }
          await window.YUA.recorder.updateConfig({ enabled });
          return;
        }

        switch (skill.settingsKey) {
          case 'movement':
            await setSpriteAutoWalkEnabled(enabled);
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
              await window.YUA.window['window:open']('asrConfig');
            } else {
              await window.YUA.sherpa.freeInstance();
              await window.YUA.sherpa.saveASRConfig({ enabled: false });
            }
            break;
          case 'sprite':
            break;
          case 'screenshot':
            await window.YUA.shortcuts['shortcuts:setEnabledConfig']({ screenshot: enabled });
            break;
          default:
            if (skillId === 'screenshot') {
              await window.YUA.shortcuts['shortcuts:setEnabledConfig']({ screenshot: enabled });
            }
            break;
        }
      } catch (error) {
        console.error('切换技能状态失败:', error);
      } finally {
        await refreshCapabilitySnapshot();
      }
    },
    [capabilitySnapshot, refreshCapabilitySnapshot, showLockedCapabilityToast]
  );

  const skillStats = useMemo(() => {
    if (capabilitySnapshot) {
      return {
        total: capabilitySnapshot.totals.total,
        active: capabilitySnapshot.totals.active
      };
    }

    return {
      total: skillTreeNodes.length,
      active: 0
    };
  }, [capabilitySnapshot]);

  const handleClose = useCallback(() => {
    window.YUA.window['window:close']('skillTree');
  }, []);

  const handleResetLevel = useCallback(async () => {
    const confirmed = window.confirm('确定要重置精灵等级吗？这将清除所有经验值、好感度和成就数据。');
    if (!confirmed) return;

    try {
      await window.YUA.persona.resetState();
      await refreshCapabilitySnapshot();
    } catch (error) {
      console.error('重置等级失败:', error);
    }
  }, [refreshCapabilitySnapshot]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <SkillTreeCanvas skillStatuses={skillStatuses} selectedSkill={selectedSkill} onSelectSkill={handleSelectSkill} />

      <motion.div className="fixed top-0 left-0 right-0 z-40 skill-tree-hud" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <TbSparkles className="w-5 h-5 text-amber-400" style={{ filter: 'drop-shadow(0 0 6px rgba(251, 191, 36, 0.6))' }} />
              <span className="text-sm font-bold text-slate-200" style={{ textShadow: '0 0 10px rgba(255,255,255,0.1)' }}>
                技能树
              </span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-1.5">
              <TbStarFilled className="w-3.5 h-3.5 text-amber-400" style={{ filter: 'drop-shadow(0 0 4px rgba(251, 191, 36, 0.6))' }} />
              <span className="text-xs text-slate-400">
                精灵 <span className="text-amber-400 font-bold">Lv.{personaLevel}</span>
              </span>
              <button onClick={handleResetLevel} className="p-1 rounded hover:bg-slate-700/50 transition-colors group" title="重置等级（测试用）">
                <TbRefresh className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </button>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(52, 211, 153, 0.6)' }} />
                <span className="text-xs text-slate-400">
                  已激活 <span className="text-emerald-400 font-bold">{skillStats.active}</span> / {skillStats.total}
                </span>
              </div>
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

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500">按住 Cmd/Ctrl + 滚轮缩放 · 拖拽平移</span>
            <button onClick={handleClose} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-700/50 transition-colors group">
              <TbX className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedSkill && selectedSkill !== 'core' && (
          <SkillDetailPanel selectedSkillId={selectedSkill} capabilitySnapshot={capabilitySnapshot} onClose={handleClosePanel} onToggleSkill={handleToggleSkill} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SkillTreeSettings;
