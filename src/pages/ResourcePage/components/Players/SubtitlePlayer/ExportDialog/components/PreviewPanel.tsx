import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';

import { SubtitleStyleEditor } from '../SubtitleStyleEditor';
import type { SubtitleStyleConfig } from '../types';
import { VideoPreview } from '../VideoPreview';

interface PreviewPanelProps {
  videoPath?: string;
  subtitleSegments: Array<{ st: string; et: string; text: string }>;
  subtitleStyle: SubtitleStyleConfig;
  onStyleChange: (style: SubtitleStyleConfig) => void;
  showStyleEditor: boolean;
  disabled?: boolean;
}

export function PreviewPanel({ videoPath, subtitleSegments, subtitleStyle, onStyleChange, showStyleEditor, disabled }: PreviewPanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* 视频预览 */}
      <div className="space-y-2 flex-shrink-0">
        <Label className="text-sm font-medium">预览</Label>
        <VideoPreview videoPath={videoPath} subtitleSegments={subtitleSegments} subtitleStyle={subtitleStyle} />
      </div>

      {/* 字幕样式设置 */}
      {showStyleEditor && (
        <div className="flex-1 min-h-0 flex flex-col">
          <Label className="text-sm font-medium mb-2">字幕样式</Label>
          <ScrollArea className="flex-1 pr-4">
            <SubtitleStyleEditor style={subtitleStyle} onChange={onStyleChange} disabled={disabled} />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
