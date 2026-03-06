import { AimSegments, parser, tools, utils } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbBookmark, TbCrosshair, TbDownload, TbList, TbScissors, TbTimeline } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

import type { ResourceItem } from '../../../types';
import { dispatchAnnotationAlert } from '../MediaPlayer/annotationAlertEvent';
import { ANNOTATION_DELETE_EVENT, type AnnotationMarker, dispatchAnnotationMarkers } from '../MediaPlayer/annotationMarkersEvent';
import { MediaPlayerRef } from '../MediaPlayer/MediaPlayer';
import { dispatchSubtitleDisplay, type SubtitleDisplayLine, type WordTimestamp } from '../MediaPlayer/subtitleDisplayEvent';
import { dispatchTrackSettings, TRACK_TOGGLE_EVENT, type TrackSettingsItem, type TrackTogglePayload } from '../MediaPlayer/trackSettingsEvent';
import { createAimAdapters } from './adapters';
import { ExportDialog } from './ExportDialog';
import { SubtitlePlayer } from './SubtitleListPlayer/SubtitlePlayer';
import { aimTracksToTimelineTracks, ClipSequence, formatSecondsToTime, indicesToIds, parseSegmentId, parseTimeToSeconds, SubtitleTimeline, TimelineSegment } from './SubtitleTimeline';
import { MediaSequence, TTSBatchTextInputPanel } from './SubtitleTimeline';
import type {
  AnnotationTrackCallbacks,
  AnnotationTrackData,
  ClipSegment,
  ClipTrackCallbacks,
  ClipTrackData,
  MediaSegment,
  MediaSource,
  MediaTrackCallbacks,
  MediaTrackData,
  TTSAudioItem as TimelineTTSAudioItem,
  WaveformState
} from './SubtitleTimeline/types';
import { SubtitleTranslator } from './SubtitleTranslator';
import { mergeSegmentsChildren, shiftSegmentTime, syncSegmentsWithEntries } from './syncSegmentsData';
import type { TTSTrackOption } from './TTSSynthesizer';
import { TTSSynthesizer } from './TTSSynthesizer';
import { useAnnotations } from './useAnnotations';
import { useSubtitleTranslation } from './useSubtitleTranslation';
import { useTTSSynthesis } from './useTTSSynthesis';

// 将 AimSegments 转换为 ISegment 格式
// ISegment = [string, string, string, string | undefined]
// 第一个是开始时间，第二个是结束时间，第三个是文本，第四个是可选的
function convertToISegment(segment: AimSegments): [string, string, string, string | undefined] {
  return [segment.st, segment.et, segment.text, undefined];
}

type SubtitleFormat = 'srt' | 'vtt' | 'ass';

interface ResourceSubtitlePlayerProps {
  resource: ResourceItem;
  mediaPlayerRef: React.RefObject<MediaPlayerRef>;
  currentTime?: number; // 当前播放时间（秒）
  /** 媒体总时长（秒），有音视频播放器时传入，时间轴以此作为总时长而非字幕结尾时长 */
  mediaDuration?: number;
  onSeek?: (time: number) => void; // 跳转到指定时间的回调
  followCurrentTime?: boolean; // 是否跟随时间自动滚动
  audioPath?: string; // 音频文件路径（用于波形显示）
  onMediaPlay?: () => void; // 媒体播放器播放事件回调
  onMediaPause?: () => void; // 媒体播放器暂停事件回调
}

/**
 * 带资源读取和翻译能力的字幕播放器容器
 * - 翻译结果由主进程自动保存，渲染进程只负责展示
 * - 用户手动编辑字幕时，通过渲染进程保存
 */
