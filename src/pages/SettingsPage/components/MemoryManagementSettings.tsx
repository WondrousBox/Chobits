import React, { useEffect, useState } from 'react';
import { TbBrain, TbBriefcase, TbLoader2, TbTopologyRing, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

import { SettingGroup, SettingItem } from './SettingComponents';

interface MemoryConfig {
  memoryEnabled: boolean;
  autoExtractionEnabled: boolean;
  autoRecallEnabled: boolean;
  extractionProviderId?: string;
  extractionModel?: string;
  minNewMessagesForExtraction: number;
  extractionCooldownMinutes: number;
  maxTokensPerExtraction: number;
}

interface ProjectTrackingConfig {
  autoDetectEnabled: boolean;
  autoLinkEnabled: boolean;
  candidateCooldownMinutes: number;
  enabled: boolean;
  promptInjectionEnabled: boolean;
  reminderSuggestionEnabled: boolean;
}

const MemoryManagementSettings: React.FC = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [config, setConfig] = useState<MemoryConfig | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectTrackingConfig | null>(null);

  useEffect(() => {
    window.YUA.memory
      .stats()
      .then((stats: { noteCount?: number; totalNotes?: number }) => {
        setNoteCount(stats?.noteCount ?? stats?.totalNotes ?? 0);
      })
      .catch(() => {});

    window.YUA.memory
      .getConfig()
      .then((res: { ok: boolean; config?: MemoryConfig }) => {
        if (res.ok && res.config) setConfig(res.config);
      })
      .catch(() => {});

    window.YUA.projectTracking
      .getConfig()
      .then((res: { ok: boolean; config?: ProjectTrackingConfig }) => {
        if (res.ok && res.config) setProjectConfig(res.config);
      })
      .catch(() => {});
  }, []);

  const updateConfig = async (patch: Partial<MemoryConfig>): Promise<void> => {
    try {
      const res = await window.YUA.memory.setConfig(patch as Record<string, unknown>);
      if (res.ok && res.config) setConfig(res.config);
    } catch (err) {
      console.error('更新记忆配置失败:', err);
    }
  };

  const updateProjectConfig = async (patch: Partial<ProjectTrackingConfig>): Promise<void> => {
    try {
      const res = await window.YUA.projectTracking.setConfig(patch);
      if (res.ok && res.config) setProjectConfig(res.config);
    } catch (err) {
      console.error('更新项目跟踪配置失败:', err);
    }
  };

  const handleClearAll = async (): Promise<void> => {
    setIsClearing(true);
    try {
      await window.YUA.memory.clearAll();
      setShowConfirmDialog(false);
      setNoteCount(0);
    } catch (error) {
      console.error('清除记忆失败:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <SettingGroup title="记忆">
        {config && (
          <>
            <SettingItem
              title="启用记忆系统"
              description="关闭后将不再自动提取和召回记忆"
              action={<Switch checked={config.memoryEnabled} onCheckedChange={(checked) => updateConfig({ memoryEnabled: checked })} />}
            />
            <SettingItem
              title="自动提取"
              description="对话结束后自动从对话内容中提取记忆"
              action={<Switch checked={config.autoExtractionEnabled} disabled={!config.memoryEnabled} onCheckedChange={(checked) => updateConfig({ autoExtractionEnabled: checked })} />}
            />
            <SettingItem
              title="自动召回"
              description="对话时自动检索并注入相关记忆到上下文"
              action={<Switch checked={config.autoRecallEnabled} disabled={!config.memoryEnabled} onCheckedChange={(checked) => updateConfig({ autoRecallEnabled: checked })} />}
            />
          </>
        )}
        {projectConfig && (
          <>
            <SettingItem
              title="项目跟踪"
              description="保存可手动创建的跨会话项目状态；自动识别默认关闭"
              action={<Switch checked={projectConfig.enabled} onCheckedChange={(checked) => updateProjectConfig({ enabled: checked })} />}
            />
            <SettingItem
              title="自动识别项目"
              description="开启后，对话结束时尝试识别项目候选并等待确认"
              action={<Switch checked={projectConfig.autoDetectEnabled} disabled={!projectConfig.enabled} onCheckedChange={(checked) => updateProjectConfig({ autoDetectEnabled: checked })} />}
            />
            <SettingItem
              title="项目上下文注入"
              description="开启后，相关对话前会注入活跃项目快照"
              action={
                <Switch checked={projectConfig.promptInjectionEnabled} disabled={!projectConfig.enabled} onCheckedChange={(checked) => updateProjectConfig({ promptInjectionEnabled: checked })} />
              }
            />
          </>
        )}
        <SettingItem
          title="记忆图谱"
          description={noteCount !== null ? `查看记忆主题图谱和知识网络（当前 ${noteCount} 条记忆）` : '查看记忆主题图谱和知识网络'}
          action={
            <Button size="sm" variant="outline" onClick={() => window.YUA.window['window:open']('memoryGraph' as any)}>
              <TbTopologyRing />
              打开图谱
            </Button>
          }
        />
        <SettingItem
          title="项目中心"
          description="查看跨会话项目、项目快照、时间线、里程碑和关联对话"
          action={
            <Button size="sm" variant="outline" onClick={() => window.YUA.window['window:open']('projectTracking' as any)}>
              <TbBriefcase />
              打开项目
            </Button>
          }
        />
        <SettingItem
          title="清除所有记忆"
          description={noteCount !== null ? `删除所有记忆笔记、主题和关联数据（当前 ${noteCount} 条记忆），此操作不可恢复` : '删除所有记忆笔记、主题和关联数据，此操作不可恢复'}
          action={
            <Button size="sm" variant="destructive" disabled={isClearing} onClick={() => setShowConfirmDialog(true)}>
              {isClearing ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  清除中...
                </>
              ) : (
                <>
                  <TbTrash />
                  清除记忆
                </>
              )}
            </Button>
          }
        />
      </SettingGroup>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TbBrain className="text-destructive" />
              确认清除所有记忆
            </DialogTitle>
            <DialogDescription>将删除所有记忆笔记文件、主题图谱、关键词索引及相关数据库记录，此操作不可恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleClearAll} disabled={isClearing}>
              {isClearing ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  清除中...
                </>
              ) : (
                '确认清除'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MemoryManagementSettings;
