import { AimSegments, parser, tools, utils } from '@aim-packages/subtitle';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbCrosshair, TbDownload, TbList, TbScissors, TbTimeline } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

import type { ResourceItem } from '../../../types';
import { MediaPlayerRef } from '../MediaPlayer/MediaPlayer';
import { dispatchSubtitleDisplay, type SubtitleDisplayLine } from '../MediaPlayer/subtitleDisplayEvent';
import { ExportDialog } from './ExportDialog';
import { SubtitlePlayer } from './SubtitleListPlayer/SubtitlePlayer';
import { aimTracksToTimelineTracks, ClipSequence, formatSecondsToTime, indicesToIds, parseSegmentId, parseTimeToSeconds, SubtitleTimeline, TimelineSegment } from './SubtitleTimeline';
import type { ClipSegment, ClipTrackCallbacks, ClipTrackData, TTSAudioItem as TimelineTTSAudioItem } from './SubtitleTimeline/types';
import { SubtitleTranslator } from './SubtitleTranslator';
import type { TTSTrackOption } from './TTSSynthesizer';
import { TTSSynthesizer } from './TTSSynthesizer';
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
  const [translationTracks, setTranslationTracks] = useState<AimSegments[][]>([]);
  /** 各翻译轨道的语言、显示名和资源ID（与 translationTracks 顺序一致） */
  const [translationTrackMeta, setTranslationTrackMeta] = useState<{ languageCode: string; label: string; resourceId: string }[]>([]);
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
  const [showClipTrack, setShowClipTrack] = useState(false);
  const [clipSegments, setClipSegments] = useState<ClipSegment[]>([]);
  const isLoadingClipSegmentsRef = useRef(false);

  // ---- 轨道启用/禁用状态 ----
  /** 字幕轨道启用状态：timeline track id -> enabled */
  const [subtitleTrackEnabledMap, setSubtitleTrackEnabledMap] = useState<Map<string, boolean>>(new Map());
  /** TTS轨道启用状态：ttsTrackId -> enabled */
  const [ttsTrackEnabledMap, setTTSTrackEnabledMap] = useState<Map<string, boolean>>(new Map());
  /** 剪辑轨道是否启用 */
  const [clipTrackEnabled, setClipTrackEnabled] = useState(true);

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
        setShowClipTrack(true);
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

  // 外部值变化时同步本地开关
  useEffect(() => {
    setFollowTime(followCurrentTime);
  }, [followCurrentTime]);

  // 保持 subtitleEntries 的引用始终是最新的
  const subtitleEntriesRef = useRef<AimSegments[]>([]);
  useEffect(() => {
    subtitleEntriesRef.current = subtitleEntries;
  }, [subtitleEntries]);

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

      // 找到对应的字幕轨道：main -> track-0 (index 0), 翻译轨道 -> track-1, track-2... (index 1, 2...)
      const subtitleTrackIndex = tid === 'main' ? 0 : translationTrackMeta.findIndex((t) => t.languageCode === tid) + 1;
      const subtitleTrack = allSubtitleTracks[subtitleTrackIndex];
      if (!subtitleTrack) return;

      const items: TimelineTTSAudioItem[] = [];
      map.forEach((item, index) => {
        const seg = subtitleTrack[index];
        if (!seg) return;
        // 优先使用 history 中的 startTime/endTime（可拖拽调整），否则用字幕轨道的 st/et
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
    return { ttsItemsByTrackForTimeline: byTrack, ttsTrackLabelsForTimeline: labels, subtitleToTTSTrackMap: subtitleToTTS };
  }, [subtitleEntries, translationTracks, synthesizedItemsByTrack, translationTrackMeta]);

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
    } else if (!resource.id) {
      // 资源清空时重置状态
      setClipSegments([]);
      setShowClipTrack(false);
    }
  }, [resource.id, mediaDuration, loadClipSegments]);

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

    return tracksArray;
  }, [subtitleEntries, translationTracks, typingTexts]);

  // 时间轴视图数据
  const timelineTracks = useMemo(() => {
    const labels = ['原文'];
    if (translationTracks.length > 0) {
      labels.push(...translationTracks.map((_, idx) => `译文 ${idx + 1}`));
    }
    if (typingTexts.length > 0) {
      labels.push('翻译中');
    }
    // 类型适配：时间轴工具内部定义的 AimSegments 结构与外部包的类型略有差异，运行时兼容，这里进行类型断言
    return aimTracksToTimelineTracks(tracks as any, labels);
  }, [tracks, translationTracks, typingTexts]);

  // 时间轴高亮的片段 ID
  const timelineHighlightIds = useMemo(() => {
    return indicesToIds(translatingChunks, 0); // 主轨道的翻译中片段
  }, [translatingChunks]);

  // 处理时间轴文本编辑（主轨道写回字幕文件，翻译轨道写回翻译 JSON）
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
      }
    },
    [subtitleEntries, translationTracks, translationTrackMeta, resource.id, isLoading, debouncedSave, debouncedFlushTranslationUpdates, subtitleFormat]
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
      }
      // "翻译中"临时轨道（trackIndex > translationTracks.length）不需要处理，因为它是临时的
    },
    [subtitleEntries, translationTracks, translationTrackMeta, resource.id, isLoading, debouncedSave, debouncedFlushTranslationUpdates, subtitleFormat]
  );

  // 统一：往前合并（仅主轨道 track-0）
  const handleMergePrev = useCallback(
    ({ trackId, segmentIndex }: { trackId: string; segmentIndex: number }) => {
      if (trackId !== 'track-0' || segmentIndex <= 0) return;
      const merged = utils.mergeAimSegmentRange(subtitleEntries, segmentIndex - 1, segmentIndex);
      setSubtitleEntries(merged);
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

      const merged = utils.mergeAimSegmentRange(subtitleEntries, segmentIndex, segmentIndex + 1);
      setSubtitleEntries(merged);
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
      }
    },
    [subtitleEntries, translationTracks, translationTrackMeta, resource.id, isLoading, debouncedSave, subtitleFormat]
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
      }
    },
    [subtitleEntries, translationTrackMeta, resource.id, isLoading, debouncedSave, subtitleFormat]
  );

  // 删除字幕轨道（翻译轨道）
  const handleDeleteSubtitleTrack = useCallback(
    async (trackId: string) => {
      // 解析轨道索引：track-1 -> 0, track-2 -> 1, ...
      const trackIndexMatch = trackId.match(/^track-(\d+)$/);
      if (!trackIndexMatch) return;
      const trackIndex = parseInt(trackIndexMatch[1], 10);

      // track-0 是主轨道，不允许删除
      if (trackIndex === 0) return;

      // track-1, track-2... 对应翻译轨道
      const translationIndex = trackIndex - 1;
      if (translationIndex < 0 || translationIndex >= translationTrackMeta.length) return;

      const meta = translationTrackMeta[translationIndex];
      if (!meta?.resourceId) {
        console.warn(`[SubtitlePlayer] 无法删除轨道 ${trackId}：找不到资源ID`);
        return;
      }

      try {
        // 删除翻译资源
        await window.YUA.resource.deleteResource({ id: meta.resourceId });
        console.log(`[SubtitlePlayer] 已删除翻译轨道 ${trackId}，资源ID: ${meta.resourceId}`);

        // 重新加载翻译轨道（会自动移除已删除的）
        await loadTranslationTracks();
      } catch (error) {
        console.error(`[SubtitlePlayer] 删除翻译轨道失败:`, error);
        alert('删除翻译轨道失败，请重试');
      }
    },
    [translationTrackMeta, loadTranslationTracks]
  );

  // 删除TTS轨道
  const handleDeleteTTSTrack = useCallback(
    async (ttsTrackId: string) => {
      try {
        // 清除该轨道的TTS数据
        resetSynthesis(ttsTrackId);

        // 删除TTS文件目录
        if (resource.id) {
          const result = await window.YUA.tts.deleteTrackFiles({ resourceId: resource.id, trackId: ttsTrackId });
          if (!result.success) {
            console.warn(`[SubtitlePlayer] 删除TTS文件目录失败，但已清除内存数据`);
          }
        }

        console.log(`[SubtitlePlayer] 已删除TTS轨道 ${ttsTrackId}`);
      } catch (error) {
        console.error(`[SubtitlePlayer] 删除TTS轨道失败:`, error);
        alert('删除TTS轨道失败，请重试');
      }
    },
    [resource.id, resetSynthesis]
  );

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

  // ---- 剪辑轨道 ----

  /** 切换剪辑轨道显示。首次开启时自动生成一个覆盖整段媒体的初始片段 */
  const handleToggleClipTrack = useCallback(() => {
    setShowClipTrack((prev) => {
      if (!prev && clipSegments.length === 0 && mediaDuration && mediaDuration > 0) {
        setClipSegments(ClipSequence.createInitial(mediaDuration));
      }
      return !prev;
    });
  }, [clipSegments.length, mediaDuration]);

  /** 剪辑轨道数据（传给 SubtitleTimeline） */
  const clipTrackData = useMemo((): ClipTrackData | undefined => {
    if (!showClipTrack || clipSegments.length === 0) return undefined;
    return {
      id: 'clip-track-main',
      label: '剪辑',
      clips: clipSegments,
      sourceDuration: mediaDuration || 0
    };
  }, [showClipTrack, clipSegments, mediaDuration]);

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
  // 判断剪辑轨道是否实际生效（显示且启用）
  const clipTrackEffective = showClipTrack && clipTrackEnabled;

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

  // 将字幕轨道的启用状态合并到 timelineTracks 中
  const timelineTracksWithEnabled = useMemo(() => {
    return timelineTracks.map((track) => ({
      ...track,
      enabled: subtitleTrackEnabledMap.get(track.id) !== false // 默认 true
    }));
  }, [timelineTracks, subtitleTrackEnabledMap]);

  // ---- 多轨道字幕叠加显示：计算当前时间每个启用轨道的字幕，并广播给 SubtitleOverlay ----
  useEffect(() => {
    if (subtitleEntries.length === 0) {
      dispatchSubtitleDisplay([]);
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
          lines.push({
            trackId,
            trackLabel: allLabels[trackIdx],
            text: seg.text,
            isTranslation: trackIdx > 0
          });
          break;
        }
      }
    });

    dispatchSubtitleDisplay(lines);
  }, [currentTime, subtitleEntries, translationTracks, translationTrackMeta, typingTexts, subtitleTrackEnabledMap]);

  // 组件卸载时清空字幕显示
  useEffect(() => {
    return () => {
      dispatchSubtitleDisplay([]);
    };
  }, []);

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
          {viewMode === 'timeline' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button className="h-8 w-8 p-0" variant={showClipTrack ? 'default' : 'ghost'} size="sm" onClick={handleToggleClipTrack}>
                  <TbScissors />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{showClipTrack ? '隐藏剪辑轨道' : '显示剪辑轨道'}</TooltipContent>
            </Tooltip>
          )}
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
          disabledIndices={translatingChunks}
          highlightIndices={translatingChunks}
          summaries={chunkSummaryInfoMap}
          ttsItemsByTrack={synthesizedItemsByTrack}
          trackIds={trackIds}
          trackLabels={trackLabels}
          activeTTSTrackId={activeTrackId}
          ttsSynthesizingIndices={synthesizingIndices}
          onPlayTTS={handlePlayTTS}
        />
      ) : (
        // 时间轴视图
        <SubtitleTimeline
          tracks={timelineTracksWithEnabled}
          duration={mediaDuration}
          currentTime={currentTime}
          followCurrentTime={followTime}
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
          audioPath={audioPath}
          showWaveform={!!audioPath}
          ttsItemsByTrack={ttsItemsByTrackForTimeline}
          ttsTrackLabels={ttsTrackLabelsForTimeline}
          subtitleToTTSTrackMap={subtitleToTTSTrackMap}
          showTTSTrack={ttsItemsByTrackForTimeline.size > 0 || isSynthesizing}
          onPlayTTSAudio={handlePlayTTS}
          onStopTTSAudio={handleStopTTS}
          playingTTSIndex={playingTTSIndex ?? undefined}
          onDeleteSubtitleTrack={handleDeleteSubtitleTrack}
          onDeleteTTSTrack={handleDeleteTTSTrack}
          onDeleteTTSSegment={handleDeleteTTSSegment}
          onTTSTimeChange={handleTTSTimeChange}
          showClipTrack={showClipTrack}
          clipTrack={clipTrackData}
          clipCallbacks={clipCallbacks}
          onToggleSubtitleTrackEnabled={handleToggleSubtitleTrackEnabled}
          onToggleTTSTrackEnabled={handleToggleTTSTrackEnabled}
          onToggleClipTrackEnabled={handleToggleClipTrackEnabled}
          clipTrackEnabled={clipTrackEnabled}
          ttsTrackEnabledMap={ttsTrackEnabledMap}
        />
      )}

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
      />
    </div>
  );
};