export const ResourceSubtitlePlayer: React.FC<ResourceSubtitlePlayerProps> = ({
  resource,
  mediaPlayerRef,
  currentTime = 0,
  mediaDuration,
  onSeek,
  followCurrentTime = false,
  audioPath,
  onMediaPlay,
  onMediaPause
}) => {
  const [subtitleEntries, setSubtitleEntries] = useState<AimSegments[]>([]);
  /** segments.json 中的字级别时间戳数据（与 subtitleEntries 按 st/et 匹配） */
  const [segmentsData, setSegmentsData] = useState<AimSegments[] | null>(null);
  /** 上次同步 segments 时的 subtitleEntries 快照，用于 diff 对比 */
  const lastSyncedEntriesRef = useRef<AimSegments[]>([]);
  const segmentsDataRef = useRef<AimSegments[] | null>(null);
  const [translationTracks, setTranslationTracks] = useState<AimSegments[][]>([]);
  /** 各翻译轨道的语言、显示名和资源ID（与 translationTracks 顺序一致） */
  const [translationTrackMeta, setTranslationTrackMeta] = useState<{ languageCode: string; label: string; resourceId: string }[]>([]);
  /** 编排字幕轨道 */
  const [subtitleEditTracks, setSubtitleEditTracks] = useState<AimSegments[][]>([]);
  const [subtitleEditTrackMeta, setSubtitleEditTrackMeta] = useState<{ label: string; trackId: string }[]>([]);
  const [subtitleEditNameDialog, setSubtitleEditNameDialog] = useState<{ open: boolean; name: string }>({ open: false, name: '' });
  /** 独立 TTS 轨道元数据：每个轨道有唯一 ID、名称、TTS 配置、数据库资源 ID、是否已配置 */
  const [standaloneTTSTracks, setStandaloneTTSTracks] = useState<
    { id: string; label: string; voiceName: string; rate: number; pitch: number; autoTrimSilence: boolean; resourceId?: string; configured?: boolean }[]
  >([]);
  /** TTS 片段文本输入对话框（双击已有片段编辑时使用） */
  const [ttsSegmentDialog, setTTSSegmentDialog] = useState<{
    open: boolean;
    trackId: string;
    text: string;
    startTime: number;
    endTime: number;
    editIndex?: number; // 编辑已有片段时的索引
  }>({ open: false, trackId: '', text: '', startTime: 0, endTime: 3 });
  /** 待新增 TTS 片段（inline 输入框状态） */
  const [pendingTTSSegment, setPendingTTSSegment] = useState<{ trackId: string; startTime: number; endTime: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [subtitleFormat, setSubtitleFormat] = useState<SubtitleFormat>('srt');
  const SUBTITLE_VIEW_MODE_KEY = 'subtitle-player:viewMode';
  const [viewMode, setViewModeState] = useState<'list' | 'timeline'>(() => {
    if (typeof window === 'undefined') return 'list';
    const stored = localStorage.getItem(SUBTITLE_VIEW_MODE_KEY);
    if (stored === 'list' || stored === 'timeline') return stored;
    return 'list';
  });
  const setViewMode = useCallback((mode: 'list' | 'timeline') => {
    setViewModeState(mode);
    localStorage.setItem(SUBTITLE_VIEW_MODE_KEY, mode);
  }, []);
  const [followTime, setFollowTime] = useState<boolean>(followCurrentTime);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  // ---- 剪辑轨道状态 ----
  const [clipSegments, setClipSegments] = useState<ClipSegment[]>([]);
  const isLoadingClipSegmentsRef = useRef(false);

  // ---- 媒体轨道状态 ----
  const [mediaTracks, setMediaTracks] = useState<MediaTrackData[]>([]);
  const [mediaSources, setMediaSources] = useState<Map<string, MediaSource>>(new Map());
  const isLoadingMediaTracksRef = useRef(false);
  const isSavingMediaTracksRef = useRef(false);
  /** 已加载媒体轨道的资源 ID，防止重复加载 */
  const loadedMediaTracksResourceIdRef = useRef<string | null>(null);

  // 保持 subtitleEntries 的引用始终是最新的
  const [mediaTrackEnabled, setMediaTrackEnabled] = useState(false);

  // ---- 轨道启用/禁用状态 ----
  /** 字幕轨道启用状态：timeline track id -> enabled */
  const [subtitleTrackEnabledMap, setSubtitleTrackEnabledMap] = useState<Map<string, boolean>>(new Map());
  /** TTS轨道启用状态：ttsTrackId -> enabled */
  const [ttsTrackEnabledMap, setTTSTrackEnabledMap] = useState<Map<string, boolean>>(new Map());
  /** 剪辑轨道是否启用 */
  const [clipTrackEnabled, setClipTrackEnabled] = useState(true);
  /** 标注轨道是否启用 */
  const [annotationTrackEnabled, setAnnotationTrackEnabled] = useState(true);

  // ---- 波形数据状态 ----
  const [waveform, setWaveform] = useState<WaveformState>({});

  // ---- 创建 Aim 适配器 ----
  const aimAdapters = useMemo(() => createAimAdapters(), []);

  // 防抖保存剪辑状态（存储到独立的 clip 文件）
  const debouncedSaveClipSegments = useMemo(
    () =>
      debounce(async (resourceId: string, clips: ClipSegment[]) => {
        if (!resourceId) return;
        try {
          const result = await window.YUA.clip.save(resourceId, clips);
          if (result.success) {
            console.log('[auto-save] 剪辑状态已保存');
          } else {
            console.error('[auto-save] 保存剪辑状态失败:', result.error);
          }
        } catch (error) {
          console.error('[auto-save] 保存剪辑状态失败:', error);
        }
      }, 1000),
    []
  );

  // 防抖保存媒体轨道状态（存储到独立的 media-track 资源）
  const debouncedSaveMediaTracks = useMemo(
    () =>
      debounce(async (resourceId: string, tracks: MediaTrackData[], sources: Map<string, MediaSource>) => {
        if (!resourceId) return;
        // 防止并发保存
        if (isSavingMediaTracksRef.current) {
          console.log('[auto-save] 媒体轨道正在保存中，跳过');
          return;
        }
        // 跳过加载过程中的保存
        if (isLoadingMediaTracksRef.current) {
          console.log('[auto-save] 媒体轨道正在加载中，跳过保存');
          return;
        }

        isSavingMediaTracksRef.current = true;
        try {
          // 获取现有的媒体轨道资源
          const existingTracks = await window.YUA.resource['resource:getMediaTracks']({ parentResourceId: resourceId });
          const existingMap = new Map(existingTracks.map((t) => [t.trackId, t]));

          for (const track of tracks) {
            const trackSources = track.segments.map((s) => sources.get(s.sourceId)).filter(Boolean) as MediaSource[];

            const existing = existingMap.get(track.id);

            if (existing) {
              // 更新现有轨道
              await window.YUA.resource['resource:updateMediaTrack']({
                parentResourceId: resourceId,
                trackId: track.id,
                label: track.label,
                zIndex: track.zIndex,
                visible: track.visible,
                locked: track.locked,
                color: track.color,
                segments: track.segments,
                sources: trackSources
              });
            } else {
              // 创建新轨道（使用前端生成的 track.id 作为 trackId）
              const newTrack = await window.YUA.resource['resource:createMediaTrack']({
                parentResourceId: resourceId,
                trackId: track.id,
                label: track.label,
                zIndex: track.zIndex,
                color: track.color
              });
              // 创建后更新 segments 和 sources
              if (newTrack) {
                await window.YUA.resource['resource:updateMediaTrack']({
                  parentResourceId: resourceId,
                  trackId: track.id,
                  segments: track.segments,
                  sources: trackSources,
                  visible: track.visible,
                  locked: track.locked
                });
              }
            }
          }
          console.log('[auto-save] 媒体轨道状态已保存');
        } catch (error) {
          console.error('[auto-save] 保存媒体轨道状态失败:', error);
        } finally {
          isSavingMediaTracksRef.current = false;
        }
      }, 1000),
    []
  );

  // 从独立文件加载剪辑状态
  const loadClipSegments = useCallback(async (resourceId: string, mediaDur?: number) => {
    console.log('[SubtitlePlayer] loadClipSegments 被调用', {
      resourceId,
      mediaDuration: mediaDur
    });
    isLoadingClipSegmentsRef.current = true;
    try {
      const data = await window.YUA.clip.load(resourceId);
      if (data && Array.isArray(data.clips) && data.clips.length > 0) {
        console.log('[SubtitlePlayer] 加载到已保存的剪辑片段:', data.clips.length, '个');
        setClipSegments(data.clips);
        return;
      }
      console.log('[SubtitlePlayer] 没有已保存的剪辑片段，将创建初始片段');
      // 没有保存的剪辑数据，如果有媒体时长则创建初始片段
      if (mediaDur && mediaDur > 0) {
        const initial = ClipSequence.createInitial(mediaDur);
        console.log('[SubtitlePlayer] 创建初始片段:', initial.length, '个');
        setClipSegments(initial);
      } else {
        setClipSegments([]);
      }
    } catch (error) {
      console.error('[SubtitlePlayer] 加载剪辑状态失败:', error);
      if (mediaDur && mediaDur > 0) {
        setClipSegments(ClipSequence.createInitial(mediaDur));
      } else {
        setClipSegments([]);
      }
    } finally {
      setTimeout(() => {
        isLoadingClipSegmentsRef.current = false;
      }, 100);
    }
  }, []);

  // 从数据库资源加载媒体轨道状态（新格式：每个轨道一个资源）
  const loadMediaTracks = useCallback(async (resourceId: string) => {
    // 防止重复加载同一资源
    if (loadedMediaTracksResourceIdRef.current === resourceId) {
      console.log('[SubtitlePlayer] 跳过重复加载媒体轨道:', resourceId);
      return;
    }
    console.log('[SubtitlePlayer] loadMediaTracks 被调用', { resourceId });
    isLoadingMediaTracksRef.current = true;
    loadedMediaTracksResourceIdRef.current = resourceId;
    try {
      const tracks = await window.YUA.resource['resource:getMediaTracks']({ parentResourceId: resourceId });
      if (tracks && tracks.length > 0) {
        console.log('[SubtitlePlayer] 加载到已保存的媒体轨道:', tracks.length, '个轨道');
        setMediaTracks(
          tracks.map((t) => ({
            id: t.trackId,
            label: t.label,
            segments: t.segments,
            zIndex: t.zIndex,
            visible: t.visible,
            locked: t.locked,
            color: t.color
          }))
        );
        // 合并所有轨道的 sources
        const allSources = new Map<string, MediaSource>();
        for (const t of tracks) {
          for (const s of t.sources) {
            allSources.set(s.id, s);
          }
        }
        setMediaSources(allSources);
      } else {
        console.log('[SubtitlePlayer] 没有已保存的媒体轨道');
      }
    } catch (error) {
      console.error('[SubtitlePlayer] 加载媒体轨道状态失败:', error);
    } finally {
      // 延迟重置加载状态，确保 React 状态更新已完成
      setTimeout(() => {
        isLoadingMediaTracksRef.current = false;
        console.log('[SubtitlePlayer] loadMediaTracks 加载完成');
      }, 100);
    }
  }, []);

  // 剪辑状态变更时自动保存
  useEffect(() => {
    if (!resource.id || clipSegments.length === 0) return;
    // 跳过加载过程中的保存
    if (isLoadingClipSegmentsRef.current) {
      console.log('[SubtitlePlayer] 跳过加载过程中的自动保存');
      return;
    }
    console.log('[SubtitlePlayer] 触发剪辑状态自动保存, clipSegments:', clipSegments.length, '个');
    debouncedSaveClipSegments(resource.id, clipSegments);
  }, [clipSegments, resource.id, debouncedSaveClipSegments]);

  // 媒体轨道状态变更时自动保存
  useEffect(() => {
    if (!resource.id) return;
    // 没有轨道且没有源时跳过保存
    if (mediaTracks.length === 0 && mediaSources.size === 0) return;
    // 跳过加载过程中的保存
    if (isLoadingMediaTracksRef.current) {
      console.log('[SubtitlePlayer] 跳过加载过程中的媒体轨道自动保存');
      return;
    }
    console.log('[SubtitlePlayer] 触发媒体轨道状态自动保存, tracks:', mediaTracks.length, 'sources:', mediaSources.size);
    debouncedSaveMediaTracks(resource.id, mediaTracks, mediaSources);
  }, [mediaTracks, mediaSources, resource.id, debouncedSaveMediaTracks]);

  // 外部值变化时同步本地开关
  useEffect(() => {
    setFollowTime(followCurrentTime);
  }, [followCurrentTime]);

  // 保持 subtitleEntries 的引用始终是最新的
  const subtitleEntriesRef = useRef<AimSegments[]>([]);
  useEffect(() => {
    subtitleEntriesRef.current = subtitleEntries;
  }, [subtitleEntries]);

  // 保持 segmentsData ref 同步
  useEffect(() => {
    segmentsDataRef.current = segmentsData;
  }, [segmentsData]);

  // 防抖保存函数（用于用户手动编辑字幕时保存）
  const debouncedSave = useMemo(
    () =>
      debounce(async (resourceId: string, segments: AimSegments[], format: SubtitleFormat) => {
        if (!resourceId) return;

        try {
          // 过滤掉已删除的片段
          const validSegments = segments.filter((seg) => !seg.delete);
          // 转换为 ISegment 格式
          const iSegments = validSegments.map(convertToISegment);

          // 根据格式选择不同的输出方法
          let content: string;
          if (format === 'vtt' && 'outputVtt' in tools && typeof tools.outputVtt === 'function') {
            content = tools.outputVtt({ segments1: iSegments });
          } else if (format === 'ass' && 'outputAss' in tools && typeof tools.outputAss === 'function') {
            content = tools.outputAss({ segments1: iSegments });
          } else {
            // 默认使用 SRT 格式输出
            content = tools.outputSrt({ segments1: iSegments });
          }

          // 通过资源更新接口保存，主进程会处理文件写入
          const result = await window.YUA.resource['resource:update']({
            id: resourceId,
            patch: { subtitleContent: content }
          });
          if (result.success) {
            console.log(`[auto-save] 字幕已保存 (${format})`);
          } else {
            console.error('[auto-save] 保存失败');
          }

          // 同步更新 segments.json（字级别时间戳）
          const currentSegmentsData = segmentsDataRef.current;
          if (currentSegmentsData && currentSegmentsData.length > 0) {
            const oldEntries = lastSyncedEntriesRef.current;
            const updatedSegments = syncSegmentsWithEntries(currentSegmentsData, oldEntries, validSegments);
            if (updatedSegments) {
              // 更新本地状态
              segmentsDataRef.current = updatedSegments;
              setSegmentsData(updatedSegments);
              lastSyncedEntriesRef.current = validSegments.map((s) => ({ ...s }));
              // 持久化到磁盘
              window.YUA.resource['resource:updateSegmentsData']({
                subtitleResourceId: resourceId,
                segmentsData: updatedSegments
              })
                .then((res) => {
                  if (res.success) {
                    console.log('[auto-save] segments.json 已同步更新');
                  } else {
                    console.warn('[auto-save] segments.json 更新失败:', res.error);
                  }
                })
                .catch((err) => console.error('[auto-save] segments.json 更新异常:', err));
            }
          }
        } catch (error) {
          console.error('[auto-save] 保存字幕时出错:', error);
        }
      }, 1000),
    []
  );

  // 翻译轨道写回 JSON：待提交的更新（key = translationResourceId-segmentIndex，合并同片段的时间/文本修改）
  const pendingTranslationUpdatesRef = useRef<Map<string, { translationResourceId: string; segmentIndex: number; patch: { st?: string; et?: string; text?: string } }>>(new Map());
  const debouncedFlushTranslationUpdates = useMemo(
    () =>
      debounce(() => {
        const map = pendingTranslationUpdatesRef.current;
        if (map.size === 0) return;
        const entries = Array.from(map.entries());
        map.clear();
        entries.forEach(([, { translationResourceId, segmentIndex, patch }]) => {
          window.YUA.ai
            .updateTranslationSegment({ translationResourceId, segmentIndex, patch })
            .then((res) => {
              if (!res.success) console.warn('[SubtitlePlayer] 翻译片段写回 JSON 失败:', res.message);
            })
            .catch((err) => console.error('[SubtitlePlayer] 翻译片段写回失败:', err));
        });
      }, 1000),
    []
  );

  // 用于清空临时翻译轨道的 ref（因为 clearTypingTexts 在 hook 调用后才可用）
  const clearTypingTextsRef = useRef<(() => void) | null>(null);

  // 用于递归调用的 ref
  const loadTranslationTracksRef = useRef<((retryCount?: number, expectedMinTracks?: number) => Promise<void>) | null>(null);
  // 当前资源是否已做过一次「首次加载翻译轨道」（避免编辑字幕后重复拉取）
  const hasLoadedTranslationsForResourceRef = useRef<string | null>(null);
  // 当前 subtitleEntries 所属的资源 ID（文件加载完成时设置），用于区分「切换资源后尚未加载新字幕」与「当前资源的字幕已就绪」
  const subtitleEntriesResourceIdRef = useRef<string | null>(null);

  // 加载翻译轨道的函数（可在翻译完成后重新调用）
  // 添加重试机制，因为主进程保存翻译数据是异步的，可能在 completed 事件发送后才完成
  const loadTranslationTracks = useCallback(
    async (retryCount = 0, expectedMinTracks?: number) => {
      if (!resource.id) return;
      const maxRetries = 5;
      const retryDelay = 500; // 500ms 重试间隔

      try {
        const translations = await window.YUA.ai.getResourceTranslations(resource.id);
        const translationTracksData: AimSegments[][] = [];
        const meta: { languageCode: string; label: string; resourceId: string }[] = [];
        const currentEntries = subtitleEntriesRef.current || [];

        for (let i = 0; i < translations.length; i++) {
          const trans = translations[i];
          if (trans.segments && trans.segments.length > 0) {
            // 译文轨道直接从 JSON 的 translatedSegments 构建，优先使用 JSON 中的 st/et
            const rawSegments = trans.segments as Array<{ index: number; text: string; st?: string; et?: string }>;
            const translationSegments: AimSegments[] = [...rawSegments]
              .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
              .map((t) => {
                const orig = currentEntries[t.index];
                return {
                  st: t.st ?? orig?.st ?? '00:00:00,000',
                  et: t.et ?? orig?.et ?? '00:00:00,000',
                  text: t.text ?? ''
                };
              });
            translationTracksData.push(translationSegments);
            meta.push({
              languageCode: trans.language ?? `trans-${i}`,
              label: trans.title ?? trans.language ?? `译文 ${i + 1}`,
              resourceId: trans.id ?? ''
            });
          }
        }

        // 如果有期望的最小轨道数，检查是否满足
        if (expectedMinTracks !== undefined && translationTracksData.length < expectedMinTracks && retryCount < maxRetries) {
          console.log(`[SubtitlePlayer] 翻译轨道数量不足 (${translationTracksData.length} < ${expectedMinTracks})，${retryDelay}ms 后重试 (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => {
            loadTranslationTracksRef.current?.(retryCount + 1, expectedMinTracks);
          }, retryDelay);
          return;
        }

        setTranslationTracks(translationTracksData);
        setTranslationTrackMeta(meta);
        console.log(`[SubtitlePlayer] 翻译轨道加载完成，共 ${translationTracksData.length} 个轨道`);

        // 新轨道加载成功后，清空临时翻译轨道（typingTexts）
        // 这样可以避免重复显示已保存的翻译
        if (expectedMinTracks !== undefined && translationTracksData.length >= expectedMinTracks) {
          clearTypingTextsRef.current?.();
        }
      } catch (error) {
        console.error('[SubtitlePlayer] 加载翻译资源失败:', error);
        // 出错时也尝试重试
        if (retryCount < maxRetries) {
          setTimeout(() => {
            loadTranslationTracksRef.current?.(retryCount + 1, expectedMinTracks);
          }, retryDelay);
        }
      }
    },
    [resource.id, subtitleEntriesRef]
  );

  // 更新递归调用的 ref
  useEffect(() => {
    loadTranslationTracksRef.current = loadTranslationTracks;
  }, [loadTranslationTracks]);

  // 首次进入或切换资源：字幕条目加载完成后拉取翻译轨道（统一走 loadTranslationTracks，有 log 且用 JSON st/et）
  useEffect(() => {
    if (!resource.id || subtitleEntries.length === 0) return;
    if (subtitleEntriesResourceIdRef.current !== resource.id) return; // 当前条目属于当前资源才拉取
    if (hasLoadedTranslationsForResourceRef.current === resource.id) return;
    hasLoadedTranslationsForResourceRef.current = resource.id;
    loadTranslationTracks(0);
  }, [resource.id, subtitleEntries.length, loadTranslationTracks]);

  // 加载编排字幕轨道（从项目文件夹 data/tracks/ 读取）
  const loadSubtitleEditTracks = useCallback(async () => {
    if (!resource.id) return;
    try {
      const tracks = await window.YUA.resource['resource:getSubtitleEditTracks']({ parentResourceId: resource.id });
      console.log('[SubtitlePlayer] 加载编排字幕轨道:', tracks);
      const editTracksData: AimSegments[][] = [];
      const meta: { label: string; trackId: string }[] = [];
      for (const t of tracks) {
        const segments: AimSegments[] = (t.segments || []).sort((a, b) => a.index - b.index).map((s) => ({ st: s.st ?? '00:00:00,000', et: s.et ?? '00:00:00,000', text: s.text ?? '' }));
        editTracksData.push(segments);
        meta.push({ label: t.title || '编排字幕', trackId: t.trackId });
        console.log('[SubtitlePlayer] 编排字幕轨道元数据:', { title: t.title, id: t.id, trackId: t.trackId });
      }
      console.log('[SubtitlePlayer] 设置编排字幕轨道元数据:', meta);
      setSubtitleEditTracks(editTracksData);
      setSubtitleEditTrackMeta(meta);
    } catch (err) {
      console.error('[SubtitlePlayer] 加载编排字幕轨道失败:', err);
    }
  }, [resource.id]);

  useEffect(() => {
    if (!resource.id || subtitleEntries.length === 0) return;
    loadSubtitleEditTracks();
  }, [resource.id, subtitleEntries.length, loadSubtitleEditTracks]);

  // 加载独立 TTS 轨道
  const loadTTSTracks = useCallback(async () => {
    if (!resource.id) return;
    try {
      const tracks = await window.YUA.resource['resource:getTTSTracks']({ parentResourceId: resource.id });
      const ttsTracksData: { id: string; label: string; voiceName: string; rate: number; pitch: number; autoTrimSilence: boolean; resourceId: string; configured: boolean }[] = [];
      for (const t of tracks) {
        ttsTracksData.push({
          id: `tts-${t.id}`, // 使用数据库资源 ID 生成唯一 trackId
          label: t.title || '配音',
          voiceName: t.config?.voiceName ?? 'zh-CN-XiaoxiaoNeural',
          rate: t.config?.rate ?? 20,
          pitch: t.config?.pitch ?? 0,
          autoTrimSilence: t.config?.autoTrimSilence ?? true,
          resourceId: t.id,
          configured: true // 从数据库加载的轨道视为已配置
        });
      }
      setStandaloneTTSTracks(ttsTracksData);
      console.log(`[SubtitlePlayer] 加载到 ${ttsTracksData.length} 个独立 TTS 轨道`);
    } catch (err) {
      console.error('[SubtitlePlayer] 加载独立 TTS 轨道失败:', err);
    }
  }, [resource.id]);

  useEffect(() => {
    if (!resource.id || subtitleEntries.length === 0) return;
    loadTTSTracks();
  }, [resource.id, subtitleEntries.length, loadTTSTracks]);

  // 翻译完成后的回调：期望轨道数比当前多 1
  const handleTranslationComplete = useCallback(() => {
    const expectedTracks = translationTracks.length + 1;
    // 延迟一小段时间再开始加载，给主进程保存数据的时间
    setTimeout(() => {
      loadTranslationTracks(0, expectedTracks);
    }, 300);
  }, [loadTranslationTracks, translationTracks.length]);

  // 使用翻译 Hook（翻译结果由主进程自动保存）
  const { translatingChunks, typingTexts, chunkSummaryInfoMap, translationProgress, isTranslating, startTranslation, stopTranslation, clearTypingTexts } = useSubtitleTranslation({
    resourceId: resource.id,
    subtitleEntriesRef,
    // 翻译完成后重新加载翻译轨道
    onTranslationComplete: handleTranslationComplete
  });

  // 使用标注 Hook
  const { annotations, addAnnotation, removeAnnotation, updateAnnotation, getSegmentHighlights, annotationsBySegment } = useAnnotations({ resourceId: resource.id });

  // 使用TTS合成 Hook（多轨道）
  const {
    synthesizingIndices,
    synthesizedItemsByTrack,
    synthesisProgress,
    isSynthesizing,
    activeTrackId,
    startSynthesis,
    stopSynthesis,
    resetSynthesis,
    removeSynthesizedItem,
    loadTTSHistory,
    updateTTSSegmentTimes,
    getTTSPlayer,
    startTTSPlayback,
    stopTTSPlayback
  } = useTTSSynthesis({
    resourceId: resource.id,
    subtitleEntriesRef,
    resolveAudioUrl: makeResSrc
  });

  // 加载已保存的TTS历史（时间轴模式下为 main + 各翻译轨道加载）
  useEffect(() => {
    if (viewMode !== 'timeline' || subtitleEntries.length === 0 || !resource.id) {
      return;
    }

    const loadTTSPreferences = (): { voiceName?: string; rate?: number; pitch?: number } | null => {
      try {
        const stored = localStorage.getItem('tts-synthesizer-preferences');
        if (stored) {
          const prefs = JSON.parse(stored);
          return {
            voiceName: prefs.selectedVoice,
            rate: prefs.rate,
            pitch: prefs.pitch
          };
        }
      } catch (error) {
        console.error('读取TTS配置失败:', error);
      }
      return null;
    };

    const prefs = loadTTSPreferences();
    if (!prefs?.voiceName) return;

    const config = {
      voiceName: prefs.voiceName,
      rate: prefs.rate,
      pitch: prefs.pitch
    };

    void loadTTSHistory(config, 'main');
    translationTrackMeta.forEach((t) => {
      void loadTTSHistory(config, t.languageCode);
    });
  }, [viewMode, subtitleEntries.length, resource.id, loadTTSHistory, translationTrackMeta]);

  // 加载独立 TTS 轨道的合成历史
  useEffect(() => {
    if (standaloneTTSTracks.length === 0 || !resource.id) return;

    // 为每个独立 TTS 轨道加载历史
    standaloneTTSTracks.forEach((track) => {
      void loadTTSHistory(
        { voiceName: track.voiceName, rate: track.rate, pitch: track.pitch },
        track.id,
        true // isStandalone = true
      );
    });
  }, [standaloneTTSTracks, resource.id, loadTTSHistory]);

  // 当前正在播放的 TTS 索引 & 播放实例
  const [playingTTSIndex, setPlayingTTSIndex] = useState<number | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);

  // 处理TTS合成开始
  const handleTTSSynthesisStart = useCallback((taskId: string) => {
    console.log('[SubtitlePlayer] TTS合成开始, taskId:', taskId);
  }, []);

  // 停止当前 TTS 播放
  const handleStopTTS = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
      ttsAudioRef.current = null;
    }
    setPlayingTTSIndex(null);
  }, []);

  // 播放 / 切换 TTS 音频（列表和时间轴共用）
  const handlePlayTTS = useCallback(
    (index: number, audioPath: string) => {
      console.log('[SubtitlePlayer] 播放TTS音频, index:', index, 'path:', audioPath);

      // 如果点击的是正在播放的同一条，则当作停止
      if (playingTTSIndex === index) {
        handleStopTTS();
        return;
      }

      // 停掉之前的
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current = null;
      }

      const audio = new Audio(makeResSrc(audioPath));
      ttsAudioRef.current = audio;
      setPlayingTTSIndex(index);

      audio.onended = () => {
        setPlayingTTSIndex(null);
        ttsAudioRef.current = null;
      };

      audio.play().catch((error) => {
        console.error('[SubtitlePlayer] 播放TTS音频失败:', error);
        setPlayingTTSIndex(null);
        ttsAudioRef.current = null;
      });
    },
    [handleStopTTS, playingTTSIndex]
  );

  // 列表用：轨道 ID 列表（主轨 + 各翻译轨 + 翻译中临时轨）
  const trackIds = useMemo(() => {
    const ids = ['main', ...translationTrackMeta.map((t) => t.languageCode)];
    if (typingTexts.length > 0) ids.push('typing');
    return ids;
  }, [translationTrackMeta, typingTexts.length]);

  // 列表用：轨道显示标签（与 trackIds 顺序一致）
  const trackLabels = useMemo(() => {
    const labels = ['原文', ...translationTrackMeta.map((t) => t.label)];
    if (typingTexts.length > 0) labels.push('翻译中');
    return labels;
  }, [translationTrackMeta, typingTexts.length]);

  // 监听媒体播放器播放/暂停状态变化；首次进入时若已在播放（如自动播放）也同步启动 TTS
  // 根据各 TTS 轨道的眼睛图标启用状态，并行播放/停止对应轨道
  useEffect(() => {
    // 收集所有 TTS 轨道 ID
    const allTTSTrackIds = ['main', ...translationTrackMeta.map((t) => t.languageCode)];

    const startEnabledTracks = () => {
      for (const tid of allTTSTrackIds) {
        const isEnabled = ttsTrackEnabledMap.get(tid) !== false; // 默认启用
        if (isEnabled) {
          startTTSPlayback(tid);
        } else {
          stopTTSPlayback(tid);
        }
      }
    };

    const stopAllTracks = () => {
      stopTTSPlayback(); // 不传参数 → 停止全部
    };

    const handleMediaStateChange = (event: CustomEvent<{ isPlaying: boolean }>) => {
      if (event.detail.isPlaying) {
        startEnabledTracks();
      } else {
        stopAllTracks();
      }
    };

    window.addEventListener('custom:media-state-change', handleMediaStateChange as EventListener);

    // 首次挂载时检测：若播放器已在播放（如自动播放），事件可能已错过，需主动触发 TTS
    const checkInitialPlaying = () => {
      if (mediaPlayerRef?.current?.isPlaying()) {
        startEnabledTracks();
      }
    };
    checkInitialPlaying();
    const tid = window.setTimeout(checkInitialPlaying, 100);

    return () => {
      window.clearTimeout(tid);
      window.removeEventListener('custom:media-state-change', handleMediaStateChange as EventListener);
    };
  }, [startTTSPlayback, stopTTSPlayback, ttsTrackEnabledMap, translationTrackMeta]);

  // TTS 合成选项（原文 + 各翻译轨）供 TTSSynthesizer 选择
  const ttsTrackOptions = useMemo<TTSTrackOption[]>(() => {
    const opts: TTSTrackOption[] = [{ trackId: 'main', label: '原文' }];
    translationTrackMeta.forEach((t) => {
      opts.push({ trackId: t.languageCode, label: t.label, languageCode: t.languageCode });
    });
    return opts;
  }, [translationTrackMeta]);

  // 各轨道对应的字幕片段（索引 0=原文，1..n=翻译轨）
  const ttsTracksSegments = useMemo(() => [subtitleEntries, ...translationTracks], [subtitleEntries, translationTracks]);

  // 时间轴用：按轨道分组的 TTS 项 + 轨道标签 + 字幕轨道到TTS轨道的映射
  const { ttsItemsByTrackForTimeline, ttsTrackLabelsForTimeline, subtitleToTTSTrackMap } = useMemo(() => {
    const byTrack = new Map<string, TimelineTTSAudioItem[]>();
    const labels = new Map<string, string>();
    const subtitleToTTS = new Map<string, string>(); // timeline track id -> TTS trackId

    if (subtitleEntries.length === 0) {
      return { ttsItemsByTrackForTimeline: byTrack, ttsTrackLabelsForTimeline: labels, subtitleToTTSTrackMap: subtitleToTTS };
    }

    // 构建映射：timeline track index -> TTS trackId
    // track-0 (原文) -> 'main'
    // track-1 (译文1) -> translationTrackMeta[0].languageCode
    // track-2 (译文2) -> translationTrackMeta[1].languageCode
    subtitleToTTS.set('track-0', 'main');
    translationTrackMeta.forEach((meta, idx) => {
      subtitleToTTS.set(`track-${idx + 1}`, meta.languageCode);
    });

    // 构建所有字幕轨道的数组（用于获取对应轨道的时间）
    const allSubtitleTracks: AimSegments[][] = [subtitleEntries, ...translationTracks];

    const trackIdsList = ['main', ...translationTrackMeta.map((t) => t.languageCode)];
    trackIdsList.forEach((tid) => {
      const map = synthesizedItemsByTrack.get(tid);
      if (!map || map.size === 0) return;

      const subtitleTrackIndex = tid === 'main' ? 0 : translationTrackMeta.findIndex((t) => t.languageCode === tid) + 1;
      const subtitleTrack = allSubtitleTracks[subtitleTrackIndex];
      if (!subtitleTrack) return;

      const items: TimelineTTSAudioItem[] = [];
      map.forEach((item, index) => {
        const seg = subtitleTrack[index];
        if (!seg) return;
        const startTime = item.startTime ?? utils.convertToSeconds(seg.st);
        const endTime = item.endTime ?? utils.convertToSeconds(seg.et);
        items.push({
          index,
          status: item.status,
          audioPath: item.audioPath,
          duration: item.duration,
          trimmedDuration: item.trimmedDuration,
          error: item.error,
          startTime,
          endTime,
          md5: item.md5
        });
      });
      items.sort((a, b) => a.startTime - b.startTime);
      byTrack.set(tid, items);
      labels.set(tid, tid === 'main' ? '原文' : (translationTrackMeta.find((t) => t.languageCode === tid)?.label ?? tid));
    });

    // 独立 TTS 轨道的数据
    standaloneTTSTracks.forEach((stt) => {
      const map = synthesizedItemsByTrack.get(stt.id);
      if (!map || map.size === 0) return;
      const items: TimelineTTSAudioItem[] = [];
      map.forEach((item, index) => {
        items.push({
          index,
          status: item.status,
          audioPath: item.audioPath,
          duration: item.duration,
          trimmedDuration: item.trimmedDuration,
          error: item.error,
          startTime: item.startTime ?? 0,
          endTime: item.endTime ?? (item.startTime ?? 0) + (item.trimmedDuration ?? item.duration ?? 3),
          md5: item.md5,
          text: item.text
        });
      });
      items.sort((a, b) => a.startTime - b.startTime);
      byTrack.set(stt.id, items);
      labels.set(stt.id, stt.label);
    });

    return { ttsItemsByTrackForTimeline: byTrack, ttsTrackLabelsForTimeline: labels, subtitleToTTSTrackMap: subtitleToTTS };
  }, [subtitleEntries, translationTracks, synthesizedItemsByTrack, translationTrackMeta, standaloneTTSTracks]);

  // 更新 clearTypingTexts ref
  useEffect(() => {
    clearTypingTextsRef.current = clearTypingTexts;
  }, [clearTypingTexts]);

  // 切换资源或卸载组件时，确保主轨道与翻译轨道待保存的更改被立即保存
  useEffect(() => {
    return () => {
      debouncedSave.flush();
      debouncedFlushTranslationUpdates.flush();
      debouncedFlushTranslationUpdates.cancel();
      pendingTranslationUpdatesRef.current.clear();
      // 保存剪辑状态
      debouncedSaveClipSegments.flush();
    };
  }, [resource.id, debouncedSave, debouncedFlushTranslationUpdates, debouncedSaveClipSegments]);

  // 加载剪辑状态（当资源或媒体时长变化时）
  useEffect(() => {
    if (resource.id && mediaDuration && mediaDuration > 0) {
      void loadClipSegments(resource.id, mediaDuration);
      // 同时加载媒体轨道状态
      void loadMediaTracks(resource.id);
    } else if (!resource.id) {
      // 资源清空时重置状态
      setClipSegments([]);
      setMediaTracks([]);
      setMediaSources(new Map());
      loadedMediaTracksResourceIdRef.current = null;
    }
  }, [resource.id, mediaDuration, loadClipSegments, loadMediaTracks]);

  // 加载波形数据（当音频路径或时长变化时）
  useEffect(() => {
    if (!audioPath || !mediaDuration || mediaDuration <= 0) {
      setWaveform({});
      return;
    }

    let cancelled = false;
    const loadWaveform = async () => {
      setWaveform({ loading: true });

      try {
        // 计算采样数量：平均每秒 200 个采样点，最少 5000，最多 100000
        const samplesCount = Math.min(Math.max(5000, Math.ceil(mediaDuration * 200)), 100000);

        const result = await window.YUA.ffmpeg.extractWaveform({
          inputPath: audioPath,
          samplesCount,
          resourceId: resource.id,
          workspaceId: resource.workspaceId
        });

        if (!cancelled) {
          setWaveform({ data: result, loading: false });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[SubtitlePlayer] Failed to load waveform:', err);
          setWaveform({ error: err instanceof Error ? err.message : '加载波形失败', loading: false });
        }
      }
    };

    void loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [audioPath, mediaDuration, resource.id, resource.workspaceId]);

  // 加载字幕文件内容（支持 srt、vtt、ass 格式）
  useEffect(() => {
    const data = resource;

    if (!data) {
      setTimeout(() => {
        setIsLoading(false);
        setSubtitleEntries([]);
        setTranslationTracks([]);
        setTranslationTrackMeta([]);
      }, 0);
      return;
    }

    // 通过主进程读取文件内容
    if (data.filePath) {
      setIsLoading(true);
      // 取消之前的保存操作（主轨道 + 翻译轨道）
      debouncedSave.cancel();
      pendingTranslationUpdatesRef.current.clear();
      debouncedFlushTranslationUpdates.cancel();
      window.YUA.file['file:readContent'](data.filePath)
        .then(async (result: any) => {
          if (result.success) {
            const format = parser.detectSubtitleType(result.content || '').replace('.', '') as SubtitleFormat;
            setSubtitleFormat(format);
            try {
              const res = await parser.parseSubtitle(result.content || '');

              const segments: AimSegments[] = res?.segments || [];
              setSubtitleEntries(segments);
              if (data.id) subtitleEntriesResourceIdRef.current = data.id;
              // 翻译轨道由下方的 useEffect 在字幕条目就绪后统一调用 loadTranslationTracks 拉取（有 log，且使用 JSON 中的 st/et）
            } catch (error) {
              console.error(`[SubtitlePlayer] 解析${format.toUpperCase()}文件失败:`, error);
              setSubtitleEntries([]);
              setTranslationTracks([]);
            }
          } else {
            setSubtitleEntries([]);
            setTranslationTracks([]);
            setTranslationTrackMeta([]);
          }
        })
        .catch((error) => {
          console.error('[SubtitlePlayer] 读取文件失败:', error);
          setSubtitleEntries([]);
          setTranslationTracks([]);
          setTranslationTrackMeta([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    setIsLoading(false);
    setSubtitleEntries([]);
    setTranslationTracks([]);
    setTranslationTrackMeta([]);
  }, [resource, debouncedSave, debouncedFlushTranslationUpdates]);

  // 加载字幕的 segments 数据（字级别时间戳，用于卡拉OK高亮）
  useEffect(() => {
    if (!resource?.id) {
      setSegmentsData(null);
      return;
    }
    window.YUA.resource['resource:getSegmentsData']({ subtitleResourceId: resource.id })
      .then((data: AimSegments[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          console.log('[SubtitlePlayer] 已加载 segments 数据，共', data.length, '段');
          setSegmentsData(data);
        } else {
          setSegmentsData(null);
        }
      })
      .catch((err: any) => {
        console.warn('[SubtitlePlayer] 加载 segments 数据失败:', err);
        setSegmentsData(null);
      });
  }, [resource?.id]);

  // 当 segmentsData 和 subtitleEntries 都就绪时，初始化 lastSyncedEntriesRef（保证可靠的 diff 基准）
  const hasSyncedInitialRef = useRef<string | null>(null);
  useEffect(() => {
    if (segmentsData && segmentsData.length > 0 && subtitleEntries.length > 0 && hasSyncedInitialRef.current !== resource?.id) {
      lastSyncedEntriesRef.current = subtitleEntries.map((s) => ({ ...s }));
      hasSyncedInitialRef.current = resource?.id ?? null;
      console.log('[SubtitlePlayer] lastSyncedEntriesRef 已初始化，共', subtitleEntries.length, '条');
    }
  }, [segmentsData, subtitleEntries, resource?.id]);

  // 构建主轨道每个片段的字级别时间戳映射（索引对齐 subtitleEntries）
  const segmentsWordData = useMemo<(WordTimestamp[] | undefined)[]>(() => {
    if (!segmentsData || subtitleEntries.length === 0) return [];
    return subtitleEntries.map((entry) => {
      const st = utils.convertToSeconds(entry.st);
      const et = utils.convertToSeconds(entry.et);
      const match = segmentsData.find((s: any) => {
        const sSt = utils.convertToSeconds(s.st);
        const sEt = utils.convertToSeconds(s.et);
        return Math.abs(sSt - st) < 0.05 && Math.abs(sEt - et) < 0.05;
      });
      if (match?.children?.length) {
        return (match.children as any[]).map((c: any) => ({
          st: utils.convertToSeconds(c.st),
          et: utils.convertToSeconds(c.et),
          text: c.text ?? ''
        }));
      }
      return undefined;
    });
  }, [segmentsData, subtitleEntries]);

  // 构建时间轴用的 wordsMapByTrack：trackId -> (segment id -> WordTimestamp[])
  const timelineWordsMapByTrack = useMemo<Map<string, Map<string, WordTimestamp[]>>>(() => {
    const trackMap = new Map<string, WordTimestamp[]>();
    segmentsWordData.forEach((words, index) => {
      if (words) {
        trackMap.set(`t0-${index}`, words);
      }
    });
    return new Map([['track-0', trackMap]]);
  }, [segmentsWordData]);

  // 用户手动编辑字幕时的回调：同步到本地 state 并触发保存
  const handleSegmentsChange = useCallback(
    (updated: AimSegments[]): void => {
      setSubtitleEntries(updated);
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, updated, subtitleFormat);
      }
    },
    [resource.id, debouncedSave, isLoading, subtitleFormat]
  );

  // 处理翻译开始
  const handleTranslationStart = useCallback(
    (requestId: string) => {
      startTranslation(requestId);
    },
    [startTranslation]
  );

  // 构建轨道数据
  const tracks = useMemo(() => {
    const tracksArray: AimSegments[][] = [subtitleEntries];

    // 添加已保存的翻译轨道
    if (translationTracks.length > 0) {
      tracksArray.push(...translationTracks);
    }

    // 添加正在翻译的临时文本轨道
    if (typingTexts.length > 0) {
      tracksArray.push(typingTexts);
    }

    // 添加编排字幕轨道
    if (subtitleEditTracks.length > 0) {
      tracksArray.push(...subtitleEditTracks);
    }

    return tracksArray;
  }, [subtitleEntries, translationTracks, typingTexts, subtitleEditTracks]);

  // 时间轴视图数据
  const timelineTracks = useMemo(() => {
    const labels = ['原文'];
    if (translationTracks.length > 0) {
      labels.push(...translationTracks.map((_, idx) => `译文 ${idx + 1}`));
    }
    if (typingTexts.length > 0) {
      labels.push('翻译中');
    }
    if (subtitleEditTracks.length > 0) {
      labels.push(...subtitleEditTrackMeta.map((m) => m.label));
    }
    // 类型适配：时间轴工具内部定义的 AimSegments 结构与外部包的类型略有差异，运行时兼容，这里进行类型断言
    return aimTracksToTimelineTracks(tracks as any, labels);
  }, [tracks, translationTracks, typingTexts, subtitleEditTracks, subtitleEditTrackMeta]);

  // 时间轴高亮的片段 ID
  const timelineHighlightIds = useMemo(() => {
    return indicesToIds(translatingChunks, 0); // 主轨道的翻译中片段
  }, [translatingChunks]);

  // 编排轨道在 tracks 中的起始索引：1(主) + translationTracks.length + (typingTexts ? 1 : 0)
  const subtitleEditTrackStartIndex = 1 + translationTracks.length + (typingTexts.length > 0 ? 1 : 0);

  // 处理时间轴文本编辑（主轨道写回字幕文件，翻译/编排轨道写回 JSON）
  const handleTimelineTextChange = useCallback(
    (segment: TimelineSegment, trackId: string, newText: string) => {
      const parsed = parseSegmentId(segment.id);
      if (!parsed) return;
      const { segmentIndex } = parsed;

      const trackIndexMatch = trackId.match(/^track-(\d+)$/);
      if (!trackIndexMatch) return;
      const trackIndex = parseInt(trackIndexMatch[1], 10);

      if (trackIndex === 0) {
        // 主轨道（track-0）
        const updated = subtitleEntries.map((item, i) => {
          if (i === segmentIndex) return { ...item, text: newText };
          return item;
        });
        setSubtitleEntries(updated);
        if (resource.id && !isLoading) {
          debouncedSave(resource.id, updated, subtitleFormat);
        }
      } else if (trackIndex > 0 && trackIndex <= translationTracks.length) {
        // 翻译轨道：更新本地 state，防抖后写回翻译 JSON
        const translationIndex = trackIndex - 1;
        const meta = translationTrackMeta[translationIndex];
        const updatedTracks = translationTracks.map((track, idx) => {
          if (idx === translationIndex) {
            return track.map((item, i) => {
              if (i === segmentIndex) return { ...item, text: newText };
              return item;
            });
          }
          return track;
        });
        setTranslationTracks(updatedTracks);
        if (meta?.resourceId) {
          const key = `${meta.resourceId}-${segmentIndex}`;
          const prev = pendingTranslationUpdatesRef.current.get(key);
          pendingTranslationUpdatesRef.current.set(key, {
            translationResourceId: meta.resourceId,
            segmentIndex,
            patch: { ...prev?.patch, text: newText }
          });
          debouncedFlushTranslationUpdates();
        }
      } else if (trackIndex >= subtitleEditTrackStartIndex) {
        // 编排字幕轨道
        const editIndex = trackIndex - subtitleEditTrackStartIndex;
        const meta = subtitleEditTrackMeta[editIndex];
        if (!meta) return;
        const updatedTracks = subtitleEditTracks.map((track, idx) => {
          if (idx === editIndex) {
            return track.map((item, i) => (i === segmentIndex ? { ...item, text: newText } : item));
          }
          return track;
        });
        setSubtitleEditTracks(updatedTracks);
        if (meta.resourceId) {
          const key = `${meta.resourceId}-${segmentIndex}`;
          const prev = pendingTranslationUpdatesRef.current.get(key);
          pendingTranslationUpdatesRef.current.set(key, {
            translationResourceId: meta.resourceId,
            segmentIndex,
            patch: { ...prev?.patch, text: newText }
          });
          debouncedFlushTranslationUpdates();
        }
      }
    },
    [
      subtitleEntries,
      translationTracks,
      translationTrackMeta,
      subtitleEditTracks,
      subtitleEditTrackMeta,
      subtitleEditTrackStartIndex,
      resource.id,
      isLoading,
      debouncedSave,
      debouncedFlushTranslationUpdates,
      subtitleFormat
    ]
  );

  // 处理列表模式非主轨道的文本编辑
  const handleListTrackTextChange = useCallback(
    (trackIndex: number, segmentIndex: number, newText: string) => {
      if (trackIndex === 0) {
        // 主轨道
        const updated = subtitleEntries.map((item, i) => (i === segmentIndex ? { ...item, text: newText } : item));
        setSubtitleEntries(updated);
        if (resource.id && !isLoading) {
          debouncedSave(resource.id, updated, subtitleFormat);
        }
      } else if (trackIndex > 0 && trackIndex <= translationTracks.length) {
        const translationIndex = trackIndex - 1;
        const meta = translationTrackMeta[translationIndex];
        const updatedTracks = translationTracks.map((track, idx) => (idx === translationIndex ? track.map((item, i) => (i === segmentIndex ? { ...item, text: newText } : item)) : track));
        setTranslationTracks(updatedTracks);
        if (meta?.resourceId) {
          const key = `${meta.resourceId}-${segmentIndex}`;
          const prev = pendingTranslationUpdatesRef.current.get(key);
          pendingTranslationUpdatesRef.current.set(key, {
            translationResourceId: meta.resourceId,
            segmentIndex,
            patch: { ...prev?.patch, text: newText }
          });
          debouncedFlushTranslationUpdates();
        }
      }
    },
    [subtitleEntries, translationTracks, translationTrackMeta, resource.id, isLoading, debouncedSave, debouncedFlushTranslationUpdates, subtitleFormat]
  );

  // 处理时间轴时间变更（拖拽移动或调整边缘）
  const handleTimelineTimeChange = useCallback(
    (segment: TimelineSegment, trackId: string, newStartTime: number, newEndTime: number) => {
      const parsed = parseSegmentId(segment.id);
      if (!parsed) return;

      const { segmentIndex } = parsed;

      // 格式化时间为字幕格式 (HH:MM:SS,mmm)
      const formatTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
      };

      // 解析轨道索引：track-0 -> 0, track-1 -> 1, ...
      const trackIndexMatch = trackId.match(/^track-(\d+)$/);
      if (!trackIndexMatch) return;
      const trackIndex = parseInt(trackIndexMatch[1], 10);

      if (trackIndex === 0) {
        // 主轨道（track-0）
        const originalEntry = subtitleEntries[segmentIndex];
        const originalSt = utils.convertToSeconds(originalEntry.st);
        const originalEt = utils.convertToSeconds(originalEntry.et);

        const updated = subtitleEntries.map((item, i) => {
          if (i === segmentIndex) {
            return {
              ...item,
              st: formatTime(newStartTime),
              et: formatTime(newEndTime)
            };
          }
          return item;
        });
        setSubtitleEntries(updated);

        // 同步更新 segmentsData 中的字级别时间戳
        if (segmentsDataRef.current) {
          const updatedSegments = shiftSegmentTime(segmentsDataRef.current, originalSt, originalEt, newStartTime, newEndTime);
          if (updatedSegments) {
            segmentsDataRef.current = updatedSegments;
            setSegmentsData(updatedSegments);
          }
        }

        if (resource.id && !isLoading) {
          debouncedSave(resource.id, updated, subtitleFormat);
        }
      } else if (trackIndex > 0 && trackIndex <= translationTracks.length) {
        // 翻译轨道（track-1, track-2, ...）：更新本地 state，防抖后写回翻译 JSON
        const translationIndex = trackIndex - 1;
        const meta = translationTrackMeta[translationIndex];
        const newSt = formatTime(newStartTime);
        const newEt = formatTime(newEndTime);
        const updatedTracks = translationTracks.map((track, idx) => {
          if (idx === translationIndex) {
            return track.map((item, i) => {
              if (i === segmentIndex) {
                return { ...item, st: newSt, et: newEt };
              }
              return item;
            });
          }
          return track;
        });
        setTranslationTracks(updatedTracks);
        if (meta?.resourceId) {
          const key = `${meta.resourceId}-${segmentIndex}`;
          const prev = pendingTranslationUpdatesRef.current.get(key);
          pendingTranslationUpdatesRef.current.set(key, {
            translationResourceId: meta.resourceId,
            segmentIndex,
            patch: { ...prev?.patch, st: newSt, et: newEt }
          });
          debouncedFlushTranslationUpdates();
        }
      } else if (trackIndex >= subtitleEditTrackStartIndex) {
        // 编排字幕轨道
        const editIndex = trackIndex - subtitleEditTrackStartIndex;
        const meta = subtitleEditTrackMeta[editIndex];
        const newSt = formatTime(newStartTime);
        const newEt = formatTime(newEndTime);
        const updatedTracks = subtitleEditTracks.map((track, idx) => {
          if (idx === editIndex) {
            return track.map((item, i) => (i === segmentIndex ? { ...item, st: newSt, et: newEt } : item));
          }
          return track;
        });
        setSubtitleEditTracks(updatedTracks);
        if (meta?.resourceId) {
          const key = `${meta.resourceId}-${segmentIndex}`;
          const prev = pendingTranslationUpdatesRef.current.get(key);
          pendingTranslationUpdatesRef.current.set(key, {
            translationResourceId: meta.resourceId,
            segmentIndex,
            patch: { ...prev?.patch, st: newSt, et: newEt }
          });
          debouncedFlushTranslationUpdates();
        }
      }
    },
    [
      subtitleEntries,
      translationTracks,
      translationTrackMeta,
      subtitleEditTracks,
      subtitleEditTrackMeta,
      subtitleEditTrackStartIndex,
      resource.id,
      isLoading,
      debouncedSave,
      debouncedFlushTranslationUpdates,
      subtitleFormat
    ]
  );

  // 统一：往前合并（仅主轨道 track-0）
  const handleMergePrev = useCallback(
    ({ trackId, segmentIndex }: { trackId: string; segmentIndex: number }) => {
      if (trackId !== 'track-0' || segmentIndex <= 0) return;
      const seg1 = subtitleEntries[segmentIndex - 1];
      const seg2 = subtitleEntries[segmentIndex];
      const merged = utils.mergeAimSegmentRange(subtitleEntries, segmentIndex - 1, segmentIndex);
      setSubtitleEntries(merged);
      // 同步 segments 合并
      if (segmentsDataRef.current && seg1 && seg2) {
        const mergedEntry = merged[segmentIndex - 1];
        if (mergedEntry) {
          const updatedSegs = mergeSegmentsChildren(segmentsDataRef.current, mergedEntry, seg1.st, seg2.et);
          if (updatedSegs) {
            segmentsDataRef.current = updatedSegs;
            setSegmentsData(updatedSegs);
            lastSyncedEntriesRef.current = merged.map((s) => ({ ...s }));
          }
        }
      }
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, merged, subtitleFormat);
      }
    },
    [subtitleEntries, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 统一：往后合并（仅主轨道 track-0）
  const handleMergeNext = useCallback(
    ({ trackId, segmentIndex }: { trackId: string; segmentIndex: number }) => {
      if (trackId !== 'track-0') return;
      if (segmentIndex < 0 || segmentIndex >= subtitleEntries.length - 1) return;

      const seg1 = subtitleEntries[segmentIndex];
      const seg2 = subtitleEntries[segmentIndex + 1];
      const merged = utils.mergeAimSegmentRange(subtitleEntries, segmentIndex, segmentIndex + 1);
      setSubtitleEntries(merged);
      // 同步 segments 合并
      if (segmentsDataRef.current && seg1 && seg2) {
        const mergedEntry = merged[segmentIndex];
        if (mergedEntry) {
          const updatedSegs = mergeSegmentsChildren(segmentsDataRef.current, mergedEntry, seg1.st, seg2.et);
          if (updatedSegs) {
            segmentsDataRef.current = updatedSegs;
            setSegmentsData(updatedSegs);
            lastSyncedEntriesRef.current = merged.map((s) => ({ ...s }));
          }
        }
      }
      if (resource.id && !isLoading) {
        debouncedSave(resource.id, merged, subtitleFormat);
      }
    },
    [subtitleEntries, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 在轨道空白处新增字幕片段：主轨道 track-0 写回字幕文件，翻译轨道写回翻译 JSON
  const handleAddSegment = useCallback(
    async (trackId: string, startTime: number, endTime: number, text: string) => {
      if (!resource.id || isLoading) return;
      const st = formatSecondsToTime(startTime);
      const et = formatSecondsToTime(endTime);
      const trackIndexMatch = trackId.match(/^track-(\d+)$/);
      if (!trackIndexMatch) return;
      const trackIndex = parseInt(trackIndexMatch[1], 10);

      if (trackIndex === 0) {
        const newSeg: AimSegments = { st, et, text };
        let insertIndex = subtitleEntries.length;
        for (let i = 0; i < subtitleEntries.length; i++) {
          if (parseTimeToSeconds(subtitleEntries[i].st) > startTime) {
            insertIndex = i;
            break;
          }
        }
        const updated = [...subtitleEntries.slice(0, insertIndex), newSeg, ...subtitleEntries.slice(insertIndex)];
        setSubtitleEntries(updated);
        debouncedSave(resource.id, updated, subtitleFormat);
        return;
      }

      if (trackIndex > 0 && trackIndex <= translationTracks.length) {
        const translationIndex = trackIndex - 1;
        const meta = translationTrackMeta[translationIndex];
        if (!meta?.resourceId) return;
        const trackSegments = translationTracks[translationIndex];
        let insertIndex = trackSegments.length;
        for (let i = 0; i < trackSegments.length; i++) {
          if (parseTimeToSeconds(trackSegments[i].st) > startTime) {
            insertIndex = i;
            break;
          }
        }
        const res = await window.YUA.ai.insertTranslationSegment({
          translationResourceId: meta.resourceId,
          insertIndex,
          segment: { st, et, text }
        });
        if (!res.success) {
          console.warn('[SubtitlePlayer] 翻译轨道新增片段失败:', res.message);
          return;
        }
        const newSeg: AimSegments = { st, et, text };
        const updatedTrack = [...trackSegments.slice(0, insertIndex), newSeg, ...trackSegments.slice(insertIndex)];
        setTranslationTracks((prev) => prev.map((t, idx) => (idx === translationIndex ? updatedTrack : t)));
        return;
      }

      // 编排字幕轨道
      if (trackIndex >= subtitleEditTrackStartIndex) {
        const editIndex = trackIndex - subtitleEditTrackStartIndex;
        const meta = subtitleEditTrackMeta[editIndex];
        if (!meta?.resourceId) return;
        const trackSegments = subtitleEditTracks[editIndex] || [];
        let insertIndex = trackSegments.length;
        for (let i = 0; i < trackSegments.length; i++) {
          if (parseTimeToSeconds(trackSegments[i].st) > startTime) {
            insertIndex = i;
            break;
          }
        }
        const res = await window.YUA.ai.insertTranslationSegment({
          translationResourceId: meta.resourceId,
          insertIndex,
          segment: { st, et, text }
        });
        if (!res.success) {
          console.warn('[SubtitlePlayer] 编排轨道新增片段失败:', res.message);
          return;
        }
        const newSeg: AimSegments = { st, et, text };
        const updatedTrack = [...trackSegments.slice(0, insertIndex), newSeg, ...trackSegments.slice(insertIndex)];
        setSubtitleEditTracks((prev) => prev.map((t, idx) => (idx === editIndex ? updatedTrack : t)));
      }
    },
    [subtitleEntries, translationTracks, translationTrackMeta, subtitleEditTracks, subtitleEditTrackMeta, subtitleEditTrackStartIndex, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 删除选中的字幕块（快捷键 Delete/Backspace 或选中块上的删除按钮）
  const handleDeleteSegment = useCallback(
    (segment: TimelineSegment, trackId: string) => {
      const parsed = parseSegmentId(segment.id);
      if (!parsed || !resource.id || isLoading) return;
      const { trackIndex, segmentIndex } = parsed;
      if (trackIndex === 0) {
        const updated = subtitleEntries.filter((_, i) => i !== segmentIndex);
        setSubtitleEntries(updated);
        debouncedSave(resource.id, updated, subtitleFormat);
        return;
      }
      if (trackIndex > 0 && trackIndex <= translationTrackMeta.length) {
        const meta = translationTrackMeta[trackIndex - 1];
        if (!meta?.resourceId) return;
        window.YUA.ai
          .deleteTranslationSegment({ translationResourceId: meta.resourceId, segmentIndex })
          .then((res) => {
            if (!res.success) {
              console.warn('[SubtitlePlayer] 翻译轨道删除片段失败:', res.message);
              return;
            }
            setTranslationTracks((prev) => prev.map((t, idx) => (idx === trackIndex - 1 ? t.filter((_, i) => i !== segmentIndex) : t)));
          })
          .catch((err) => console.error('[SubtitlePlayer] 删除翻译片段失败:', err));
        return;
      }

      // 编排字幕轨道
      if (trackIndex >= subtitleEditTrackStartIndex) {
        const editIndex = trackIndex - subtitleEditTrackStartIndex;
        const meta = subtitleEditTrackMeta[editIndex];
        if (!meta?.resourceId) return;
        window.YUA.ai
          .deleteTranslationSegment({ translationResourceId: meta.resourceId, segmentIndex })
          .then((res) => {
            if (!res.success) {
              console.warn('[SubtitlePlayer] 编排轨道删除片段失败:', res.message);
              return;
            }
            setSubtitleEditTracks((prev) => prev.map((t, idx) => (idx === editIndex ? t.filter((_, i) => i !== segmentIndex) : t)));
          })
          .catch((err) => console.error('[SubtitlePlayer] 删除编排片段失败:', err));
      }
    },
    [subtitleEntries, translationTrackMeta, subtitleEditTrackMeta, subtitleEditTrackStartIndex, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 删除字幕轨道（翻译轨道或编排字幕轨道）- 永久删除
  const handleDeleteSubtitleTrack = useCallback(
    async (trackId: string) => {
      const trackIndexMatch = trackId.match(/^track-(\d+)$/);
      if (!trackIndexMatch) return;
      const trackIndex = parseInt(trackIndexMatch[1], 10);

      if (trackIndex === 0) return;

      // 翻译轨道
      if (trackIndex > 0 && trackIndex <= translationTrackMeta.length) {
        const translationIndex = trackIndex - 1;
        const meta = translationTrackMeta[translationIndex];
        if (!meta?.resourceId) {
          console.warn(`[SubtitlePlayer] 无法删除轨道 ${trackId}：找不到资源ID`);
          return;
        }
        try {
          await window.YUA.resource.deleteResourcePermanently({ id: meta.resourceId });
          await loadTranslationTracks();
        } catch (error) {
          console.error(`[SubtitlePlayer] 删除翻译轨道失败:`, error);
          alert('删除翻译轨道失败，请重试');
        }
        return;
      }

      // 编排字幕轨道
      console.log('[SubtitlePlayer] handleDeleteSubtitleTrack:', {
        trackId,
        trackIndex,
        subtitleEditTrackStartIndex,
        subtitleEditTrackMeta,
        isEditTrack: trackIndex >= subtitleEditTrackStartIndex
      });
      if (trackIndex >= subtitleEditTrackStartIndex) {
        const editIndex = trackIndex - subtitleEditTrackStartIndex;
        const meta = subtitleEditTrackMeta[editIndex];
        console.log('[SubtitlePlayer] 删除编排字幕轨道:', { editIndex, meta });
        if (!meta?.trackId) {
          console.warn('[SubtitlePlayer] 无法删除编排字幕轨道：trackId 不存在', { editIndex, meta, subtitleEditTrackMeta });
          return;
        }
        try {
          // 调用 resource:deleteSubtitleEditTrack 删除配置文件和更新项目元数据
          console.log('[SubtitlePlayer] 调用 resource:deleteSubtitleEditTrack:', { parentResourceId: resource.id, trackId: meta.trackId });
          const result = await window.YUA.resource['resource:deleteSubtitleEditTrack']({
            parentResourceId: resource.id,
            trackId: meta.trackId
          });
          console.log('[SubtitlePlayer] 删除结果:', result);
          if (!result.success) {
            console.warn(`[SubtitlePlayer] 删除编排字幕轨道失败: ${result.error}`);
            return;
          }
          await loadSubtitleEditTracks();
        } catch (error) {
          console.error(`[SubtitlePlayer] 删除编排字幕轨道失败:`, error);
          alert('删除字幕轨道失败，请重试');
        }
      }
    },
    [translationTrackMeta, subtitleEditTrackMeta, subtitleEditTrackStartIndex, loadTranslationTracks, loadSubtitleEditTracks]
  );

  // 删除TTS轨道
  const handleDeleteTTSTrack = useCallback(
    async (ttsTrackId: string) => {
      try {
        resetSynthesis(ttsTrackId);

        // 独立 TTS 轨道：从列表中移除并删除数据库记录
        if (ttsTrackId.startsWith('tts-')) {
          const trackConfig = standaloneTTSTracks.find((t) => t.id === ttsTrackId);
          setStandaloneTTSTracks((prev) => prev.filter((t) => t.id !== ttsTrackId));

          // 删除数据库记录（永久删除）
          if (trackConfig?.resourceId) {
            try {
              await window.YUA.resource.deleteResourcePermanently({ id: trackConfig.resourceId });
              console.log(`[SubtitlePlayer] 已永久删除 TTS 轨道数据库记录 ${trackConfig.resourceId}`);
            } catch (dbErr) {
              console.error('[SubtitlePlayer] 删除 TTS 轨道数据库记录失败:', dbErr);
            }
          }
        }

        // 调用 resource:deleteTTSTrack 删除配置文件、音频目录和更新项目元数据
        if (resource.id) {
          const result = await window.YUA.resource['resource:deleteTTSTrack']({
            parentResourceId: resource.id,
            trackId: ttsTrackId
          });
          if (!result.success) {
            console.warn(`[SubtitlePlayer] 删除TTS轨道项目文件失败: ${result.error}`);
          }
        }

        console.log(`[SubtitlePlayer] 已删除TTS轨道 ${ttsTrackId}`);
      } catch (error) {
        console.error(`[SubtitlePlayer] 删除TTS轨道失败:`, error);
      }
    },
    [resource.id, resetSynthesis, standaloneTTSTracks]
  );

  // 添加编排字幕轨道 — 直接创建，不弹窗
  const handleAddSubtitleTrack = useCallback(async () => {
    const trackName = `字幕 ${translationTracks.length + subtitleEditTracks.length + 2}`;
    try {
      await window.YUA.resource['resource:createSubtitleEditTrack']({
        parentResourceId: resource.id,
        title: trackName
      });
      await loadSubtitleEditTracks();
    } catch (err) {
      console.error('[SubtitlePlayer] 创建编排字幕轨道失败:', err);
    }
  }, [translationTracks.length, subtitleEditTracks.length, resource.id, loadSubtitleEditTracks]);

  const handleConfirmAddSubtitleTrack = useCallback(async () => {
    const trackName = subtitleEditNameDialog.name.trim();
    if (!trackName) return;
    setSubtitleEditNameDialog({ open: false, name: '' });
    try {
      await window.YUA.resource['resource:createSubtitleEditTrack']({
        parentResourceId: resource.id,
        title: trackName
      });
      await loadSubtitleEditTracks();
    } catch (err) {
      console.error('[SubtitlePlayer] 创建编排字幕轨道失败:', err);
    }
  }, [resource.id, subtitleEditNameDialog.name, loadSubtitleEditTracks]);

  // 添加独立 TTS 语音轨道 — 直接创建，不弹窗
  const [ttsSettingsTrackId, setTTSSettingsTrackId] = useState<string | null>(null);
  /** TTS 批量文本输入面板打开的轨道 ID */
  const [ttsBatchInputTrackId, setTTSBatchInputTrackId] = useState<string | null>(null);

  const handleAddTTSTrack = useCallback(async () => {
    const trackName = `配音 ${standaloneTTSTracks.length + 1}`;

    // 读取当前 TTS 默认配置
    let voiceName = 'zh-CN-XiaoxiaoNeural';
    let rate = 20;
    let pitch = 0;
    let autoTrimSilence = true;
    try {
      const stored = localStorage.getItem('tts-synthesizer-preferences');
      if (stored) {
        const prefs = JSON.parse(stored);
        if (prefs.selectedVoice) voiceName = prefs.selectedVoice;
        if (prefs.rate != null) rate = prefs.rate;
        if (prefs.pitch != null) pitch = prefs.pitch;
        if (prefs.autoTrimSilence != null) autoTrimSilence = prefs.autoTrimSilence;
      }
    } catch {
      /* ignore */
    }

    try {
      // 持久化到项目文件夹（data/tracks/）
      const result = await window.YUA.resource['resource:createTTSTrack']({
        parentResourceId: resource.id,
        title: trackName,
        voiceName,
        rate,
        pitch,
        autoTrimSilence
      });
      // 使用后端返回的 trackId（已经是 tts-xxx 格式）
      const trackId = result.trackId;
      const newTrack = { id: trackId, label: trackName, voiceName, rate, pitch, autoTrimSilence, resourceId: result.id, configured: false };
      setStandaloneTTSTracks((prev) => [...prev, newTrack]);
    } catch (err) {
      console.error('[SubtitlePlayer] 创建 TTS 轨道失败:', err);
    }
  }, [standaloneTTSTracks.length, resource.id]);

  // 打开 TTS 设置
  const handleOpenTTSSettings = useCallback((ttsTrackId: string) => {
    setTTSSettingsTrackId(ttsTrackId);
  }, []);

  // 打开 TTS 批量文本输入面板（仅限独立 TTS 轨道）
  const handleOpenTTSBatchInput = useCallback((ttsTrackId: string) => {
    // 仅限独立 TTS 轨道（以 'tts-' 开头）
    if (ttsTrackId.startsWith('tts-')) {
      setTTSBatchInputTrackId(ttsTrackId);
    }
  }, []);

  // TTS 语音标签映射
  const ttsVoiceLabels = useMemo(() => {
    const labels = new Map<string, string>();
    try {
      const stored = localStorage.getItem('tts-synthesizer-preferences');
      if (stored) {
        const prefs = JSON.parse(stored);
        const voiceName = prefs.selectedVoice;
        if (voiceName) {
          const shortLabel =
            voiceName
              .replace(/Neural$/, '')
              .split('-')
              .pop() || voiceName;
          labels.set('main', shortLabel);
          translationTrackMeta.forEach((meta) => {
            labels.set(meta.languageCode, shortLabel);
          });
        }
      }
    } catch {
      // ignore
    }
    // 独立 TTS 轨道各自有配置
    standaloneTTSTracks.forEach((t) => {
      const shortLabel =
        t.voiceName
          .replace(/Neural$/, '')
          .split('-')
          .pop() || t.voiceName;
      labels.set(t.id, shortLabel);
    });
    return labels;
  }, [translationTrackMeta, standaloneTTSTracks]);

  // 删除单个TTS片段（从内存移除，并从 history 的 orderList 等中移除该 ID）
  const handleDeleteTTSSegment = useCallback(
    (ttsTrackId: string, index: number) => {
      const item = synthesizedItemsByTrack.get(ttsTrackId)?.get(index);
      removeSynthesizedItem(ttsTrackId, index, item?.md5);
    },
    [removeSynthesizedItem, synthesizedItemsByTrack]
  );

  // TTS 块时间变更（拖拽移动或边缘调整后），写回 history 并更新本地状态
  const handleTTSTimeChange = useCallback(
    (ttsTrackId: string, index: number, newStartTime: number, newEndTime: number) => {
      void updateTTSSegmentTimes(ttsTrackId, index, newStartTime, newEndTime);
    },
    [updateTTSSegmentTimes]
  );

  // TTS 块文本变更（内联编辑后），重新合成该片段
  const handleTTSTextChange = useCallback(
    async (ttsTrackId: string, index: number, newText: string) => {
      if (!newText.trim()) return;

      const trackConfig = standaloneTTSTracks.find((t) => t.id === ttsTrackId);
      if (!trackConfig) return;

      // 获取原片段的时间信息
      const existingItem = synthesizedItemsByTrack.get(ttsTrackId)?.get(index);
      if (!existingItem) return;

      const startTime = existingItem.startTime ?? 0;
      const endTime = existingItem.endTime ?? startTime + 5;

      // 将时间转换为字幕格式 (HH:MM:SS,mmm)
      const formatTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };

      try {
        await startSynthesis(
          { voiceName: trackConfig.voiceName, rate: trackConfig.rate, pitch: trackConfig.pitch, autoTrimSilence: trackConfig.autoTrimSilence },
          {
            trackId: ttsTrackId,
            segments: [{ st: formatTime(startTime), et: formatTime(endTime), text: newText.trim() }],
            startIndex: index
          }
        );
      } catch (err) {
        console.error('[SubtitlePlayer] TTS 片段文本更新合成失败:', err);
      }
    },
    [standaloneTTSTracks, synthesizedItemsByTrack, startSynthesis]
  );

  // 独立 TTS 轨道：点击空白添加片段 → 检查是否已配置，未配置则先打开设置面板
  const handleAddTTSSegment = useCallback(
    (ttsTrackId: string, startTime: number, endTime: number) => {
      const trackConfig = standaloneTTSTracks.find((t) => t.id === ttsTrackId);
      // 如果轨道未配置，先打开设置面板
      if (trackConfig && !trackConfig.configured) {
        setTTSSettingsTrackId(ttsTrackId);
        return;
      }
      setPendingTTSSegment({ trackId: ttsTrackId, startTime, endTime });
    },
    [standaloneTTSTracks]
  );

  // 独立 TTS 轨道：inline 输入框确认 → 立即合成
  const handleConfirmTTSSegmentInline = useCallback(
    async (trackId: string, startTime: number, endTime: number, text: string) => {
      if (!text.trim()) return;
      setPendingTTSSegment(null);

      const trackConfig = standaloneTTSTracks.find((t) => t.id === trackId);
      if (!trackConfig) return;

      // 计算新片段的索引：基于当前轨道已有的片段数量
      const existingItems = synthesizedItemsByTrack.get(trackId);
      const newIndex = existingItems ? existingItems.size : 0;

      // 将时间转换为字幕格式 (HH:MM:SS,mmm)
      const formatTime = (seconds: number): string => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };

      try {
        await startSynthesis(
          { voiceName: trackConfig.voiceName, rate: trackConfig.rate, pitch: trackConfig.pitch, autoTrimSilence: trackConfig.autoTrimSilence },
          {
            trackId,
            segments: [{ st: formatTime(startTime), et: formatTime(endTime), text: text.trim() }],
            startIndex: newIndex
          }
        );
        // startTime/endTime 已在 startSynthesis 中设置，无需再调用 updateTTSSegmentTimes
      } catch (err) {
        console.error('[SubtitlePlayer] TTS 片段合成失败:', err);
      }
    },
    [standaloneTTSTracks, startSynthesis, synthesizedItemsByTrack]
  );

  // 取消 inline 输入
  const handleCancelTTSSegment = useCallback(() => {
    setPendingTTSSegment(null);
  }, []);

  // 独立 TTS 轨道：双击已有块编辑文本 → 弹出编辑输入
  const handleTTSBlockDoubleClick = useCallback((ttsTrackId: string, item: TimelineTTSAudioItem) => {
    setTTSSegmentDialog({
      open: true,
      trackId: ttsTrackId,
      text: item.text ?? '',
      startTime: item.startTime,
      endTime: item.endTime,
      editIndex: item.index
    });
  }, []);

  // 确认 TTS 片段文本输入（对话框编辑已有块时） → 立即合成
  const handleConfirmTTSSegment = useCallback(async () => {
    const { trackId, text, startTime, endTime, editIndex } = ttsSegmentDialog;
    if (!text.trim()) return;
    setTTSSegmentDialog((prev) => ({ ...prev, open: false }));

    const trackConfig = standaloneTTSTracks.find((t) => t.id === trackId);
    if (!trackConfig) return;

    // 编辑已有块时使用 editIndex，否则计算新索引
    const targetIndex = editIndex ?? synthesizedItemsByTrack.get(trackId)?.size ?? 0;

    // 将时间转换为字幕格式 (HH:MM:SS,mmm)
    const formatTime = (seconds: number): string => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.round((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };

    try {
      await startSynthesis(
        { voiceName: trackConfig.voiceName, rate: trackConfig.rate, pitch: trackConfig.pitch, autoTrimSilence: trackConfig.autoTrimSilence },
        {
          trackId,
          segments: [{ st: formatTime(startTime), et: formatTime(endTime), text: text.trim() }],
          startIndex: targetIndex
        }
      );
      // startTime/endTime 已在 startSynthesis 中设置，无需再调用 updateTTSSegmentTimes
    } catch (err) {
      console.error('[SubtitlePlayer] TTS 片段合成失败:', err);
    }
  }, [ttsSegmentDialog, standaloneTTSTracks, startSynthesis, synthesizedItemsByTrack]);

  // ---- 剪辑轨道 ----

  /** 标注轨道数据（传给 SubtitleTimeline） */
  const annotationTrackData = useMemo((): AnnotationTrackData | undefined => {
    if (annotations.length === 0) return undefined;
    return {
      id: 'annotation-track-main',
      label: '标注',
      annotations
    };
  }, [annotations]);

  /** 标注轨道回调集合 */
  const annotationCallbacks = useMemo(
    (): AnnotationTrackCallbacks => ({
      onAnnotationClick: (annotation) => {
        // 点击标注时跳转到对应时间
        onSeek?.(annotation.startTime);
      },
      onAnnotationDelete: (annotationId) => {
        removeAnnotation(annotationId);
      },
      onAnnotationUpdate: (annotationId, patch) => {
        updateAnnotation(annotationId, patch);
      }
    }),
    [onSeek, removeAnnotation, updateAnnotation]
  );

  /** 剪辑轨道数据（传给 SubtitleTimeline） */
  const clipTrackData = useMemo((): ClipTrackData | undefined => {
    if (clipSegments.length === 0) return undefined;
    return {
      id: 'clip-track-main',
      label: '剪辑',
      clips: clipSegments,
      sourceDuration: mediaDuration || 0
    };
  }, [clipSegments, mediaDuration]);

  /** 剪辑轨道回调集合 */
  const clipCallbacks = useMemo(
    (): ClipTrackCallbacks => ({
      onClipCut: (time: number) => {
        setClipSegments((prev) => ClipSequence.cutAtTime(prev, time));
      },
      onClipDelete: (clipId: string) => {
        setClipSegments((prev) => ClipSequence.deleteClip(prev, clipId));
      },
      onClipRestore: (clipId: string) => {
        setClipSegments((prev) => ClipSequence.restoreClip(prev, clipId));
      },
      onClipSpeedChange: (clipId: string, rate: number) => {
        setClipSegments((prev) => ClipSequence.changeSpeed(prev, clipId, rate));
      },
      onClipToggleDisabled: (clipId: string) => {
        setClipSegments((prev) => ClipSequence.toggleDisabled(prev, clipId));
      },
      onClipLabelChange: (clipId: string, label: string) => {
        setClipSegments((prev) => ClipSequence.changeLabel(prev, clipId, label));
      },
      onClipMove: (clipId: string, targetOrder: number) => {
        setClipSegments((prev) => ClipSequence.moveClipToOrder(prev, clipId, targetOrder));
      },
      onClipReorder: (orderedIds: string[]) => {
        setClipSegments((prev) => ClipSequence.reorderByIds(prev, orderedIds));
      }
    }),
    []
  );

  /** 媒体轨道回调集合 */
  const mediaCallbacks = useMemo(
    (): MediaTrackCallbacks => ({
      onSourceAdd: (sources) => {
        // 添加媒体源到映射表
        setMediaSources((prev) => {
          const newMap = new Map(prev);
          sources.forEach((source) => {
            newMap.set(source.id, source);
          });
          return newMap;
        });
      },
      onTrackAdd: () => {
        // 添加新的媒体轨道
        const newTrack = MediaSequence.createTrack(`媒体轨道 ${mediaTracks.length + 1}`, mediaTracks.length);
        setMediaTracks((prev) => [...prev, newTrack]);
      },
      onTrackDelete: async (trackId: string) => {
        // 从后端删除媒体轨道（项目文件夹存储）
        if (resource.id) {
          try {
            const result = await window.YUA.resource['resource:deleteMediaTrack']({
              parentResourceId: resource.id,
              trackId
            });
            if (result.success) {
              console.log('[MediaTrack] 已删除媒体轨道:', trackId);
            } else {
              console.warn('[MediaTrack] 删除媒体轨道失败:', result.error);
            }
          } catch (error) {
            console.error('[MediaTrack] 删除媒体轨道失败:', error);
          }
        }
        // 从本地状态移除
        setMediaTracks((prev) => prev.filter((t) => t.id !== trackId));
      },
      onTrackReorder: (trackIds: string[]) => {
        setMediaTracks((prev) => {
          const trackMap = new Map(prev.map((t) => [t.id, t]));
          return trackIds
            .map((id) => trackMap.get(id))
            .filter((t): t is MediaTrackData => !!t)
            .map((t, index) => ({ ...t, zIndex: index }));
        });
      },
      onSegmentAdd: (trackId, segment) => {
        setMediaTracks((prev) => {
          // 如果没有轨道或找不到对应轨道，创建一个新轨道
          if (prev.length === 0 || !prev.find((t) => t.id === trackId)) {
            const newTrack = MediaSequence.createTrack('媒体轨道 1', 0);
            const newSegment = MediaSequence.createSegment(segment.sourceId, segment.timelineStart, segment.timelineEnd, segment);
            return [{ ...newTrack, segments: [newSegment] }];
          }

          return prev.map((track) => {
            if (track.id !== trackId) return track;
            const newSegment = MediaSequence.createSegment(segment.sourceId, segment.timelineStart, segment.timelineEnd, segment);
            return { ...track, segments: [...track.segments, newSegment] };
          });
        });
      },
      onSegmentDelete: (trackId, segmentId) => {
        setMediaTracks((prev) =>
          prev.map((track) => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              segments: MediaSequence.deleteSegment(track.segments, segmentId)
            };
          })
        );
      },
      onSegmentRestore: (trackId, segmentId) => {
        setMediaTracks((prev) =>
          prev.map((track) => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              segments: MediaSequence.restoreSegment(track.segments, segmentId)
            };
          })
        );
      },
      onSegmentMove: (trackId, segmentId, newTimelineStart) => {
        setMediaTracks((prev) =>
          prev.map((track) => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              segments: MediaSequence.moveSegment(track.segments, segmentId, newTimelineStart)
            };
          })
        );
      },
      onSegmentResize: (trackId, segmentId, edge, newTime) => {
        setMediaTracks((prev) =>
          prev.map((track) => {
            if (track.id !== trackId) return track;
            return {
              ...track,
              segments: MediaSequence.resizeSegment(track.segments, segmentId, edge, newTime)
            };
          })
        );
      },
      onSegmentCut: (trackId, timelineTime) => {
        setMediaTracks((prev) =>
          prev.map((track) => {
            if (track.id !== trackId) return track;
            const segment = track.segments.find((s) => !s.deleted && timelineTime >= s.timelineStart && timelineTime < s.timelineEnd);
            if (!segment) return track;

            const result = MediaSequence.splitSegment(segment, timelineTime);
            if (!result) return track;

            return {
              ...track,
              segments: track.segments.map((s) => (s.id === segment.id ? result.left : s)).concat([result.right])
            };
          })
        );
      },
      onSegmentSelect: (trackId, segmentId) => {
        // 可以在这里处理选中逻辑
      },
      onToolChange: (tool) => {
        // 可以在这里处理工具切换
      }
    }),
    [mediaTracks.length]
  );

  /** 切换媒体轨道启用状态 */
  const handleToggleMediaTrack = useCallback(() => {
    setMediaTrackEnabled((prev) => !prev);
  }, []);

  /**
   * 获取下一个按 order 顺序播放的片段的源时间起始点
   * 用于乱序播放：当当前片段播放完成时，跳转到下一个片段
   */
  const getNextOrderedClipSourceStart = useCallback(
    (currentSourceTime: number): number | null => {
      const seq = new ClipSequence(clipSegments);
      const nextClip = seq.getNextOrderedClip(currentSourceTime);
      return nextClip ? nextClip.clip.sourceStart : null;
    },
    [clipSegments]
  );

  /**
   * 播放跳过逻辑：当播放位置进入已删除片段区域时，自动跳到下一个活跃区域
   */
  // 判断剪辑轨道是否实际生效（启用且有剪辑数据）
  const clipTrackEffective = clipTrackEnabled && clipSegments.length > 0;

  const lastSkipTimeRef = useRef<number>(-1);
  useEffect(() => {
    if (!clipTrackEffective || clipSegments.length === 0 || !onSeek) return;

    const seq = new ClipSequence(clipSegments);
    const skipTarget = seq.getSkipTarget(currentTime);

    if (skipTarget !== null && lastSkipTimeRef.current !== skipTarget) {
      lastSkipTimeRef.current = skipTarget;
      onSeek(skipTarget);
    } else if (skipTarget === null) {
      // 重置，允许后续再次跳过同一目标
      lastSkipTimeRef.current = -1;
    }
  }, [currentTime, clipSegments, clipTrackEffective, onSeek]);

  /**
   * 乱序播放逻辑：当播放位置接近当前片段结束时，跳转到下一个按 order 顺序的片段
   */
  const lastOrderedJumpTimeRef = useRef<number>(-1);
  useEffect(() => {
    if (!clipTrackEffective || clipSegments.length === 0 || !onSeek) return;

    const isPlaying = mediaPlayerRef?.current?.isPlaying() ?? false;
    if (!isPlaying) return;

    const seq = new ClipSequence(clipSegments);
    const currentClipInfo = seq.playTimeToSource(currentTime);

    if (!currentClipInfo) {
      lastOrderedJumpTimeRef.current = -1;
      return;
    }

    const currentOrderedIndex = seq.getOrderedClips().findIndex((info) => info.clip.id === currentClipInfo.clipId);
    if (currentOrderedIndex === -1) {
      lastOrderedJumpTimeRef.current = -1;
      return;
    }

    const currentClip = seq.getOrderedClips()[currentOrderedIndex];
    const currentClipSourceEnd = currentClip.clip.sourceEnd;

    const timeUntilEnd = currentClipSourceEnd - currentTime;
    if (timeUntilEnd <= 0.1 && timeUntilEnd >= 0 && lastOrderedJumpTimeRef.current !== currentTime) {
      lastOrderedJumpTimeRef.current = currentTime;

      const nextClip = seq.getOrderedClips()[currentOrderedIndex + 1];
      if (nextClip) {
        onSeek(nextClip.clip.sourceStart);
      }
    }

    if (currentTime > currentClipSourceEnd && lastOrderedJumpTimeRef.current !== currentTime) {
      lastOrderedJumpTimeRef.current = currentTime;

      const nextClip = seq.getOrderedClips()[currentOrderedIndex + 1];
      if (nextClip) {
        onSeek(nextClip.clip.sourceStart);
      }
    }
  }, [currentTime, clipSegments, clipTrackEffective, onSeek, mediaPlayerRef]);

  /**
   * 播放速度控制：根据当前播放片段的 playbackRate 调整播放器速度
   */
  const lastPlaybackRateClipIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!clipTrackEffective || clipSegments.length === 0) {
      mediaPlayerRef?.current?.setPlaybackRate?.(1.0);
      lastPlaybackRateClipIdRef.current = null;
      return;
    }

    const seq = new ClipSequence(clipSegments);
    const currentClipInfo = seq.playTimeToSource(currentTime);

    if (!currentClipInfo) {
      lastPlaybackRateClipIdRef.current = null;
      return;
    }

    const clipId = currentClipInfo.clipId;
    if (clipId === lastPlaybackRateClipIdRef.current) return;

    const clip = clipSegments.find((c) => c.id === clipId);
    if (!clip) return;

    const targetRate = clip.playbackRate ?? 1.0;
    mediaPlayerRef?.current?.setPlaybackRate?.(targetRate);
    lastPlaybackRateClipIdRef.current = clipId;
  }, [currentTime, clipSegments, clipTrackEffective, mediaPlayerRef]);

  // ---- 轨道启用/禁用切换回调 ----
  const handleToggleSubtitleTrackEnabled = useCallback((trackId: string) => {
    setSubtitleTrackEnabledMap((prev) => {
      const next = new Map(prev);
      const current = next.get(trackId) !== false; // 默认 true
      next.set(trackId, !current);
      return next;
    });
  }, []);

  const handleToggleTTSTrackEnabled = useCallback((ttsTrackId: string) => {
    setTTSTrackEnabledMap((prev) => {
      const next = new Map(prev);
      const current = next.get(ttsTrackId) !== false; // 默认 true
      next.set(ttsTrackId, !current);
      return next;
    });
  }, []);

  const handleToggleClipTrackEnabled = useCallback(() => {
    setClipTrackEnabled((prev) => !prev);
  }, []);

  const handleToggleAnnotationTrackEnabled = useCallback(() => {
    setAnnotationTrackEnabled((prev) => !prev);
  }, []);

  // 将字幕轨道的可见状态合并到 timelineTracks 中
  const timelineTracksWithEnabled = useMemo(() => {
    return timelineTracks.map((track) => ({
      ...track,
      visible: subtitleTrackEnabledMap.get(track.id) !== false // 默认 true
    }));
  }, [timelineTracks, subtitleTrackEnabledMap]);

  // 列表模式用：根据 subtitleTrackEnabledMap 计算启用的轨道索引集合
  const enabledTrackIndices = useMemo(() => {
    const set = new Set<number>();
    const trackCount = 1 + translationTracks.length + (typingTexts.length > 0 ? 1 : 0);
    for (let i = 0; i < trackCount; i++) {
      const trackId = `track-${i}`;
      if (subtitleTrackEnabledMap.get(trackId) !== false) {
        set.add(i);
      }
    }
    return set;
  }, [subtitleTrackEnabledMap, translationTracks.length, typingTexts.length]);

  // ---- 广播轨道设置信息给播放器控制栏 TrackSettingsPopover ----
  useEffect(() => {
    const items: TrackSettingsItem[] = [];

    // 字幕轨道（track-0 = 原文，track-1.. = 翻译轨，翻译中临时轨）
    items.push({ id: 'track-0', label: '原文', type: 'subtitle', enabled: true, isMain: true });
    translationTrackMeta.forEach((meta, idx) => {
      const trackId = `track-${idx + 1}`;
      items.push({ id: trackId, label: meta.label, type: 'subtitle', enabled: subtitleTrackEnabledMap.get(trackId) !== false });
    });
    if (typingTexts.length > 0) {
      const trackId = `track-${translationTracks.length + 1}`;
      items.push({ id: trackId, label: '翻译中', type: 'subtitle', enabled: subtitleTrackEnabledMap.get(trackId) !== false });
    }

    // TTS 轨道（仅在有合成数据或正在合成时显示）
    const allTTSTrackIds = ['main', ...translationTrackMeta.map((t) => t.languageCode)];
    const allTTSLabels = ['TTS: 原文', ...translationTrackMeta.map((t) => `TTS: ${t.label}`)];
    allTTSTrackIds.forEach((tid, idx) => {
      const hasTTS = synthesizedItemsByTrack.get(tid) && synthesizedItemsByTrack.get(tid)!.size > 0;
      if (hasTTS || isSynthesizing) {
        items.push({ id: tid, label: allTTSLabels[idx], type: 'tts', enabled: ttsTrackEnabledMap.get(tid) !== false });
      }
    });

    // 标注轨道（有标注数据时显示）
    if (annotations.length > 0) {
      items.push({ id: 'annotation', label: '标注', type: 'annotation', enabled: annotationTrackEnabled });
    }

    // 剪辑轨道（有剪辑数据时显示）
    if (clipSegments.length > 0) {
      items.push({ id: 'clip', label: '剪辑', type: 'clip', enabled: clipTrackEnabled });
    }

    dispatchTrackSettings(items);
  }, [
    subtitleTrackEnabledMap,
    ttsTrackEnabledMap,
    clipTrackEnabled,
    annotationTrackEnabled,
    translationTrackMeta,
    translationTracks.length,
    typingTexts.length,
    synthesizedItemsByTrack,
    isSynthesizing,
    clipSegments.length,
    annotations.length
  ]);

  // 组件卸载时清空轨道设置
  useEffect(() => {
    return () => {
      dispatchTrackSettings([]);
    };
  }, []);

  // ---- 广播标注标记位置给进度条 ----
  useEffect(() => {
    const markers: AnnotationMarker[] = annotations.map((a) => ({
      id: a.id,
      startTime: a.startTime,
      endTime: a.endTime,
      type: a.type,
      text: a.text,
      title: a.title,
      description: a.description,
      color: a.color
    }));
    dispatchAnnotationMarkers(markers);
  }, [annotations]);

  // 组件卸载时清空标注标记
  useEffect(() => {
    return () => {
      dispatchAnnotationMarkers([]);
    };
  }, []);

  // ---- 监听进度条上的标注删除请求 ----
  useEffect(() => {
    const handler = (e: Event) => {
      const annotationId = (e as CustomEvent<string>).detail;
      removeAnnotation(annotationId);
    };
    window.addEventListener(ANNOTATION_DELETE_EVENT, handler);
    return () => window.removeEventListener(ANNOTATION_DELETE_EVENT, handler);
  }, [removeAnnotation]);

  // ---- 监听播放器控制栏的轨道切换请求 ----
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, type } = (e as CustomEvent<TrackTogglePayload>).detail;
      if (type === 'subtitle') {
        handleToggleSubtitleTrackEnabled(id);
      } else if (type === 'tts') {
        handleToggleTTSTrackEnabled(id);
      } else if (type === 'annotation') {
        handleToggleAnnotationTrackEnabled();
      } else if (type === 'clip') {
        handleToggleClipTrackEnabled();
      }
    };
    window.addEventListener(TRACK_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(TRACK_TOGGLE_EVENT, handler);
  }, [handleToggleSubtitleTrackEnabled, handleToggleTTSTrackEnabled, handleToggleClipTrackEnabled, handleToggleAnnotationTrackEnabled]);

  // ---- 多轨道字幕叠加显示：计算当前时间每个启用轨道的字幕，并广播给 SubtitleOverlay ----
  useEffect(() => {
    if (subtitleEntries.length === 0) {
      dispatchSubtitleDisplay([], currentTime);
      return;
    }

    // 所有字幕轨道：主轨 + 翻译轨 + 翻译中临时轨
    const allTracks: AimSegments[][] = [subtitleEntries, ...translationTracks];
    const allTrackIds = ['track-0', ...translationTrackMeta.map((_, idx) => `track-${idx + 1}`)];
    const allLabels = ['原文', ...translationTrackMeta.map((m) => m.label)];

    // 如果有正在翻译的临时轨也加入
    if (typingTexts.length > 0) {
      allTracks.push(typingTexts);
      allTrackIds.push(`track-${translationTracks.length + 1}`);
      allLabels.push('翻译中');
    }

    const lines: SubtitleDisplayLine[] = [];

    allTracks.forEach((track, trackIdx) => {
      const trackId = allTrackIds[trackIdx];
      // 在时间轴模式下尊重轨道启用状态；列表模式下默认全部显示
      const isEnabled = subtitleTrackEnabledMap.get(trackId) !== false;
      if (!isEnabled) return;

      // 遍历当前轨道的所有片段，找到匹配 currentTime 的文本（每个轨道有独立的 st/et）
      for (const seg of track) {
        if (seg.delete) continue;
        const st = utils.convertToSeconds(seg.st);
        const et = utils.convertToSeconds(seg.et);
        if (currentTime >= st && currentTime < et && seg.text) {
          const line: SubtitleDisplayLine = {
            trackId,
            trackLabel: allLabels[trackIdx],
            text: seg.text,
            isTranslation: trackIdx > 0
          };

          // 主轨道：尝试从 segmentsData 中查找对应片段的字级别时间戳
          if (trackIdx === 0 && segmentsData) {
            const matchingSeg = segmentsData.find((s: any) => {
              const sSt = utils.convertToSeconds(s.st);
              const sEt = utils.convertToSeconds(s.et);
              return Math.abs(sSt - st) < 0.05 && Math.abs(sEt - et) < 0.05;
            });
            if (matchingSeg?.children?.length) {
              line.words = (matchingSeg.children as any[]).map((c: any) => ({
                st: utils.convertToSeconds(c.st),
                et: utils.convertToSeconds(c.et),
                text: c.text ?? ''
              }));
            }
          }

          lines.push(line);
          break;
        }
      }
    });

    dispatchSubtitleDisplay(lines, currentTime);
  }, [currentTime, subtitleEntries, translationTracks, translationTrackMeta, typingTexts, subtitleTrackEnabledMap, segmentsData]);

  // 组件卸载时清空字幕显示
  useEffect(() => {
    return () => {
      dispatchSubtitleDisplay([], 0);
    };
  }, []);

  // ---- 标注Alert显示：检测当前时间是否在标注范围内，广播给 AnnotationAlertOverlay ----
  // 标注显示规则：从标注开始时间算起，持续显示3秒后隐藏
  useEffect(() => {
    // 标注轨道未启用时，不显示alert
    if (!annotationTrackEnabled) {
      dispatchAnnotationAlert([], currentTime);
      return;
    }

    if (annotations.length === 0) {
      dispatchAnnotationAlert([], currentTime);
      return;
    }

    const DISPLAY_DURATION = 3; // 显示持续时间（秒）

    // 找出需要显示的标注
    const activeAnnotations = annotations.filter((a) => {
      // 标注尚未开始
      if (currentTime < a.startTime) return false;

      // 从标注开始时间算起，3秒内显示
      const timeSinceStart = currentTime - a.startTime;
      return timeSinceStart < DISPLAY_DURATION;
    });

    dispatchAnnotationAlert(activeAnnotations, currentTime);
  }, [currentTime, annotations, annotationTrackEnabled]);

  return (
    <div className="flex h-full w-full flex-col text-muted-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-2">
        {/* 左侧：视图切换按钮 */}
        <div className="flex items-center gap-1">
          <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('list')} title="列表视图">
            <TbList />
            <span className="text-xs">列表</span>
          </Button>
          <Button variant={viewMode === 'timeline' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('timeline')} title="时间轴视图">
            <TbTimeline />
            <span className="text-xs">时间轴</span>
          </Button>
        </div>
        {/* 右侧：翻译按钮和配置 */}
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="h-8 w-8 p-0" variant={followTime ? 'default' : 'ghost'} size="sm" onClick={() => setFollowTime((prev) => !prev)}>
                <TbCrosshair />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">跟随滚动</TooltipContent>
          </Tooltip>
          <SubtitleTranslator
            subtitleEntries={subtitleEntries}
            resourceId={resource.id}
            isTranslating={isTranslating}
            translationProgress={translationProgress}
            onStopTranslation={stopTranslation}
            onTranslationStart={handleTranslationStart}
          />
          <TTSSynthesizer
            subtitleEntries={subtitleEntries}
            resourceId={resource.id}
            trackOptions={ttsTrackOptions}
            tracksSegments={ttsTracksSegments}
            isSynthesizing={isSynthesizing}
            synthesisProgress={synthesisProgress}
            onStopSynthesis={stopSynthesis}
            onSynthesisStart={handleTTSSynthesisStart}
            onSynthesize={(config, options) => startSynthesis(config, options)}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="h-8 w-8 p-0" variant="ghost" size="sm" onClick={() => setExportDialogOpen(true)} title="导出视频">
                <TbDownload />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">导出</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 内容区域：根据视图模式切换 */}
      {viewMode === 'list' ? (
        // 列表视图
        <SubtitlePlayer
          tracks={tracks}
          currentTime={currentTime}
          followCurrentTime={followTime}
          onMergePrev={handleMergePrev}
          onMergeNext={handleMergeNext}
          onSeek={onSeek}
          onSegmentsChange={handleSegmentsChange}
          onTrackTextChange={handleListTrackTextChange}
          enabledTrackIndices={enabledTrackIndices}
          disabledIndices={translatingChunks}
          highlightIndices={translatingChunks}
          summaries={chunkSummaryInfoMap}
          trackIds={trackIds}
          trackLabels={trackLabels}
          segmentsWordData={segmentsWordData}
          getSegmentHighlights={getSegmentHighlights}
          onAddAnnotation={addAnnotation}
          onRemoveAnnotation={removeAnnotation}
        />
      ) : (
        // 时间轴视图（包装在相对定位容器中以支持浮动面板）
        <div className="relative flex-1 min-h-0">
          <SubtitleTimeline
            tracks={timelineTracksWithEnabled}
            duration={mediaDuration}
            currentTime={currentTime}
            followCurrentTime={followTime}
            wordsMapByTrack={timelineWordsMapByTrack}
            onSeek={onSeek}
            onAddSegment={handleAddSegment}
            onDeleteSegment={handleDeleteSegment}
            onSegmentTextChange={handleTimelineTextChange}
            onSegmentTimeChange={handleTimelineTimeChange}
            onMergePrev={handleMergePrev}
            highlightIds={timelineHighlightIds}
            disabled={isTranslating}
            showRuler
            showTrackLabels
            waveform={waveform}
            showWaveform={!!audioPath}
            ttsItemsByTrack={ttsItemsByTrackForTimeline}
            ttsTrackLabels={ttsTrackLabelsForTimeline}
            subtitleToTTSTrackMap={subtitleToTTSTrackMap}
            showTTSTrack={ttsItemsByTrackForTimeline.size > 0 || isSynthesizing || !!ttsSettingsTrackId || standaloneTTSTracks.length > 0}
            standaloneTTSTracks={standaloneTTSTracks.map((t) => ({ id: t.id, label: t.label }))}
            onAddTTSSegment={handleAddTTSSegment}
            pendingTTSSegment={pendingTTSSegment}
            onAddTTSSegmentConfirm={handleConfirmTTSSegmentInline}
            onCancelTTSSegment={handleCancelTTSSegment}
            onTTSBlockDoubleClick={handleTTSBlockDoubleClick}
            onPlayTTSAudio={handlePlayTTS}
            onStopTTSAudio={handleStopTTS}
            playingTTSIndex={playingTTSIndex ?? undefined}
            onAddSubtitleTrack={handleAddSubtitleTrack}
            onAddTTSTrack={handleAddTTSTrack}
            onDeleteSubtitleTrack={handleDeleteSubtitleTrack}
            onDeleteTTSTrack={handleDeleteTTSTrack}
            onDeleteTTSSegment={handleDeleteTTSSegment}
            onTTSTimeChange={handleTTSTimeChange}
            onTTSTextChange={handleTTSTextChange}
            clipTrack={clipTrackData}
            clipCallbacks={clipCallbacks}
            onToggleSubtitleTrackEnabled={handleToggleSubtitleTrackEnabled}
            onToggleTTSTrackEnabled={handleToggleTTSTrackEnabled}
            onOpenTTSSettings={handleOpenTTSSettings}
            onOpenTTSBatchInput={handleOpenTTSBatchInput}
            ttsVoiceLabels={ttsVoiceLabels}
            clipTrackEnabled={clipTrackEnabled}
            ttsTrackEnabledMap={ttsTrackEnabledMap}
            annotationTrack={annotationTrackData}
            annotationCallbacks={annotationCallbacks}
            annotationTrackEnabled={annotationTrackEnabled}
            mediaTracks={mediaTracks}
            mediaSources={mediaSources}
            mediaCallbacks={mediaCallbacks}
            adapters={aimAdapters}
          />
          {/* TTS 批量文本输入面板 */}
          {ttsBatchInputTrackId && (
            <TTSBatchTextInputPanel
              open={!!ttsBatchInputTrackId}
              onClose={() => setTTSBatchInputTrackId(null)}
              trackId={ttsBatchInputTrackId}
              trackLabel={standaloneTTSTracks.find((t) => t.id === ttsBatchInputTrackId)?.label ?? 'TTS'}
              config={(() => {
                const track = standaloneTTSTracks.find((t) => t.id === ttsBatchInputTrackId);
                if (!track) return null;
                return {
                  voiceName: track.voiceName,
                  rate: track.rate,
                  pitch: track.pitch,
                  autoTrimSilence: track.autoTrimSilence
                };
              })()}
              isSynthesizing={isSynthesizing}
              synthesisProgress={synthesisProgress}
              onSynthesize={async (texts, startIndex) => {
                const track = standaloneTTSTracks.find((t) => t.id === ttsBatchInputTrackId);
                if (!track) return null;
                try {
                  // 计算起始时间：基于当前轨道已有片段的最晚结束时间
                  const existingItems = synthesizedItemsByTrack.get(ttsBatchInputTrackId);
                  let currentTime = 0;
                  if (existingItems && existingItems.size > 0) {
                    // 找到最晚的结束时间
                    for (const [, item] of existingItems) {
                      if (item.endTime && item.endTime > currentTime) {
                        currentTime = item.endTime;
                      }
                    }
                  }

                  // 根据文本长度预估时长并计算每个片段的时间
                  // 假设平均语速：每秒约 4 个汉字或 12 个英文字符
                  const estimateDuration = (text: string): number => {
                    const charCount = text.length;
                    // 简单估算：假设平均每秒 5 个字符
                    const duration = Math.max(1, charCount / 5);
                    // 加上一些缓冲时间
                    return duration + 0.5;
                  };

                  const segments = texts.map((text) => {
                    const duration = estimateDuration(text);
                    const st = currentTime;
                    const et = currentTime + duration;
                    currentTime = et + 0.3; // 片段之间留 0.3 秒间隔
                    return {
                      text,
                      st: formatSecondsToTime(st),
                      et: formatSecondsToTime(et)
                    };
                  });

                  const requestId = await startSynthesis(
                    { voiceName: track.voiceName, rate: track.rate, pitch: track.pitch, autoTrimSilence: track.autoTrimSilence },
                    { trackId: ttsBatchInputTrackId, segments, startIndex }
                  );
                  return requestId;
                } catch (err) {
                  console.error('[SubtitlePlayer] 批量 TTS 合成失败:', err);
                  return null;
                }
              }}
              onStopSynthesis={stopSynthesis}
              existingSegmentCount={synthesizedItemsByTrack.get(ttsBatchInputTrackId)?.size ?? 0}
              synthesizedCount={synthesizedItemsByTrack.get(ttsBatchInputTrackId)?.size ?? 0}
            />
          )}
        </div>
      )}

      {/* 新建编排字幕轨道命名对话框 */}
      <Dialog open={subtitleEditNameDialog.open} onOpenChange={(open) => !open && setSubtitleEditNameDialog({ open: false, name: '' })}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>新建字幕轨道</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={subtitleEditNameDialog.name}
            onChange={(e) => setSubtitleEditNameDialog((prev) => ({ ...prev, name: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirmAddSubtitleTrack()}
            placeholder="请输入轨道名称"
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setSubtitleEditNameDialog({ open: false, name: '' })}>
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmAddSubtitleTrack} disabled={!subtitleEditNameDialog.name.trim()}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TTS 片段文本输入对话框 */}
      <Dialog open={ttsSegmentDialog.open} onOpenChange={(open) => !open && setTTSSegmentDialog((prev) => ({ ...prev, open: false }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{ttsSegmentDialog.editIndex != null ? '编辑配音文本' : '添加配音片段'}</DialogTitle>
          </DialogHeader>
          <textarea
            autoFocus
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={ttsSegmentDialog.text}
            onChange={(e) => setTTSSegmentDialog((prev) => ({ ...prev, text: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleConfirmTTSSegment();
            }}
            placeholder="输入要合成语音的文本..."
          />
          <p className="text-[11px] text-muted-foreground">输入文本后将立即合成语音。⌘+Enter 确认。</p>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setTTSSegmentDialog((prev) => ({ ...prev, open: false }))}>
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmTTSSegment} disabled={!ttsSegmentDialog.text.trim()}>
              {ttsSegmentDialog.editIndex != null ? '重新合成' : '合成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TTS 设置对话框 — 字幕关联 TTS 轨道 */}
      {ttsSettingsTrackId && !ttsSettingsTrackId.startsWith('tts-') && (
        <Dialog open onOpenChange={(open) => !open && setTTSSettingsTrackId(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                TTS 语音设置 — {ttsSettingsTrackId === 'main' ? '原文' : (translationTrackMeta.find((t) => t.languageCode === ttsSettingsTrackId)?.label ?? ttsSettingsTrackId)}
              </DialogTitle>
            </DialogHeader>
            <TTSSynthesizer
              embedded
              subtitleEntries={subtitleEntries}
              resourceId={resource.id}
              trackOptions={ttsTrackOptions.filter((o) => o.trackId === ttsSettingsTrackId)}
              tracksSegments={ttsTracksSegments}
              isSynthesizing={isSynthesizing}
              synthesisProgress={synthesisProgress}
              onStopSynthesis={stopSynthesis}
              onSynthesisStart={(requestId) => {
                handleTTSSynthesisStart(requestId);
                setTTSSettingsTrackId(null);
              }}
              onSynthesize={(config, options) => startSynthesis(config, options)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* TTS 设置对话框 — 独立 TTS 轨道（仅配置语音参数） */}
      {ttsSettingsTrackId?.startsWith('tts-') &&
        (() => {
          const trackConfig = standaloneTTSTracks.find((t) => t.id === ttsSettingsTrackId);
          if (!trackConfig) return null;
          return (
            <Dialog open onOpenChange={(open) => !open && setTTSSettingsTrackId(null)}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>配音设置 — {trackConfig.label}</DialogTitle>
                </DialogHeader>
                <TTSSynthesizer
                  embedded
                  subtitleEntries={[]}
                  resourceId={resource.id}
                  trackOptions={[{ trackId: trackConfig.id, label: trackConfig.label }]}
                  tracksSegments={[]}
                  isSynthesizing={false}
                  synthesisProgress={0}
                  onConfigSave={(config) => {
                    setStandaloneTTSTracks((prev) =>
                      prev.map((t) =>
                        t.id === ttsSettingsTrackId
                          ? { ...t, voiceName: config.voiceName, rate: config.rate ?? 20, pitch: config.pitch ?? 0, autoTrimSilence: config.autoTrimSilence ?? true, configured: true }
                          : t
                      )
                    );
                    // 更新项目文件夹中的配置
                    if (resource.id) {
                      window.YUA.resource['resource:updateTTSTrack']({
                        parentResourceId: resource.id,
                        trackId: ttsSettingsTrackId,
                        config: { voiceName: config.voiceName, rate: config.rate, pitch: config.pitch, autoTrimSilence: config.autoTrimSilence }
                      }).catch((err) => console.error('[SubtitlePlayer] 更新 TTS 轨道配置失败:', err));
                    }
                    setTTSSettingsTrackId(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          );
        })()}

      {/* 导出对话框 */}
      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        videoPath={audioPath}
        audioPath={audioPath}
        duration={mediaDuration || 0}
        resourceId={resource.id}
        workspaceId={resource.workspaceId}
        folderId={resource.folderId}
        subtitleEntries={subtitleEntries}
        translationTracks={translationTracks}
        translationTrackMeta={translationTrackMeta}
        synthesizedItemsByTrack={synthesizedItemsByTrack}
        ttsTrackLabels={ttsTrackLabelsForTimeline}
        segmentsData={segmentsData}
      />
    </div>
  );
};
