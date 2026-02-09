import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { SubtitleEmbedMode } from '../types';

interface SubtitleConfigProps {
  embedMode: SubtitleEmbedMode;
  onEmbedModeChange: (value: SubtitleEmbedMode) => void;
  disabled?: boolean;
  showStyleHint?: boolean;
}

const EMBED_MODES = [
  { value: 'hardcode' as const, label: '硬字幕', description: '烧录到视频画面' },
  { value: 'softcode' as const, label: '软字幕', description: '可切换的内嵌字幕流' },
  { value: 'external' as const, label: '外挂字幕', description: '同时导出 .srt 文件' }
];

export function SubtitleConfig({ embedMode, onEmbedModeChange, disabled, showStyleHint }: SubtitleConfigProps) {
  return (
    <div className="space-y-2">
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
    </div>
  );
}
