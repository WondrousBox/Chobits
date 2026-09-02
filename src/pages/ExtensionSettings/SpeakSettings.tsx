/**
 * SpeakSettings — 精灵语音合成设置面板
 *
 * 配置精灵说话的声音和播放音量
 */
import { getProviderVoiceCatalog } from '@packages/ai/providers/voice-catalogs';
import type { ProviderPresetRecord } from '@packages/ai/types';
import type { SpriteSpeakAIProviderConfig, SpriteSpeakConfig } from '@packages/sprite-core/speak/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbSettings, TbTrash, TbVolume } from 'react-icons/tb';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import ProviderVoiceSelect from '@/components/common/ProviderVoiceSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

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

const DEFAULT_AI_PROVIDER_CONFIG: SpriteSpeakAIProviderConfig = {
  providerId: 'minimax',
  model: 'speech-2.8-turbo',
  voiceId: 'female-shaonv',
  speechLanguage: 'auto',
  audioSetting: {
    format: 'mp3',
    sampleRate: 32000,
    bitrate: 128000,
    channels: 1
  },
  speed: 1,
  pitch: 0,
  voiceVolume: 1
};

const mergeAiProviderConfig = (config?: SpriteSpeakAIProviderConfig): SpriteSpeakAIProviderConfig => ({
  ...DEFAULT_AI_PROVIDER_CONFIG,
  ...(config || {}),
  audioSetting: {
    ...DEFAULT_AI_PROVIDER_CONFIG.audioSetting,
    ...(config?.audioSetting || {})
  }
});

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/* ─── Hook ─── */
export function useSpeakSettings() {
  const [config, setConfig] = useState<SpriteSpeakConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ totalEntries: number; totalSizeBytes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const speakConfig = await window.chobits.sprite.getSpeakConfig();
        if (!cancelled) setConfig(speakConfig);
        const stats = await window.chobits.sprite.getSpeakCacheStats();
        if (!cancelled) setCacheStats(stats);
      } catch (err) {
        console.error('加载语音配置失败:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = useCallback(async (partial: Partial<SpriteSpeakConfig>) => {
    try {
      const updated = await window.chobits.sprite.setSpeakConfig(partial);
      setConfig(updated);
    } catch (err) {
      console.error('更新语音配置失败:', err);
    }
  }, []);

  const handleTest = useCallback(async () => {
    if (testLoading) return;
    setTestLoading(true);
    try {
      await window.chobits.sprite.speak('你好，我是你的桌面精灵助手！');
    } catch (err) {
      console.error('测试语音失败:', err);
    } finally {
      setTestLoading(false);
    }
  }, [testLoading]);

  const handleClearCache = useCallback(async () => {
    try {
      await window.chobits.sprite.clearSpeakCache();
      const stats = await window.chobits.sprite.getSpeakCacheStats();
      setCacheStats(stats);
    } catch (err) {
      console.error('清空语音缓存失败:', err);
    }
  }, []);

  return { config, isLoading, testLoading, cacheStats, updateConfig, handleTest, handleClearCache };
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
      <div className="text-sm font-medium text-foreground">角色说话</div>
      <div className="text-xs text-muted-foreground line-clamp-1">选择 Edge 或服务商语音合成。</div>
    </div>
    <div onClick={(e) => e.stopPropagation()}>
      <Switch checked={state.config?.enabled ?? false} onCheckedChange={(checked) => state.updateConfig({ enabled: checked })} disabled={state.isLoading} />
    </div>
  </div>
);

