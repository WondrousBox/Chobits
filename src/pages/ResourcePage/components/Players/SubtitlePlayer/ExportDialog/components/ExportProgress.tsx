import { Check, Loader2, X } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { ExportProgress } from '../types';

interface ExportProgressProps {
  progress: ExportProgress | null;
}

export function ExportProgressView({ progress }: ExportProgressProps): JSX.Element | null {
  if (!progress) return null;

  const getStatusIcon = (): JSX.Element => {
    switch (progress.stage) {
      case 'done':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'error':
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        <span className="text-sm font-medium">{progress.stageLabel}</span>
      </div>

      {progress.stage !== 'error' && progress.stage !== 'done' && <Progress value={progress.totalProgress} className="h-2" />}

      {progress.exportedFiles && progress.exportedFiles.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">已导出文件</Label>
          <ScrollArea className="h-24 rounded-md border">
            <div className="p-2 space-y-1">
              {progress.exportedFiles.map((file, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Check className="h-3 w-3 shrink-0 text-green-500" />
                  <span className="truncate flex-1" title={file.filePath}>
                    {file.fileName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{file.type === 'subtitle' ? '字幕' : file.type === 'tts-audio' ? '语音' : '视频'}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {progress.error && (
        <div className="rounded-md bg-red-50 p-3 dark:bg-red-950/30">
          <pre className="whitespace-pre-wrap break-all text-xs text-red-600 dark:text-red-400">{progress.error}</pre>
        </div>
      )}

      {progress.stage === 'done' && (
        <div className="space-y-1">
          <div className="text-sm text-green-600 font-medium">导出完成！</div>
          {progress.exportDir && (
            <div className="text-xs text-muted-foreground" title={progress.exportDir}>
              导出目录: {progress.exportDir}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
