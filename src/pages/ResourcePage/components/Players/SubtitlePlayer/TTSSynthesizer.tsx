import { AimSegments } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbMicrophone, TbPlayerStop, TbVolume } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import type { TTSSynthesisConfig } from './useTTSSynthesis';

// TTS语音配置
interface VoiceOption {
  value: string;
  label: string;
  language: string;
  gender: 'male' | 'female';
}

// 预设的Edge TTS语音列表
const voiceOptions: VoiceOption[] = [
  // 中文（普通话）
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓（女）', language: 'zh-CN', gender: 'female' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊（女）', language: 'zh-CN', gender: 'female' },
  { value: 'zh-CN-YunjianNeural', label: '云健（男）', language: 'zh-CN', gender: 'male' },
  { value: 'zh-CN-YunxiNeural', label: '云溪（男）', language: 'zh-CN', gender: 'male' },
  { value: 'zh-CN-YunyangNeural', label: '云扬（男）', language: 'zh-CN', gender: 'male' },
  { value: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北（辽宁话-女）', language: 'zh-CN', gender: 'female' },
  { value: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮（陕西话-女）', language: 'zh-CN', gender: 'female' },
  // 中文（台湾）
  { value: 'zh-TW-HsiaoChenNeural', label: '曉臻（女）', language: 'zh-TW', gender: 'female' },
  { value: 'zh-TW-HsiaoYuNeural', label: '曉雨（女）', language: 'zh-TW', gender: 'female' },
  { value: 'zh-TW-YunJheNeural', label: '雲哲（男）', language: 'zh-TW', gender: 'male' },
  // 中文（香港）
  { value: 'zh-HK-HiuGaaiNeural', label: '曉佳（女）', language: 'zh-HK', gender: 'female' },
  { value: 'zh-HK-HiuMaanNeural', label: '曉曼（女）', language: 'zh-HK', gender: 'female' },
  { value: 'zh-HK-WanLungNeural', label: '雲龍（男）', language: 'zh-HK', gender: 'male' },
  // 英语
  { value: 'en-US-AriaNeural', label: 'Aria (Female)', language: 'en-US', gender: 'female' },
  { value: 'en-US-GuyNeural', label: 'Guy (Male)', language: 'en-US', gender: 'male' },
  { value: 'en-US-JennyNeural', label: 'Jenny (Female)', language: 'en-US', gender: 'female' },
  { value: 'en-GB-SoniaNeural', label: 'Sonia (Female-UK)', language: 'en-GB', gender: 'female' },
  { value: 'en-GB-RyanNeural', label: 'Ryan (Male-UK)', language: 'en-GB', gender: 'male' },
  // 日语
  { value: 'ja-JP-NanamiNeural', label: '七海（女）', language: 'ja-JP', gender: 'female' },
  { value: 'ja-JP-KeitaNeural', label: '圭太（男）', language: 'ja-JP', gender: 'male' },
  // 韩语
  { value: 'ko-KR-SunHiNeural', label: '선희（女）', language: 'ko-KR', gender: 'female' },
  { value: 'ko-KR-InJoonNeural', label: '인준（男）', language: 'ko-KR', gender: 'male' },
  // 法语
  { value: 'fr-FR-DeniseNeural', label: 'Denise (Female)', language: 'fr-FR', gender: 'female' },
  { value: 'fr-FR-HenriNeural', label: 'Henri (Male)', language: 'fr-FR', gender: 'male' },
  // 德语
  { value: 'de-DE-KatjaNeural', label: 'Katja (Female)', language: 'de-DE', gender: 'female' },
  { value: 'de-DE-ConradNeural', label: 'Conrad (Male)', language: 'de-DE', gender: 'male' },
  // 西班牙语
  { value: 'es-ES-ElviraNeural', label: 'Elvira (Female)', language: 'es-ES', gender: 'female' },
  { value: 'es-ES-AlvaroNeural', label: 'Alvaro (Male)', language: 'es-ES', gender: 'male' },
  // 俄语
  { value: 'ru-RU-SvetlanaNeural', label: 'Светлана (Female)', language: 'ru-RU', gender: 'female' },
  { value: 'ru-RU-DmitryNeural', label: 'Дмитрий (Male)', language: 'ru-RU', gender: 'male' }
];

// 语言分组
const languageGroups: { label: string; languages: string[] }[] = [
  { label: '中文', languages: ['zh-CN', 'zh-TW', 'zh-HK'] },
  { label: 'English', languages: ['en-US', 'en-GB'] },
  { label: '日本語', languages: ['ja-JP'] },
  { label: '한국어', languages: ['ko-KR'] },
  { label: 'Français', languages: ['fr-FR'] },
  { label: 'Deutsch', languages: ['de-DE'] },
  { label: 'Español', languages: ['es-ES'] },
  { label: 'Русский', languages: ['ru-RU'] }
];

interface TTSSynthesizerProps {
  subtitleEntries: AimSegments[];
  resourceId: string;
  isSynthesizing?: boolean;
  synthesisProgress?: number;
  onStopSynthesis?: () => void;
  onSynthesisStart?: (requestId: string) => void;
  /**
   * 外部提供的合成入口（推荐）
   * - 由上层通过 useTTSSynthesis 等 Hook 执行真正的合成与事件监听
   * - 如果提供了该回调，本组件将不再直接调用 window.YUA.tts.synthesizeBatch
   */
  onSynthesize?: (config: TTSSynthesisConfig) => Promise<string>;
}

// localStorage 键名
const STORAGE_KEY = 'tts-synthesizer-preferences';

// 从 localStorage 读取保存的偏好设置
const loadPreferences = (): Record<string, any> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('读取TTS偏好设置失败:', error);
  }
  return null;
};

