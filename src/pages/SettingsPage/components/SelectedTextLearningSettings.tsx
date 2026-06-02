import type { SelectedTextLearningConfig, SelectedTextLearningConfigPatch, SelectedTextLearningRunResult, SelectedTextLearningStatus } from '@main/selected-text/types';
import React, { useCallback, useEffect, useState } from 'react';
import { TbLoader, TbPlayerPlay, TbTestPipe } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

import { SettingGroup, SettingItem } from './SettingComponents';

const EMPTY_CONFIG: SelectedTextLearningConfig = {
  autoSpeak: true,
  dedupeWindowMs: 8000,
  enabled: true,
  holdMs: 1500,
  maxTextLength: 2000,
  restoreClipboard: true,
  showOverlay: true
};

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function describeRunResult(result: SelectedTextLearningRunResult): string {
  if (result.error) return result.error;
  if (!result.read?.text) return '没有读到选中文本';
  if (!result.detection?.ok) return `已读取，但未判定为英文：${result.detection?.reason || 'unknown'}`;
  return `读取成功：${result.read.text.slice(0, 80)}`;
}

export default function SelectedTextLearningSettings(): JSX.Element {
  const [config, setConfig] = useState<SelectedTextLearningConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<SelectedTextLearningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const refresh = useCallback(async () => {
    const [nextConfig, nextStatus] = await Promise.all([window.YUA.selectedTextLearning.getConfig(), window.YUA.selectedTextLearning.getStatus()]);
    setConfig(nextConfig);
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refresh();
      } catch (error) {
        if (mounted) toast.error(error instanceof Error ? error.message : '加载划词学习设置失败');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  const savePatch = async (patch: SelectedTextLearningConfigPatch, options: { silent?: boolean } = {}): Promise<void> => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setSaving(true);
    try {
      const result = await window.YUA.selectedTextLearning.setConfig(patch);
      setConfig(result.config);
      setStatus(result.status);
      if (!options.silent) toast.success('已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
      await refresh().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const testSelection = async (): Promise<void> => {
    setTesting(true);
    try {
      const result = await window.YUA.selectedTextLearning.testReadSelection();
      if (result.detection?.ok) toast.success(describeRunResult(result));
      else toast.warning(describeRunResult(result));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '测试读取失败');
    } finally {
      setTesting(false);
    }
  };

  const triggerNow = async (): Promise<void> => {
    setTriggering(true);
    try {
      const result = await window.YUA.selectedTextLearning.triggerNow();
      if (result.ok) toast.success('已打开解释浮窗');
      else toast.warning(describeRunResult(result));
      setStatus(await window.YUA.selectedTextLearning.getStatus());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '手动触发失败');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center text-muted-foreground">
        <TbLoader className="animate-spin" />
        <span className="ml-2 text-sm">加载中...</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <SettingGroup title="触发">
        <SettingItem
          title="长按 Ctrl 识别选中文本"
          description={status?.available ? '长按 Ctrl 到设定时长后，自动保护式复制当前选区。' : '当前环境没有可用的全局输入监听，功能无法自动触发。'}
          action={<Switch checked={config.enabled} disabled={!status?.available || saving} onCheckedChange={(checked) => savePatch({ enabled: checked }, { silent: true })} />}
        />
        <SettingItem
          title="长按时长"
          description="建议 1200-1800ms，太短容易误触。"
          action={
            <Input
              className="w-28 h-8 text-sm"
              min={500}
              max={10000}
              step={100}
              type="number"
              value={config.holdMs}
              onChange={(event) => setConfig((prev) => ({ ...prev, holdMs: clampNumber(event.target.value, prev.holdMs, 500, 10000) }))}
              onBlur={(event) => savePatch({ holdMs: clampNumber(event.target.value, config.holdMs, 500, 10000) }, { silent: true })}
            />
          }
        />
        <SettingItem
          title="短时间去重"
          description="同一段选中文本在窗口期内不会重复触发。"
          action={
            <Input
              className="w-28 h-8 text-sm"
              min={1000}
              max={60000}
              step={1000}
              type="number"
              value={config.dedupeWindowMs}
              onChange={(event) => setConfig((prev) => ({ ...prev, dedupeWindowMs: clampNumber(event.target.value, prev.dedupeWindowMs, 1000, 60000) }))}
              onBlur={(event) => savePatch({ dedupeWindowMs: clampNumber(event.target.value, config.dedupeWindowMs, 1000, 60000) }, { silent: true })}
            />
          }
        />
      </SettingGroup>

      <SettingGroup title="动作">
        <SettingItem
          title="自动朗读原文"
          description="检测到英文后，先让精灵读出原文。"
          action={<Switch checked={config.autoSpeak} onCheckedChange={(checked) => savePatch({ autoSpeak: checked }, { silent: true })} />}
        />
        <SettingItem
          title="打开解释浮层"
          description="使用独立浮窗流式展示解释，并复用当前聊天模型配置。"
          action={<Switch checked={config.showOverlay} onCheckedChange={(checked) => savePatch({ showOverlay: checked }, { silent: true })} />}
        />
        <SettingItem
          title="恢复剪贴板"
          description="读取选区时会短暂写入剪贴板，开启后尽量恢复原内容。"
          action={<Switch checked={config.restoreClipboard} onCheckedChange={(checked) => savePatch({ restoreClipboard: checked }, { silent: true })} />}
        />
        <SettingItem
          title="最大文本长度"
          description="超过长度的选区会被跳过，避免误读整页内容。"
          action={
            <Input
              className="w-28 h-8 text-sm"
              min={20}
              max={10000}
              step={100}
              type="number"
              value={config.maxTextLength}
              onChange={(event) => setConfig((prev) => ({ ...prev, maxTextLength: clampNumber(event.target.value, prev.maxTextLength, 20, 10000) }))}
              onBlur={(event) => savePatch({ maxTextLength: clampNumber(event.target.value, config.maxTextLength, 20, 10000) }, { silent: true })}
            />
          }
        />
      </SettingGroup>

      <div className="flex justify-end gap-2 px-2">
        <Button size="sm" variant="outline" onClick={testSelection} disabled={testing || triggering}>
          {testing ? <TbLoader className="animate-spin" /> : <TbTestPipe />}
          测试读取
        </Button>
        <Button size="sm" onClick={triggerNow} disabled={testing || triggering}>
          {triggering ? <TbLoader className="animate-spin" /> : <TbPlayerPlay />}
          立即解析
        </Button>
      </div>
    </div>
  );
}
