import { AimSegments, tools, utils } from '@aim-packages/subtitle';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import type { TTSSynthesisItem } from '../useTTSSynthesis';
import { ExportProgressView } from './components/ExportProgress';
import { PreviewPanel } from './components/PreviewPanel';
import { SubtitleConfig } from './components/SubtitleConfig';
import { TrackSelector } from './components/TrackSelector';
import { VideoConfig } from './components/VideoConfig';
import type {
  ExportConfig,
  ExportProgress,
  ExportRequest,
  ExportSubtitleTrack,
  ExportTrack,
  ExportTTSAudioTrack,
  ExportTTSSegment,
  SubtitleEmbedMode,
  SubtitleStyleConfig,
  VideoCodec,
  VideoContainer,
  VideoQualityPreset
} from './types';
import { DEFAULT_EXPORT_CONFIG, DEFAULT_SUBTITLE_STYLE } from './types';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoPath?: string;
  audioPath?: string;
  duration: number;
  resourceId: string;
  workspaceId?: string;
  folderId?: string;
  subtitleEntries: AimSegments[];
  translationTracks: AimSegments[][];
  translationTrackMeta: { languageCode: string; label: string; resourceId: string }[];
  synthesizedItemsByTrack: Map<string, Map<number, TTSSynthesisItem>>;
  ttsTrackLabels?: Map<string, string>;
}

/**
 * Modular Export Dialog Component
 * Organized into separate concerns:
 * - Track selection
 * - Video configuration
 * - Subtitle configuration
 * - Preview with style editor
 * - Export progress
 */
