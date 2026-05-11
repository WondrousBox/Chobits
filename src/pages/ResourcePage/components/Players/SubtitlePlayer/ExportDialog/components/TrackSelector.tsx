import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { ExportTrack } from '../types';

interface TrackSelectorProps {
  tracks: ExportTrack[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}

function TrackIcon({ type }: { type: ExportTrack['type'] }): JSX.Element {
  const icons = {
    video: '🎬',
    audio: '🎵',
    subtitle: '📝',
    'tts-audio': '🔊',
    annotation: '📌'
  };
  return <span className="text-base">{icons[type] || '📄'}</span>;
}

export function TrackSelector({ tracks, selectedIds, onToggle, disabled }: TrackSelectorProps): JSX.Element {
  const getTypeLabel = (type: ExportTrack['type']): string => {
    const labels = {
      video: '视频',
      audio: '音频',
      subtitle: '字幕',
      'tts-audio': '语音',
      annotation: '标注'
    };
    return labels[type];
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">选择轨道</Label>
      <ScrollArea className="h-48 rounded-md border">
        <div className="p-2 space-y-1">
          {tracks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无可导出的轨道</div>
          ) : (
            tracks.map((track) => (
              <label key={track.id} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors">
                <Checkbox checked={selectedIds.includes(track.id)} onCheckedChange={() => onToggle(track.id)} disabled={disabled} />
                <TrackIcon type={track.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{track.label}</div>
                  {track.description && <div className="text-xs text-muted-foreground truncate">{track.description}</div>}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{getTypeLabel(track.type)}</span>
              </label>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