/* ─── Right-panel detail ─── */
export const SpeakDetailContent: React.FC<{ state: SpeakSettingsState }> = ({ state }) => {
  const { config, isLoading, testLoading, cacheStats, updateConfig, handleTest, handleClearCache } = state;
  const aiProvider = useMemo(() => mergeAiProviderConfig(config?.aiProvider), [config?.aiProvider]);
  const voiceCatalog = useMemo(() => getProviderVoiceCatalog(aiProvider.providerId), [aiProvider.providerId]);
  const [presets, setPresets] = useState<ProviderPresetRecord[]>([]);

  useEffect(() => {
    if (!config || config.engine !== 'ai-provider' || !aiProvider.providerId) {
      setPresets([]);
      return;
    }
    let cancelled = false;
    void window.chobits.ai
      .listPresets(aiProvider.providerId)
      .then((rows) => {
        if (!cancelled) setPresets(rows || []);
      })
      .catch(() => {
        if (!cancelled) setPresets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [aiProvider.providerId, config]);

  if (isLoading || !config) {
    return <div className="text-sm text-muted-foreground">加载中...</div>;
  }

  if (!config.enabled) {
    return <p className="text-sm text-muted-foreground py-4">请先在左侧开启角色说话。</p>;
  }

  const updateAiProvider = (patch: Partial<SpriteSpeakAIProviderConfig>) => {
    void updateConfig({
      aiProvider: mergeAiProviderConfig({
        ...aiProvider,
        ...patch,
        audioSetting: patch.audioSetting ? { ...aiProvider.audioSetting, ...patch.audioSetting } : aiProvider.audioSetting
      })
    });
  };

  const isAiProvider = config.engine === 'ai-provider';

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">说话方式</label>
        <Select value={isAiProvider ? 'ai-provider' : 'edge'} onValueChange={(value) => updateConfig({ engine: value === 'ai-provider' ? 'ai-provider' : 'edge' })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择说话方式" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="edge">Edge TTS</SelectItem>
            <SelectItem value="ai-provider">服务商语音</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isAiProvider ? (
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
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">服务商与模型</label>
            <div className="flex items-center gap-2">
              <ProviderModelSelect
                providerId={aiProvider.providerId}
                presetId={aiProvider.providerPresetId}
                modelId={aiProvider.model}
                modelTypes={['tts']}
                providerFilter={(provider) => provider.capabilities?.speechSynthesis === true}
                placeholder="选择语音合成模型"
                className="w-full rounded-md"
                onChange={(providerId, model) =>
                  updateAiProvider({
                    providerId,
                    model,
                    providerPresetId: providerId === aiProvider.providerId ? aiProvider.providerPresetId : undefined
                  })
                }
              />
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => window.chobits.window['window:open']('settings' as any, { category: 'ai', aiProviderId: aiProvider.providerId })}>
                <TbSettings />
                配置
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">服务商预设</label>
            <Select value={aiProvider.providerPresetId || '__auto__'} onValueChange={(value) => updateAiProvider({ providerPresetId: value === '__auto__' ? undefined : value })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="自动选择可用预设" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">自动选择可用预设</SelectItem>
                {presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name || preset.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">音色</label>
              <ProviderVoiceSelect value={aiProvider.voiceId} groups={voiceCatalog?.groups || []} onChange={(value) => updateAiProvider({ voiceId: value, voice: value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">音频格式</label>
              <Select value={aiProvider.audioSetting?.format || 'mp3'} onValueChange={(value) => updateAiProvider({ audioSetting: { format: value } })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp3">MP3</SelectItem>
                  <SelectItem value="wav">WAV</SelectItem>
                  <SelectItem value="flac">FLAC</SelectItem>
                  <SelectItem value="pcm">PCM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">朗读语言</label>
            <Select value={aiProvider.speechLanguage || 'auto'} onValueChange={(value) => updateAiProvider({ speechLanguage: value as SpriteSpeakAIProviderConfig['speechLanguage'] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动（跟随角色语言）</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="ja">日文</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">自动时跟随角色定义的语言；文本语言与朗读语言不一致时先用 LLM 翻译再朗读，气泡仍显示原文；对话实时朗读同样生效。</p>
          </div>
        </div>
      )}

      {/* 音量 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">播放音量</label>
          <span className="text-xs text-muted-foreground">{Math.round(config.volume * 100)}%</span>
        </div>
        <Slider value={[config.volume]} min={0} max={1} step={0.05} onValueChange={([value]) => updateConfig({ volume: value })} />
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={testLoading}>
          <TbVolume />
          {testLoading ? '合成中...' : '试听'}
        </Button>

        {cacheStats && cacheStats.totalEntries > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearCache} className="text-muted-foreground">
            <TbTrash />
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
