import { TbMusic } from 'react-icons/tb';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

import type { SubtitleEmbedMode } from '../types';

interface SubtitleConfigProps {
  embedMode: SubtitleEmbedMode;
  onEmbedModeChange: (value: SubtitleEmbedMode) => void;
  disabled?: boolean;
  showStyleHint?: boolean;
  /** 是否启用卡拉OK效果 */
  enableKaraoke?: boolean;
  /** 卡拉OK效果变更回调 */
  onKaraokeChange?: (enabled: boolean) => void;
  /** 是否有字级别时间戳数据（决定卡拉OK选项是否可用） */
  hasWordTimestamps?: boolean;
}

const EMBED_MODES = [
  { value: 'hardcode' as const, label: '硬字幕', description: '烧录到视频画面' },
  { value: 'softcode' as const, label: '软字幕', description: '可切换的内嵌字幕流' },
  { value: 'external' as const, label: '外挂字幕', description: '同时导出 .srt 文件' }
];

export function SubtitleConfig({ embedMode, onEmbedModeChange, disabled, showStyleHint, enableKaraoke, onKaraokeChange, hasWordTimestamps }: SubtitleConfigProps) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">字幕嵌入方式</Label>
      <Select value={embedMode} onValueChange={onEmbedModeChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EMBED_MODES.map((mode) => (
            <SelectItem key={mode.value} value={mode.value}>
              {mode.label}（{mode.description}）
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showStyleHint && embedMode === 'hardcode' && <p className="text-xs text-muted-foreground">硬字幕会使用左侧预览中的样式设置</p>}

      {/* 卡拉OK效果开关（仅硬字幕模式 + 有字级别时间戳数据时可用） */}
      {embedMode === 'hardcode' && (
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="flex items-center gap-2">
            <TbMusic className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="text-sm cursor-pointer" htmlFor="karaoke-toggle">
                卡拉OK打字效果
              </Label>
              <p className="text-xs text-muted-foreground">{hasWordTimestamps ? '逐字高亮显示，类似卡拉OK歌词效果' : '需要转录时生成的字级别时间戳数据'}</p>
            </div>
          </div>
          <Switch id="karaoke-toggle" checked={!!enableKaraoke} onCheckedChange={(checked) => onKaraokeChange?.(checked)} disabled={disabled || !hasWordTimestamps} />
        </div>
      )}
    </div>
  );
}
