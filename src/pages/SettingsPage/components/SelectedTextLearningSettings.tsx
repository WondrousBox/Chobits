import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbLoader, TbPlayerPlay, TbTestPipe } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ProviderPresetRecord, ProviderRecord } from '@packages/ai/types';
import type { SelectedTextLearningConfig, SelectedTextLearningConfigPatch, SelectedTextLearningRunResult, SelectedTextLearningStatus } from '@main/selected-text/types';

import { SettingGroup, SettingItem } from './SettingComponents';

const EMPTY_CONFIG: SelectedTextLearningConfig = {
  autoSpeak: true,
  dedupeWindowMs: 8000,
  enabled: false,
  holdMs: 1500,
  maxTextLength: 2000,
  providerId: 'openai',
  restoreClipboard: true,
  showOverlay: true
};

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function getProviderLabel(provider: ProviderRecord): string {
  return provider.schema?.locales?.['zh-CN']?.label || provider.schema?.locales?.zh?.label || provider.label || provider.id;
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
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [presets, setPresets] = useState<ProviderPresetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const selectedProvider = useMemo(() => providers.find((provider) => provider.id === config.providerId), [config.providerId, providers]);

  const refresh = useCallback(async () => {
    const [nextConfig, nextStatus, nextProviders] = await Promise.all([
      window.YUA.selectedTextLearning.getConfig(),
      window.YUA.selectedTextLearning.getStatus(),
      window.YUA.ai.getProviders().catch(() => [])
    ]);
    setConfig(nextConfig);
    setStatus(nextStatus);
    setProviders(nextProviders || []);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refresh();
      } catch (error) {
        if (mounted) toast.error(error instanceof Error ? error.message : '加载选中文本学习设置失败');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await window.YUA.ai.listPresets(config.providerId);
        if (mounted) setPresets(list || []);
      } catch {
        if (mounted) setPresets([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [config.providerId]);

  const savePatch = async (patch: SelectedTextLearningConfigPatch, options: { silent?: boolean } = {}): Promise<void> => {
    const optimistic = { ...config, ...patch };
    setConfig(optimistic);
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
      if (result.ok) toast.success('已开始解析选中文本');
      else toast.warning(describeRunResult(result));
      const nextStatus = await window.YUA.selectedTextLearning.getStatus();
      setStatus(nextStatus);
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
        <SettingItem title="自动朗读原文" description="检测到英文后，先让精灵读出原文。" action={<Switch checked={config.autoSpeak} onCheckedChange={(checked) => savePatch({ autoSpeak: checked }, { silent: true })} />} />
        <SettingItem title="打开解释浮层" description="AI 生成结果后，同时打开 chatOverlay 展示完整解释。" action={<Switch checked={config.showOverlay} onCheckedChange={(checked) => savePatch({ showOverlay: checked }, { silent: true })} />} />
        <SettingItem title="恢复剪贴板" description="读取选区时会短暂写入剪贴板，开启后尽量恢复原内容。" action={<Switch checked={config.restoreClipboard} onCheckedChange={(checked) => savePatch({ restoreClipboard: checked }, { silent: true })} />} />
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

      <SettingGroup title="AI">
        <SettingItem
          title="提供商"
          description={selectedProvider?.configured ? '将使用已配置的预设发起解释请求。' : '该提供商可能还没有可用预设。'}
          action={
            <Select value={config.providerId} onValueChange={(providerId) => savePatch({ preferredPresetId: undefined, providerId }, { silent: true })}>
              <SelectTrigger className="w-44 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {getProviderLabel(provider)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingItem
          title="首选预设"
          description="留空时会自动选择当前提供商可用预设。"
          action={
            <Select value={config.preferredPresetId || '__auto__'} onValueChange={(preferredPresetId) => savePatch({ preferredPresetId: preferredPresetId === '__auto__' ? undefined : preferredPresetId }, { silent: true })}>
              <SelectTrigger className="w-44 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">自动选择</SelectItem>
                {presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingItem
          title="指定模型"
          description="可选；留空时使用提供商默认聊天模型。"
          action={
            <Input
              className="w-44 h-8 text-sm"
              placeholder="默认模型"
              value={config.modelId || ''}
              onChange={(event) => setConfig((prev) => ({ ...prev, modelId: event.target.value }))}
              onBlur={(event) => savePatch({ modelId: event.target.value.trim() || undefined }, { silent: true })}
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
