import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';

import type { VideoCodec, VideoContainer, VideoQualityPreset } from '../types';
import { QUALITY_PRESETS } from '../types';

interface VideoConfigProps {
  qualityPreset: VideoQualityPreset;
  onQualityChange: (value: VideoQualityPreset) => void;
  container: VideoContainer;
  onContainerChange: (value: VideoContainer) => void;
  videoCodec: VideoCodec;
  onVideoCodecChange: (value: VideoCodec) => void;
  crf: number;
  onCrfChange: (value: number) => void;
  audioBitrate: number;
  onAudioBitrateChange: (value: number) => void;
  disabled?: boolean;
}

export function VideoConfig({
  qualityPreset,
  onQualityChange,
  container,
  onContainerChange,
  videoCodec,
  onVideoCodecChange,
  crf,
  onCrfChange,
  audioBitrate,
  onAudioBitrateChange,
  disabled
}: VideoConfigProps): JSX.Element {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-4">
      {/* 清晰度 */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">清晰度</Label>
        <Select value={qualityPreset} onValueChange={onQualityChange} disabled={disabled}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(QUALITY_PRESETS).map(([key, info]) => (
              <SelectItem key={key} value={key}>
                {info.label} - {info.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* 格式设置 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">容器格式</Label>
          <Select value={container} onValueChange={onContainerChange} disabled={disabled}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="mkv">MKV</SelectItem>
              <SelectItem value="webm">WebM</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">视频编码</Label>
          <Select value={videoCodec} onValueChange={onVideoCodecChange} disabled={disabled}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="h264">H.264</SelectItem>
              <SelectItem value="h265">H.265</SelectItem>
              <SelectItem value="vp9">VP9</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* 高级选项 */}
      <div>
        <Button variant="ghost" size="sm" className="h-7 px-0 text-xs text-muted-foreground" onClick={() => setShowAdvanced(!showAdvanced)} disabled={disabled}>
          高级选项
          {showAdvanced ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
        </Button>
        {showAdvanced && (
          <div className="mt-3 space-y-4 rounded-md border p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">视频质量 (CRF)</Label>
                <span className="text-xs text-muted-foreground">{crf}</span>
              </div>
              <Slider min={0} max={51} step={1} value={[crf]} onValueChange={([v]) => onCrfChange(v)} disabled={disabled} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>无损</span>
                <span>高画质</span>
                <span>小体积</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">音频码率</Label>
                <span className="text-xs text-muted-foreground">{audioBitrate} kbps</span>
              </div>
              <Slider min={64} max={320} step={32} value={[audioBitrate]} onValueChange={([v]) => onAudioBitrateChange(v)} disabled={disabled} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