export function ExportDialog({
  open,
  onOpenChange,
  videoPath,
  audioPath,
  duration,
  resourceId,
  workspaceId,
  folderId,
  subtitleEntries,
  translationTracks,
  translationTrackMeta,
  synthesizedItemsByTrack,
  ttsTrackLabels
}: ExportDialogProps) {
  // Config state
  const [config, setConfig] = useState<ExportConfig>({ ...DEFAULT_EXPORT_CONFIG });
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  // Initialize config when dialog opens
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setConfig((prev) => ({
        ...prev,
        subtitleStyle: prev.subtitleStyle || { ...DEFAULT_SUBTITLE_STYLE }
      }));
      setExporting(false);
      setProgress(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  // Build available tracks
  const availableTracks = useMemo<ExportTrack[]>(() => {
    const tracks: ExportTrack[] = [];

    if (videoPath) {
      tracks.push({
        id: 'video-original',
        label: '原始视频',
        type: 'video',
        defaultChecked: true,
        description: '原始视频画面和音轨'
      });
    }

    if (subtitleEntries.length > 0) {
      tracks.push({
        id: 'subtitle-original',
        label: '原文字幕',
        type: 'subtitle',
        defaultChecked: true,
        description: `${subtitleEntries.length} 条字幕`
      });
    }

    translationTracks.forEach((_, idx) => {
      const meta = translationTrackMeta[idx];
      if (meta) {
        tracks.push({
          id: `subtitle-translation-${idx}`,
          label: `${meta.label} 字幕`,
          type: 'subtitle',
          defaultChecked: true,
          description: '翻译字幕',
          languageCode: meta.languageCode
        });
      }
    });

    synthesizedItemsByTrack.forEach((items, trackId) => {
      const completedCount = Array.from(items.values()).filter((i) => i.status === 'completed' && i.audioPath).length;
      if (completedCount === 0) return;
      const label = ttsTrackLabels?.get(trackId) || trackId;
      tracks.push({
        id: `tts-audio-${trackId}`,
        label: `${label} 语音`,
        type: 'tts-audio',
        defaultChecked: false,
        description: `${completedCount} 段合成语音`
      });
    });

    return tracks;
  }, [subtitleEntries, translationTracks, translationTrackMeta, synthesizedItemsByTrack, ttsTrackLabels, videoPath]);

  // Initialize selected tracks
  useEffect(() => {
    if (!open) return;
    const defaultSelected = availableTracks.filter((t) => t.defaultChecked).map((t) => t.id);
    setConfig((prev) => ({ ...prev, selectedTrackIds: defaultSelected }));
  }, [open, availableTracks]);

  const hasSelectedSubtitle = config.selectedTrackIds.some((id) => id.startsWith('subtitle-'));

  // Preview segments
  const previewSegments = useMemo(() => {
    const segments: Array<{ st: string; et: string; text: string }> = [];

    if (config.selectedTrackIds.includes('subtitle-original')) {
      subtitleEntries.forEach((seg) => {
        segments.push({ st: seg.st, et: seg.et, text: seg.text });
      });
    }

    if (segments.length === 0) {
      const firstTranslationId = config.selectedTrackIds.find((id) => id.startsWith('subtitle-translation-'));
      if (firstTranslationId) {
        const idx = parseInt(firstTranslationId.replace('subtitle-translation-', ''), 10);
        const track = translationTracks[idx];
        if (track) {
          track.forEach((seg) => {
            segments.push({ st: seg.st, et: seg.et, text: seg.text });
          });
        }
      }
    }

    return segments;
  }, [config.selectedTrackIds, subtitleEntries, translationTracks]);

  // Track toggle handler
  const handleToggleTrack = useCallback((trackId: string) => {
    setConfig((prev) => {
      const ids = prev.selectedTrackIds.includes(trackId) ? prev.selectedTrackIds.filter((id) => id !== trackId) : [...prev.selectedTrackIds, trackId];
      return { ...prev, selectedTrackIds: ids };
    });
  }, []);

  // Style change handler
  const handleStyleChange = useCallback((style: SubtitleStyleConfig) => {
    setConfig((prev) => ({ ...prev, subtitleStyle: style }));
  }, []);

  // Config change handlers
  const handleEmbedModeChange = useCallback((value: SubtitleEmbedMode) => {
    setConfig((prev) => ({ ...prev, subtitleEmbedMode: value }));
  }, []);

  const handleQualityChange = useCallback((value: VideoQualityPreset) => {
    setConfig((prev) => ({ ...prev, qualityPreset: value }));
  }, []);

  const handleContainerChange = useCallback((value: VideoContainer) => {
    setConfig((prev) => ({ ...prev, container: value }));
  }, []);

  const handleVideoCodecChange = useCallback((value: VideoCodec) => {
    setConfig((prev) => ({ ...prev, videoCodec: value }));
  }, []);

  const handleCrfChange = useCallback((value: number) => {
    setConfig((prev) => ({ ...prev, crf: value }));
  }, []);

  const handleAudioBitrateChange = useCallback((value: number) => {
    setConfig((prev) => ({ ...prev, audioBitrate: value }));
  }, []);

  // Export handler
  const handleExport = useCallback(async () => {
    if (!videoPath && !audioPath) return;

    setExporting(true);
    setProgress({ stage: 'preparing', stageLabel: '准备导出...', progress: 0, totalProgress: 0 });

    try {
      // Build subtitle tracks
      const subtitleTracks: ExportSubtitleTrack[] = [];

      if (config.selectedTrackIds.includes('subtitle-original') && subtitleEntries.length > 0) {
        const iSegments = subtitleEntries.map((seg) => [seg.st, seg.et, seg.text, undefined] as [string, string, string, undefined]);
        subtitleTracks.push({
          trackId: 'original',
          label: '原文',
          srtContent: tools.outputSrt({ segments1: iSegments }),
          assContent: tools.outputAss({ segments1: iSegments })
        });
      }

      config.selectedTrackIds
        .filter((id) => id.startsWith('subtitle-translation-'))
        .forEach((id) => {
          const idx = parseInt(id.replace('subtitle-translation-', ''), 10);
          const track = translationTracks[idx];
          const meta = translationTrackMeta[idx];
          if (track && meta) {
            const iSegments = track.map((seg) => [seg.st, seg.et, seg.text, undefined] as [string, string, string, undefined]);
            subtitleTracks.push({
              trackId: meta.languageCode || `translation-${idx}`,
              label: meta.label,
              languageCode: meta.languageCode,
              srtContent: tools.outputSrt({ segments1: iSegments }),
              assContent: tools.outputAss({ segments1: iSegments })
            });
          }
        });

      // Build TTS audio tracks
      const ttsAudioTracks: ExportTTSAudioTrack[] = [];
      const allSubtitleTracks: AimSegments[][] = [subtitleEntries, ...translationTracks];

      config.selectedTrackIds
        .filter((id) => id.startsWith('tts-audio-'))
        .forEach((id) => {
          const trackId = id.replace('tts-audio-', '');
          const itemsMap = synthesizedItemsByTrack.get(trackId);
          if (!itemsMap) return;

          const subtitleTrackIndex = trackId === 'main' ? 0 : translationTrackMeta.findIndex((t) => t.languageCode === trackId) + 1;
          const subtitleTrack = allSubtitleTracks[subtitleTrackIndex];

          const segments: ExportTTSSegment[] = [];
          itemsMap.forEach((item) => {
            if (item.status !== 'completed' || !item.audioPath) return;

            const seg = subtitleTrack?.[item.index];
            const startTime = item.startTime ?? (seg ? utils.convertToSeconds(seg.st) : 0);
            const endTime = item.endTime ?? (seg ? utils.convertToSeconds(seg.et) : startTime);
            const slotDuration = endTime - startTime;
            const audioDuration = item.trimmedDuration ?? item.duration ?? slotDuration;

            segments.push({
              index: item.index,
              audioPath: item.audioPath,
              startTime,
              endTime,
              originalDuration: audioDuration,
              trimmedDuration: item.trimmedDuration,
              playbackRate: slotDuration > 0 ? audioDuration / slotDuration : 1
            });
          });

          segments.sort((a, b) => a.startTime - b.startTime);

          const label = ttsTrackLabels?.get(trackId) || trackId;
          ttsAudioTracks.push({ trackId, label, segments });
        });

      const exportRequest: ExportRequest = {
        resourceId,
        duration,
        config,
        subtitleTracks,
        ttsAudioTracks,
        workspaceId,
        folderId
      };

      // Progress handler
      const progressHandler = (_event: any, data: ExportProgress): void => {
        setProgress(data);
        if (data.stage === 'done' || data.stage === 'error') {
          setExporting(false);
          window.ipcRenderer.off('export-progress', progressHandler);
        }
      };
      window.ipcRenderer.on('export-progress', progressHandler);

      await window.YUA.ffmpeg.exportVideo(exportRequest);
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err) || '未知错误';
      console.error('[ExportDialog] 导出失败:', errorMsg);
      setProgress({
        stage: 'error',
        stageLabel: '导出失败',
        progress: 0,
        totalProgress: 0,
        error: errorMsg
      });
      setExporting(false);
    }
  }, [videoPath, audioPath, config, duration, resourceId, workspaceId, folderId, subtitleEntries, translationTracks, translationTrackMeta, synthesizedItemsByTrack, ttsTrackLabels]);

  return (
    <Dialog open={open} onOpenChange={exporting ? undefined : onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TbUpload className="h-5 w-5" />
            导出视频
          </DialogTitle>
          <DialogDescription>选择要导出的轨道并配置导出参数</DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Left Panel: Preview + Style Editor */}
          <div className="w-96 flex-shrink-0 flex flex-col">
            <PreviewPanel
              videoPath={videoPath}
              subtitleSegments={previewSegments}
              subtitleStyle={config.subtitleStyle || DEFAULT_SUBTITLE_STYLE}
              onStyleChange={handleStyleChange}
              showStyleEditor={hasSelectedSubtitle}
              disabled={exporting}
            />
          </div>

          {/* Right Panel: Configuration */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4 pr-2">
                <TrackSelector tracks={availableTracks} selectedIds={config.selectedTrackIds} onToggle={handleToggleTrack} disabled={exporting} />

                <Separator />

                {hasSelectedSubtitle && (
                  <>
                    <SubtitleConfig embedMode={config.subtitleEmbedMode} onEmbedModeChange={handleEmbedModeChange} disabled={exporting} showStyleHint />
                    <Separator />
                  </>
                )}

                <VideoConfig
                  qualityPreset={config.qualityPreset}
                  onQualityChange={handleQualityChange}
                  container={config.container}
                  onContainerChange={handleContainerChange}
                  videoCodec={config.videoCodec}
                  onVideoCodecChange={handleVideoCodecChange}
                  crf={config.crf}
                  onCrfChange={handleCrfChange}
                  audioBitrate={config.audioBitrate}
                  onAudioBitrateChange={handleAudioBitrateChange}
                  disabled={exporting}
                />
              </div>
            </ScrollArea>

            {/* Progress */}
            <div className="mt-4">
              <ExportProgressView progress={progress} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <DialogClose asChild>
            <Button variant="outline" disabled={exporting && progress?.stage !== 'done' && progress?.stage !== 'error'}>
              {progress?.stage === 'done' ? '关闭' : '取消'}
            </Button>
          </DialogClose>
          {progress?.stage !== 'done' && (
            <Button onClick={handleExport} disabled={exporting || config.selectedTrackIds.length === 0 || (!videoPath && !audioPath)}>
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <TbUpload className="mr-2 h-4 w-4" />
                  开始导出
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Import Loader2 for the loading state
import { Loader2 } from 'lucide-react';
import { TbUpload } from 'react-icons/tb';
