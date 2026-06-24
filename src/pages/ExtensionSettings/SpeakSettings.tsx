/**
 * SpeakSettings — 精灵语音合成设置面板
 *
 * 配置精灵说话的声音、语速、音高等参数
 */
import type { ProviderPresetRecord } from '@packages/ai/types';
import type { SpriteSpeakAIProviderConfig, SpriteSpeakChatRealtimeSpeechConfig, SpriteSpeakConfig } from '@packages/sprite-core/speak/types';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbSettings, TbTrash, TbVolume } from 'react-icons/tb';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const MINIMAX_VOICES = [
  { value: 'female-shaonv', label: '少女音色', lang: '中文' },
  { value: 'male-qn-qingse', label: '青年男声', lang: '中文' },
  { value: 'female-yujie', label: '御姐音色', lang: '中文' },
  { value: 'audiobook_male_1', label: '有声书男声', lang: '中文' },
  { value: 'audiobook_female_1', label: '有声书女声', lang: '中文' },
  { value: 'presenter_male', label: '主持男声', lang: '中文' },
  { value: 'presenter_female', label: '主持女声', lang: '中文' }
];

const DEFAULT_AI_PROVIDER_CONFIG: SpriteSpeakAIProviderConfig = {
  providerId: 'minimax',
  model: 'speech-2.8-turbo',
  voiceId: 'female-shaonv',
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

const DEFAULT_CHAT_REALTIME_CONFIG: SpriteSpeakChatRealtimeSpeechConfig = {
  enabled: false,
  audioSetting: {
    format: 'pcm',
    sampleRate: 32000,
    channels: 1,
    sampleFormat: 's16le'
  },
  chunking: {
    minChars: 8,
    maxChars: 80,
    maxDelayMs: 350,
    flushOnPunctuation: true
  },
  playback: {
    startBufferMs: 160,
    maxBufferMs: 3000,
    fadeInMs: 12,
    fadeOutMs: 32
  },
  scopes: {
    mainChat: true,
    resourceChatSidebar: true
  },
  writeFinalCache: false
};

const mergeAiProviderConfig = (config?: SpriteSpeakAIProviderConfig): SpriteSpeakAIProviderConfig => ({
  ...DEFAULT_AI_PROVIDER_CONFIG,
  ...(config || {}),
  audioSetting: {
    ...DEFAULT_AI_PROVIDER_CONFIG.audioSetting,
    ...(config?.audioSetting || {})
  }
});

const mergeChatRealtimeConfig = (config?: SpriteSpeakChatRealtimeSpeechConfig): SpriteSpeakChatRealtimeSpeechConfig => ({
  ...DEFAULT_CHAT_REALTIME_CONFIG,
  ...(config || {}),
  audioSetting: {
    ...DEFAULT_CHAT_REALTIME_CONFIG.audioSetting,
    ...(config?.audioSetting || {}),
    format: 'pcm'
  },
  chunking: {
    ...DEFAULT_CHAT_REALTIME_CONFIG.chunking,
    ...(config?.chunking || {})
  },
  playback: {
    ...DEFAULT_CHAT_REALTIME_CONFIG.playback,
    ...(config?.playback || {})
  },
  scopes: {
    ...DEFAULT_CHAT_REALTIME_CONFIG.scopes,
    ...(config?.scopes || {})
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
      <div className="text-sm font-medium text-foreground">角色说话</div>
      <div className="text-xs text-muted-foreground line-clamp-1">选择 Edge 或服务商语音合成。</div>
    </div>
    <div onClick={(e) => e.stopPropagation()}>
      <Switch checked={state.config?.enabled ?? false} onCheckedChange={(checked) => state.updateConfig({ enabled: checked })} disabled={state.loading} />
    </div>
  </div>
);

/* ─── Right-panel detail ─── */
export const SpeakDetailContent: React.FC<{ state: SpeakSettingsState }> = ({ state }) => {
  const { config, loading, testLoading, cacheStats, updateConfig, handleTest, handleClearCache } = state;
  const aiProvider = useMemo(() => mergeAiProviderConfig(config?.aiProvider), [config?.aiProvider]);
  const realtimeSpeech = useMemo(() => mergeChatRealtimeConfig(config?.chatRealtimeSpeech), [config?.chatRealtimeSpeech]);
  const [presets, setPresets] = useState<ProviderPresetRecord[]>([]);

  useEffect(() => {
    if (!config || config.engine !== 'ai-provider' || !aiProvider.providerId) {
      setPresets([]);
      return;
    }
    let cancelled = false;
    void window.YUA.ai
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

  if (loading || !config) {
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

  const updateRealtimeSpeech = (patch: Partial<SpriteSpeakChatRealtimeSpeechConfig>) => {
    void updateConfig({
      chatRealtimeSpeech: mergeChatRealtimeConfig({
        ...realtimeSpeech,
        ...patch,
        audioSetting: patch.audioSetting ? { ...realtimeSpeech.audioSetting, ...patch.audioSetting, format: 'pcm' } : realtimeSpeech.audioSetting,
        chunking: patch.chunking ? { ...realtimeSpeech.chunking, ...patch.chunking } : realtimeSpeech.chunking,
        playback: patch.playback ? { ...realtimeSpeech.playback, ...patch.playback } : realtimeSpeech.playback,
        scopes: patch.scopes ? { ...realtimeSpeech.scopes, ...patch.scopes } : realtimeSpeech.scopes
      })
    });
  };

  const isAiProvider = config.engine === 'ai-provider';

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">合成引擎</label>
        <Tabs value={isAiProvider ? 'ai-provider' : 'edge'} onValueChange={(value) => updateConfig({ engine: value === 'ai-provider' ? 'ai-provider' : 'edge' })}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="edge">Edge</TabsTrigger>
            <TabsTrigger value="ai-provider">AI Provider</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!isAiProvider ? (
        <>
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">语速</label>
              <span className="text-xs text-muted-foreground">{config.rate > 0 ? `+${config.rate}%` : `${config.rate}%`}</span>
            </div>
            <Slider value={[config.rate]} min={-50} max={200} step={10} onValueChange={([value]) => updateConfig({ rate: value })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">音高</label>
              <span className="text-xs text-muted-foreground">{config.pitch > 0 ? `+${config.pitch}%` : `${config.pitch}%`}</span>
            </div>
            <Slider value={[config.pitch]} min={-50} max={50} step={5} onValueChange={([value]) => updateConfig({ pitch: value })} />
          </div>
        </>
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
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => window.YUA.window['window:open']('settings' as any, { category: 'ai', aiProviderId: aiProvider.providerId })}>
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
              <label className="text-sm font-medium text-foreground">常用音色</label>
              <Select value={aiProvider.voiceId} onValueChange={(value) => updateAiProvider({ voiceId: value, voice: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择音色" />
                </SelectTrigger>
                <SelectContent>
                  {MINIMAX_VOICES.map((voice) => (
                    <SelectItem key={voice.value} value={voice.value}>
                      <span>{voice.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{voice.lang}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">voiceId</label>
              <Input value={aiProvider.voiceId} onChange={(event) => updateAiProvider({ voiceId: event.target.value, voice: event.target.value })} placeholder="例如 female-shaonv" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">合成策略</label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                普通说话固定使用完整合成和本地缓存；AI 回复实时朗读按模型能力自动选择 WebSocket、HTTP 流式或完整合成。
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">语速</label>
              <span className="text-xs text-muted-foreground">{(aiProvider.speed ?? 1).toFixed(2)}x</span>
            </div>
            <Slider value={[aiProvider.speed ?? 1]} min={0.5} max={2} step={0.05} onValueChange={([value]) => updateAiProvider({ speed: value })} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">发声音量</label>
              <span className="text-xs text-muted-foreground">{Math.round((aiProvider.voiceVolume ?? 1) * 100)}%</span>
            </div>
            <Slider value={[aiProvider.voiceVolume ?? 1]} min={0.1} max={2} step={0.05} onValueChange={([value]) => updateAiProvider({ voiceVolume: value })} />
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">AI 回复实时朗读</div>
                <div className="text-xs text-muted-foreground">开启后仅朗读 assistant 正文 delta。</div>
              </div>
              <Switch checked={realtimeSpeech.enabled} onCheckedChange={(checked) => updateRealtimeSpeech({ enabled: checked })} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span>主聊天</span>
                <Switch
                  checked={realtimeSpeech.scopes.mainChat}
                  onCheckedChange={(checked) => updateRealtimeSpeech({ scopes: { mainChat: checked, resourceChatSidebar: realtimeSpeech.scopes.resourceChatSidebar } })}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span>资源侧栏</span>
                <Switch
                  checked={realtimeSpeech.scopes.resourceChatSidebar}
                  onCheckedChange={(checked) => updateRealtimeSpeech({ scopes: { mainChat: realtimeSpeech.scopes.mainChat, resourceChatSidebar: checked } })}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">PCM 采样率</label>
                <Select
                  value={String(realtimeSpeech.audioSetting.sampleRate)}
                  onValueChange={(value) => updateRealtimeSpeech({ audioSetting: { ...realtimeSpeech.audioSetting, sampleRate: Number(value) } })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="16000">16000 Hz</SelectItem>
                    <SelectItem value="24000">24000 Hz</SelectItem>
                    <SelectItem value="32000">32000 Hz</SelectItem>
                    <SelectItem value="44100">44100 Hz</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">首播缓冲</label>
                  <span className="text-xs text-muted-foreground">{realtimeSpeech.playback.startBufferMs}ms</span>
                </div>
                <Slider
                  value={[realtimeSpeech.playback.startBufferMs]}
                  min={0}
                  max={800}
                  step={20}
                  onValueChange={([value]) => updateRealtimeSpeech({ playback: { ...realtimeSpeech.playback, startBufferMs: value } })}
                />
              </div>
            </div>
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
