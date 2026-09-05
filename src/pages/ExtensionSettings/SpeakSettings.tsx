/**
 * SpeakSettings — 精灵语音合成设置面板
 *
 * 配置精灵说话的声音和播放音量
 */
import { getProviderVoiceCatalog } from '@packages/ai/providers/voice-catalogs';
import type { ProviderPresetRecord } from '@packages/ai/types';
import type { SpriteSpeakAIProviderConfig } from '@packages/sprite-core/speak/types';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbSettings, TbTrash, TbVolume } from 'react-icons/tb';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import ProviderVoiceSelect from '@/components/common/ProviderVoiceSelect';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import type { SpeakSettingsState } from './useSpeakSettings';
import { useSpeakSettings } from './useSpeakSettings';

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
  providerId: 'gpt-sovits',
  model: 'chii-tts',
  voiceId: 'chii',
  speechLanguage: 'auto',
  audioSetting: {
    format: 'wav',
    sampleRate: 32000,
    bitrate: 128000,
    channels: 1
  },
  speed: 1,
  pitch: 0,
  voiceVolume: 1
};

const mergeAIProviderConfig = (config?: SpriteSpeakAIProviderConfig): SpriteSpeakAIProviderConfig => ({
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

/* ─── Left-panel item ─── */
export const SpeakItem: React.FC<{
  state: SpeakSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => {
  const { t } = useTranslation('speech');
  return (
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
        <div className="text-sm font-medium text-foreground">{t('speak.item.title')}</div>
        <div className="text-xs text-muted-foreground line-clamp-1">{t('speak.item.description')}</div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Switch checked={state.config?.enabled ?? false} onCheckedChange={(checked) => state.updateConfig({ enabled: checked })} disabled={state.isLoading} />
      </div>
    </div>
  );
};

/* ─── Right-panel detail ─── */
export const SpeakDetailContent: React.FC<{ state: SpeakSettingsState }> = ({ state }) => {
  const { t } = useTranslation('speech');
  const { config, isLoading, isTesting, cacheStats, updateConfig, handleTest, handleClearCache } = state;
  const aiProvider = useMemo(() => mergeAIProviderConfig(config?.aiProvider), [config?.aiProvider]);
  const voiceCatalog = useMemo(() => getProviderVoiceCatalog(aiProvider.providerId), [aiProvider.providerId]);
  const [presets, setPresets] = useState<ProviderPresetRecord[]>([]);

  useEffect(() => {
    if (!config || config.engine !== 'ai-provider' || !aiProvider.providerId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 配置不适用时清空预设列表,有意为之
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
    return <div className="text-sm text-muted-foreground">{t('speak.loading')}</div>;
  }

  if (!config.enabled) {
    return <p className="text-sm text-muted-foreground py-4">{t('speak.enableHint')}</p>;
  }

  const updateAiProvider = (patch: Partial<SpriteSpeakAIProviderConfig>) => {
    void updateConfig({
      aiProvider: mergeAIProviderConfig({
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
        <label className="text-sm font-medium text-foreground">{t('speak.engine.label')}</label>
        <Select value={isAiProvider ? 'ai-provider' : 'edge'} onValueChange={(value) => updateConfig({ engine: value === 'ai-provider' ? 'ai-provider' : 'edge' })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t('speak.engine.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="edge">Edge TTS</SelectItem>
            <SelectItem value="ai-provider">{t('speak.engine.aiProvider')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isAiProvider ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">{t('speak.voice.label')}</label>
          <Select value={config.voiceName} onValueChange={(value) => updateConfig({ voiceName: value })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('speak.voice.placeholder')} />
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
            <label className="text-sm font-medium text-foreground">{t('speak.providerModel.label')}</label>
            <div className="flex items-center gap-2">
              <ProviderModelSelect
                providerId={aiProvider.providerId}
                presetId={aiProvider.providerPresetId}
                modelId={aiProvider.model}
                modelTypes={['tts']}
                providerFilter={(provider) => provider.capabilities?.speechSynthesis === true}
                placeholder={t('speak.providerModel.placeholder')}
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
                {t('speak.providerModel.configure')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('speak.preset.label')}</label>
            <Select value={aiProvider.providerPresetId || '__auto__'} onValueChange={(value) => updateAiProvider({ providerPresetId: value === '__auto__' ? undefined : value })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('speak.preset.auto')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">{t('speak.preset.auto')}</SelectItem>
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
              <label className="text-sm font-medium text-foreground">{t('speak.voice.label')}</label>
              <ProviderVoiceSelect value={aiProvider.voiceId} groups={voiceCatalog?.groups || []} onChange={(value) => updateAiProvider({ voiceId: value, voice: value })} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('speak.audioFormat.label')}</label>
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
            <label className="text-sm font-medium text-foreground">{t('speak.speechLanguage.label')}</label>
            <Select value={aiProvider.speechLanguage || 'auto'} onValueChange={(value) => updateAiProvider({ speechLanguage: value as SpriteSpeakAIProviderConfig['speechLanguage'] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t('speak.speechLanguage.auto')}</SelectItem>
                <SelectItem value="zh">{t('speak.speechLanguage.zh')}</SelectItem>
                <SelectItem value="ja">{t('speak.speechLanguage.ja')}</SelectItem>
                <SelectItem value="en">{t('speak.speechLanguage.en')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('speak.speechLanguage.description')}</p>
          </div>
        </div>
      )}

      {/* 音量 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">{t('speak.volume.label')}</label>
          <span className="text-xs text-muted-foreground">{Math.round(config.volume * 100)}%</span>
        </div>
        <Slider value={[config.volume]} min={0} max={1} step={0.05} onValueChange={([value]) => updateConfig({ volume: value })} />
      </div>

      {/* 操作按钮 */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
          <TbVolume />
          {isTesting ? t('speak.test.testing') : t('speak.test.idle')}
        </Button>

        {cacheStats && cacheStats.totalEntries > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClearCache} className="text-muted-foreground">
            <TbTrash />
            {t('speak.clearCache', { count: cacheStats.totalEntries, size: formatSize(cacheStats.totalSizeBytes) })}
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
