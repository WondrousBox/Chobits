/**
 * SpeakSettings — 精灵语音合成设置面板
 *
 * 配置精灵说话的声音、语速、音高等参数
 */
import React, { useCallback, useEffect, useState } from 'react';
import { TbTrash, TbVolume } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface SpriteSpeakConfig {
  enabled: boolean;
  serviceType: string;
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
}

/** 支持的 Edge TTS 语音列表（常用子集） */
const EDGE_VOICES = [
  { value: 'zh-CN-XiaoxiaoNeural', label: '小晓 (女声)', lang: '中文' },
  { value: 'zh-CN-YunxiNeural', label: '云希 (男声)', lang: '中文' },
  { value: 'zh-CN-YunjianNeural', label: '云健 (男声)', lang: '中文' },
  { value: 'zh-CN-XiaoyiNeural', label: '小艺 (女声)', lang: '中文' },
  { value: 'zh-CN-YunyangNeural', label: '云扬 (男声)', lang: '中文' },
  { value: 'zh-CN-liaoning-XiaobeiNeural', label: '小贝 (女声-东北)', lang: '中文方言' },
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻 (女声)', lang: '中文(台湾)' },
  { value: 'zh-TW-YunJheNeural', label: '雲哲 (男声)', lang: '中文(台湾)' },
  { value: 'ja-JP-NanamiNeural', label: 'Nanami (女声)', lang: '日本語' },
  { value: 'ja-JP-KeitaNeural', label: 'Keita (男声)', lang: '日本語' },
  { value: 'en-US-JennyNeural', label: 'Jenny (Female)', lang: 'English' },
  { value: 'en-US-GuyNeural', label: 'Guy (Male)', lang: 'English' },
  { value: 'en-US-AriaNeural', label: 'Aria (Female)', lang: 'English' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia (Female)', lang: 'English (UK)' },
  { value: 'ko-KR-SunHiNeural', label: 'SunHi (여성)', lang: '한국어' },
  { value: 'ko-KR-InJoonNeural', label: 'InJoon (남성)', lang: '한국어' },
  { value: 'fr-FR-DeniseNeural', label: 'Denise (Femme)', lang: 'Français' },
  { value: 'de-DE-KatjaNeural', label: 'Katja (Weiblich)', lang: 'Deutsch' },
  { value: 'es-ES-ElviraNeural', label: 'Elvira (Mujer)', lang: 'Español' }
];

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/* ─── Hook ─── */
export function useSpeakSettings() {
  const [config, setConfig] = useState<SpriteSpeakConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ totalEntries: number; totalSizeBytes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await window.YUA.sprite.getSpeakConfig();
        if (!cancelled) setConfig(cfg);
        const stats = await window.YUA.sprite.getSpeakCacheStats();
        if (!cancelled) setCacheStats(stats);
      } catch (err) {
        console.error('加载语音配置失败:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = useCallback(async (partial: Partial<SpriteSpeakConfig>) => {
    try {
      const updated = await window.YUA.sprite.setSpeakConfig(partial);
      setConfig(updated);
    } catch (err) {
      console.error('更新语音配置失败:', err);
    }
  }, []);

  const handleTest = useCallback(async () => {
    if (testLoading) return;
    setTestLoading(true);
    try {
      await window.YUA.sprite.speak('你好，我是你的桌面精灵助手！');
    } catch (err) {
      console.error('测试语音失败:', err);
    } finally {
      setTestLoading(false);
    }
  }, [testLoading]);

  const handleClearCache = useCallback(async () => {
    try {
      await window.YUA.sprite.clearSpeakCache();
      const stats = await window.YUA.sprite.getSpeakCacheStats();
      setCacheStats(stats);
    } catch (err) {
      console.error('清空语音缓存失败:', err);
    }
  }, []);

  return { config, loading, testLoading, cacheStats, updateConfig, handleTest, handleClearCache };
}

export type SpeakSettingsState = ReturnType<typeof useSpeakSettings>;

/* ─── Left-panel item ─── */
export const SpeakItem: React.FC<{
  state: SpeakSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors',
        (state.config?.enabled ?? false) ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      )}
    >
      <TbVolume className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">语音合成</div>
      <div className="text-xs text-muted-foreground line-clamp-1">让精灵用声音说话，配置音色和语速。</div>
    </div>
    <div onClick={(e) => e.stopPropagation()}>
      <Switch checked={state.config?.enabled ?? false} onCheckedChange={(checked) => state.updateConfig({ enabled: checked })} disabled={state.loading} />
    </div>
  </div>
);

/* ─── Right-panel detail ─── */
export const SpeakDetailContent: React.FC<{ state: SpeakSettingsState }> = ({ state }) => {
  const { config, loading, testLoading, cacheStats, updateConfig, handleTest, handleClearCache } = state;

  if (loading || !config) {
    return <div className="text-sm text-muted-foreground">加载中...</div>;
  }

  if (!config.enabled) {
    return <p className="text-sm text-muted-foreground py-4">请先在左侧开启语音合成功能。</p>;
  }

  return (
    <div className="space-y-5">
      {/* 语音选择 */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">音色</label>
        <Select value={config.voiceName} onValueChange={(value) => updateConfig({ voiceName: value })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择音色" />
          </SelectTrigger>
          <SelectContent>
            {EDGE_VOICES.map((voice) => (
              <SelectItem key={voice.value} value={voice.value}>
                <span>{voice.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{voice.lang}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 语速 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">语速</label>
          <span className="text-xs text-muted-foreground">{config.rate > 0 ? `+${config.rate}%` : `${config.rate}%`}</span>
        </div>
        <Slider value={[config.rate]} min={-50} max={200} step={10} onValueChange={([value]) => updateConfig({ rate: value })} />
      </div>

      {/* 音高 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">音高</label>
          <span className="text-xs text-muted-foreground">{config.pitch > 0 ? `+${config.pitch}%` : `${config.pitch}%`}</span>
        </div>
        <Slider value={[config.pitch]} min={-50} max={50} step={5} onValueChange={([value]) => updateConfig({ pitch: value })} />
      </div>

      {/* 音量 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">音量</label>
          <span className="text-xs text-muted-foreground">{Math.round(config.volume * 100)}%</span>
        </div>
        <Slider value={[config.volume]} min={0} max={1} step={0.05} onValueChange={([value]) => updateConfig({ volume: value })} />
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={testLoading}>
          {testLoading ? '合成中...' : '🔊 试听'}
        </Button>

        {cacheStats && cacheStats.totalEntries > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearCache} className="text-muted-foreground">
            <TbTrash className="mr-1 h-4 w-4" />
            清空缓存 ({cacheStats.totalEntries} 条, {formatSize(cacheStats.totalSizeBytes)})
          </Button>
        )}
      </div>
    </div>
  );
};

/* ─── Default: self-contained detail (for SkillDetailPanel) ─── */
const SpeakSettings: React.FC = () => {
  const state = useSpeakSettings();
  return <SpeakDetailContent state={state} />;
};

export default SpeakSettings;