// 保存偏好设置到 localStorage
const savePreferences = (preferences: { selectedVoice?: string; rate?: number; pitch?: number; autoTrimSilence?: boolean }): void => {
  try {
    const existing = loadPreferences() || {};
    const updated = { ...existing, ...preferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('保存TTS偏好设置失败:', error);
  }
};

export const TTSSynthesizer: React.FC<TTSSynthesizerProps> = ({ subtitleEntries, resourceId, isSynthesizing = false, synthesisProgress = 0, onStopSynthesis, onSynthesisStart, onSynthesize }) => {
  // 从 localStorage 加载保存的偏好设置
  const savedPreferences = loadPreferences();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // TTS配置状态 (Edge TTS使用百分比: rate默认20表示+20%, pitch默认0表示0%)
  const [selectedVoice, setSelectedVoice] = useState<string>(savedPreferences?.selectedVoice || 'zh-CN-XiaoxiaoNeural');
  const [rate, setRate] = useState<number>(savedPreferences?.rate ?? 20);
  const [pitch, setPitch] = useState<number>(savedPreferences?.pitch ?? 0);
  const [autoTrimSilence, setAutoTrimSilence] = useState<boolean>(savedPreferences?.autoTrimSilence ?? true);

  // 按语言分组的语音选项
  const groupedVoices = useMemo(
    () =>
      languageGroups
        .map((group) => ({
          ...group,
          voices: voiceOptions.filter((v) => group.languages.includes(v.language))
        }))
        .filter((g) => g.voices.length > 0),
    []
  );

  // 当前选择的语音信息
  const selectedVoiceInfo = useMemo(() => {
    return voiceOptions.find((v) => v.value === selectedVoice);
  }, [selectedVoice]);

  // 保存偏好设置到 localStorage
  useEffect(() => {
    savePreferences({
      selectedVoice,
      rate,
      pitch,
      autoTrimSilence
    });
  }, [selectedVoice, rate, pitch, autoTrimSilence]);

  // 执行TTS合成
  const handleSynthesize = useCallback(async () => {
    if (subtitleEntries.length === 0) return;

    // 过滤掉已删除的片段
    const validSegments = subtitleEntries.filter((seg) => !seg.delete);
    if (validSegments.length === 0) return;

    setIsPopoverOpen(false);

    try {
      const config: TTSSynthesisConfig = {
        voiceName: selectedVoice,
        rate,
        pitch,
        autoTrimSilence
      };

      if (onSynthesize) {
        // 使用外部提供的合成逻辑（推荐）
        const requestId = await onSynthesize(config);
        if (onSynthesisStart && requestId) {
          onSynthesisStart(requestId);
        }
      } else {
        // 兼容旧逻辑：直接调用主进程 TTS
        const items = validSegments.map((seg, idx) => ({
          index: idx,
          text: seg.text
        }));

        const result = await window.YUA.tts.synthesizeBatch({
          resourceId,
          items,
          config: {
            voiceName: selectedVoice,
            rate,
            pitch
          },
          skipTrimSilence: !autoTrimSilence
        });

        if (onSynthesisStart && result.requestId) {
          onSynthesisStart(result.requestId);
        }
      }
    } catch (error) {
      console.error('TTS合成失败:', error);
    }
  }, [subtitleEntries, resourceId, selectedVoice, rate, pitch, autoTrimSilence, onSynthesize, onSynthesisStart]);

  // 如果正在合成，显示进度和停止按钮
  if (isSynthesizing) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 min-w-[120px]">
          <Progress value={synthesisProgress} className="h-2 flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{synthesisProgress}%</span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onStopSynthesis}>
                <TbPlayerStop className="h-4 w-4 text-destructive" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>停止合成</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2">
          <TbVolume className="h-4 w-4" />
          <span className="text-xs">语音</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80" sideOffset={5}>
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">TTS语音合成</h4>
            <p className="text-xs text-muted-foreground">为字幕生成语音音频</p>
          </div>

          {/* 语音选择 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">语音</Label>
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger>
                <SelectValue placeholder="选择语音">
                  {selectedVoiceInfo && (
                    <div className="flex items-center gap-2">
                      <TbMicrophone className="h-3 w-3" />
                      <span>{selectedVoiceInfo.label}</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <ScrollArea className="h-[200px]">
                  {groupedVoices.map((group) => (
                    <div key={group.label} className="mb-2">
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground sticky top-0 bg-popover">{group.label}</div>
                      {group.voices.map((voice) => (
                        <SelectItem key={voice.value} value={voice.value}>
                          <div className="flex items-center gap-2">
                            <span>{voice.label}</span>
                            <span className="text-xs text-muted-foreground">({voice.language})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </ScrollArea>
              </SelectContent>
            </Select>
          </div>

          {/* 语速调节 (Edge TTS使用百分比: -100到200，默认20) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">语速</Label>
              <span className="text-xs text-muted-foreground">
                {rate > 0 ? '+' : ''}
                {rate}%
              </span>
            </div>
            <Slider value={[rate]} onValueChange={([v]) => setRate(v)} min={-50} max={100} step={10} className="w-full" />
          </div>

          {/* 音高调节 (Edge TTS使用百分比: -100到200，默认0) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">音高</Label>
              <span className="text-xs text-muted-foreground">
                {pitch > 0 ? '+' : ''}
                {pitch}%
              </span>
            </div>
            <Slider value={[pitch]} onValueChange={([v]) => setPitch(v)} min={-50} max={50} step={10} className="w-full" />
          </div>

          {/* 自动去静音 */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">自动去静音</Label>
              <p className="text-xs text-muted-foreground">去除音频首尾的静音部分</p>
            </div>
            <Switch checked={autoTrimSilence} onCheckedChange={setAutoTrimSilence} />
          </div>

          {/* 开始合成按钮 */}
          <Button className="w-full" onClick={handleSynthesize} disabled={!selectedVoice || subtitleEntries.length === 0}>
            <TbVolume className="h-4 w-4 mr-2" />
            开始合成 ({subtitleEntries.filter((s) => !s.delete).length} 条)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
