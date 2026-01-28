import { AimSegments } from '@aim-packages/subtitle';
import type { TTSTrackId } from '@packages/tts/ipc-renderer';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * TTS事件数据类型（内联定义避免路径问题）
 * 与 packages/tts/ipc-renderer.ts 中的 TTSEventData 保持一致
 */
interface TTSEventData {
  type: 'progress' | 'complete' | 'error' | 'done';
  requestId: string;
  resourceId: string;
  data?: any;
}

/**
 * TTS历史记录数据结构（与 batch-tts-service.ts 一致）
 */
interface BatchTTSHistory {
  requestId: string;
  configPrefix: string;
  createdAt: number;
  updatedAt: number;
  audioMap: Record<string, string>;
  durationMap: Record<string, number>;
  trimmedAudioMap: Record<string, string>;
  trimmedDurationMap: Record<string, number>;
  orderList: string[];
}

/**
 * TTS合成项的状态
 */
export interface TTSSynthesisItem {
  /** 字幕索引 */
  index: number;
  /** 合成状态: pending | synthesizing | completed | error */
  status: 'pending' | 'synthesizing' | 'completed' | 'error';
  /** 音频文件路径（合成完成后） */
  audioPath?: string;
  /** 音频时长（秒） */
  duration?: number;
  /** 去除静音后的时长（秒） */
  trimmedDuration?: number;
  /** 错误信息 */
  error?: string;
  /** 原始文本 */
  text: string;
}

/**
 * TTS合成配置
 */
export interface TTSSynthesisConfig {
  /** 语音名称（如 zh-CN-XiaoxiaoNeural） */
  voiceName: string;
  /** 语速百分比（默认20，范围-100到200） */
  rate?: number;
  /** 音高百分比（默认0，范围-100到200） */
  pitch?: number;
  /** 是否自动去除首尾静音 */
  autoTrimSilence?: boolean;
}

/**
 * Hook 配置选项
 */
export interface UseTTSSynthesisOptions {
  /** 资源 ID */
  resourceId: string;
  /** 字幕条目数组的引用 */
  subtitleEntriesRef: React.RefObject<AimSegments[]>;
  /** 合成完成时的回调 */
  onSynthesisComplete?: () => void;
  /** 单项合成完成时的回调 */
  onItemComplete?: (item: TTSSynthesisItem) => void;
}

/** 开始合成时的轨道选项 */
export interface StartSynthesisTrackOptions {
  trackId: TTSTrackId;
  languageCode?: string;
  segments: AimSegments[];
}

/**
 * Hook 返回值
 */
export interface UseTTSSynthesisReturn {
  /** 正在合成的字幕索引集合（当前任务） */
  synthesizingIndices: Set<number>;
  /** 按轨道分组的已完成合成项：trackId -> index -> item */
  synthesizedItemsByTrack: Map<string, Map<number, TTSSynthesisItem>>;
  /** 合成进度 0-100 */
  synthesisProgress: number;
  /** 是否正在合成 */
  isSynthesizing: boolean;
  /** 当前合成任务对应的轨道 ID（用于 UI 显示） */
  activeTrackId: string | null;
  /** 是否正在加载历史记录 */
  isLoadingHistory: boolean;
  /** 开始合成：可传轨道选项，或仅传 config+selectedIndices（使用主轨道） */
  startSynthesis: (config: TTSSynthesisConfig, optionsOrIndices?: StartSynthesisTrackOptions | number[]) => Promise<string>;
  /** 停止合成 */
  stopSynthesis: () => Promise<void>;
  /** 重置合成状态（可指定轨道或全部） */
  resetSynthesis: (trackId?: string) => void;
  /** 加载TTS历史记录（可指定轨道或加载多轨道） */
  loadTTSHistory: (config: TTSSynthesisConfig, trackId?: TTSTrackId) => Promise<void>;
  /** 当前活跃的任务 ID */
  activeTaskId: string | null;
  /** 获取指定轨道、指定索引的合成结果 */
  getSynthesizedItem: (trackId: string, index: number) => TTSSynthesisItem | undefined;
  /** 获取指定轨道的合成项 Map */
  getSynthesizedItemsByTrack: (trackId: string) => Map<number, TTSSynthesisItem>;
  /** 获取音频时长格式化字符串 */
  formatDuration: (seconds: number) => string;
}

/**
 * TTS合成逻辑 Hook
 * 负责管理TTS合成状态、监听合成事件、处理合成进度等
 */
export function useTTSSynthesis({ resourceId, subtitleEntriesRef, onSynthesisComplete, onItemComplete }: UseTTSSynthesisOptions): UseTTSSynthesisReturn {
  // 按轨道分组的合成状态：trackId -> index -> item
  const [synthesizedItemsByTrack, setSynthesizedItemsByTrack] = useState<Map<string, Map<number, TTSSynthesisItem>>>(() => new Map());
  const [synthesizingIndices, setSynthesizingIndices] = useState<Set<number>>(new Set());
  const [synthesisProgress, setSynthesisProgress] = useState(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);

  // Refs（用于内部追踪）
  // 使用 Map 追踪多个并发任务：requestId -> trackId
  const taskTrackMapRef = useRef<Map<string, string>>(new Map());
  // 当前活跃的任务 ID（用于 UI 显示，显示最新的任务）
  const activeTaskIdRef = useRef<string | null>(null);
  const activeTrackIdRef = useRef<string | null>(null);
  const totalItemsRef = useRef(0);
  const completedCountRef = useRef(0);

  // 使用 ref 保存回调函数，避免 useEffect 重新运行
  const onSynthesisCompleteRef = useRef(onSynthesisComplete);
  const onItemCompleteRef = useRef(onItemComplete);

  // 更新 ref
  useEffect(() => {
    onSynthesisCompleteRef.current = onSynthesisComplete;
    onItemCompleteRef.current = onItemComplete;
  }, [onSynthesisComplete, onItemComplete]);

  // 格式化时长
  const formatDuration = useCallback((seconds: number): string => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toFixed(0)}s`;
  }, []);

  // 获取指定轨道、指定索引的合成结果
  const getSynthesizedItem = useCallback(
    (trackId: string, index: number): TTSSynthesisItem | undefined => {
      return synthesizedItemsByTrack.get(trackId)?.get(index);
    },
    [synthesizedItemsByTrack]
  );

  // 获取指定轨道的合成项 Map
  const getSynthesizedItemsByTrack = useCallback(
    (trackId: string): Map<number, TTSSynthesisItem> => {
      return synthesizedItemsByTrack.get(trackId) ?? new Map();
    },
    [synthesizedItemsByTrack]
  );

  // 重置合成状态（不传 trackId 则重置全部）
  const resetSynthesis = useCallback((trackId?: string) => {
    if (trackId !== undefined) {
      // 只重置指定轨道
      setSynthesizedItemsByTrack((prev) => {
        const next = new Map(prev);
        next.delete(trackId);
        return next;
      });
      // 如果重置的是当前活跃轨道，清空活跃状态
      if (activeTrackIdRef.current === trackId) {
        setIsSynthesizing(false);
        setSynthesisProgress(0);
        setActiveTaskId(null);
        setActiveTrackId(null);
        activeTaskIdRef.current = null;
        activeTrackIdRef.current = null;
      }
    } else {
      // 重置全部
      setSynthesizingIndices(new Set());
      setSynthesisProgress(0);
      setIsSynthesizing(false);
      setActiveTaskId(null);
      setActiveTrackId(null);
      activeTaskIdRef.current = null;
      activeTrackIdRef.current = null;
      totalItemsRef.current = 0;
      completedCountRef.current = 0;
      taskTrackMapRef.current.clear();
      setSynthesizedItemsByTrack(new Map());
    }
  }, []);

  // 加载TTS历史记录（可指定轨道，不传则加载 main）
  const loadTTSHistory = useCallback(
    async (config: TTSSynthesisConfig, trackId: TTSTrackId = 'main'): Promise<void> => {
      const currentEntries = subtitleEntriesRef.current || [];
      if (currentEntries.length === 0 || !resourceId) {
        console.log('[useTTSSynthesis] 没有字幕条目或资源ID，跳过加载历史');
        return;
      }

      setIsLoadingHistory(true);
      try {
        console.log(`[useTTSSynthesis] 加载TTS历史 - resourceId: ${resourceId}, trackId: ${trackId}`);

        const history: BatchTTSHistory | null = await window.YUA.tts.loadHistory({
          resourceId,
          trackId,
          config: {
            type: 'Edge',
            voiceName: config.voiceName,
            rate: config.rate ?? 20,
            pitch: config.pitch ?? 0
          }
        });

        if (!history) {
          console.log('[useTTSSynthesis] 没有找到TTS历史记录');
          return;
        }

        console.log(`[useTTSSynthesis] 找到历史记录 - 音频数量: ${Object.keys(history.audioMap).length}`);

        const loadedItems = new Map<number, TTSSynthesisItem>();
        if (history.orderList && history.orderList.length > 0) {
          history.orderList.forEach((md5, index) => {
            if (index < currentEntries.length) {
              const audioPath = history.trimmedAudioMap[md5] || history.audioMap[md5];
              const duration = history.durationMap[md5];
              const trimmedDuration = history.trimmedDurationMap[md5];
              if (audioPath) {
                loadedItems.set(index, {
                  index,
                  status: 'completed',
                  audioPath,
                  duration: duration ? duration / 1000 : undefined,
                  trimmedDuration: trimmedDuration ? trimmedDuration / 1000 : undefined,
                  text: currentEntries[index]?.text || ''
                });
              }
            }
          });
        }

        if (loadedItems.size > 0) {
          console.log(`[useTTSSynthesis] 加载了 ${loadedItems.size} 个已合成的TTS项目 (track: ${trackId})`);
          setSynthesizedItemsByTrack((prev) => {
            const next = new Map(prev);
            next.set(trackId, loadedItems);
            return next;
          });
        }
      } catch (error) {
        console.error('[useTTSSynthesis] 加载TTS历史失败:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [resourceId, subtitleEntriesRef]
  );

  // 停止合成（停止当前活跃的任务）
  const stopSynthesis = useCallback(async () => {
    if (activeTaskIdRef.current) {
      try {
        await window.YUA.tts.cancelTask(activeTaskIdRef.current);
        // 从映射中移除
        taskTrackMapRef.current.delete(activeTaskIdRef.current);
      } catch (error) {
        console.error('停止TTS合成失败:', error);
      }
    }
    setIsSynthesizing(false);
    setActiveTaskId(null);
    setActiveTrackId(null);
    activeTaskIdRef.current = null;
    activeTrackIdRef.current = null;
  }, []);

  // 开始合成：optionsOrIndices 为轨道选项或主轨道的 selectedIndices
  const startSynthesis = useCallback(
    async (config: TTSSynthesisConfig, optionsOrIndices?: StartSynthesisTrackOptions | number[]): Promise<string> => {
      let trackId: TTSTrackId = 'main';
      let segments: AimSegments[];
      let languageCode: string | undefined;
      let indicesToSynthesize: number[];

      if (Array.isArray(optionsOrIndices)) {
        const currentEntries = subtitleEntriesRef.current || [];
        if (currentEntries.length === 0) throw new Error('没有字幕条目可供合成');
        indicesToSynthesize = optionsOrIndices.length > 0 ? optionsOrIndices : currentEntries.map((_, i) => i);
        segments = currentEntries;
      } else if (optionsOrIndices && 'trackId' in optionsOrIndices && optionsOrIndices.segments) {
        const opts = optionsOrIndices as StartSynthesisTrackOptions;
        trackId = opts.trackId;
        languageCode = opts.languageCode;
        segments = opts.segments.filter((s) => !s.delete);
        indicesToSynthesize = segments.map((_, i) => i);
      } else {
        const currentEntries = subtitleEntriesRef.current || [];
        if (currentEntries.length === 0) throw new Error('没有字幕条目可供合成');
        segments = currentEntries;
        indicesToSynthesize = currentEntries.map((_, i) => i);
      }

      if (indicesToSynthesize.length === 0) throw new Error('没有选择要合成的字幕');

      // 只重置当前轨道的状态，不清空其他轨道
      setSynthesizedItemsByTrack((prev) => {
        const next = new Map(prev);
        // 为当前轨道初始化 pending 状态
        const initialItems = new Map<number, TTSSynthesisItem>();
        indicesToSynthesize.forEach((index) => {
          initialItems.set(index, {
            index,
            status: 'pending',
            text: segments[index]?.text ?? ''
          });
        });
        next.set(trackId, initialItems);
        return next;
      });

      // 更新当前活跃任务（用于 UI 显示）
      setIsSynthesizing(true);
      totalItemsRef.current = indicesToSynthesize.length;
      activeTrackIdRef.current = trackId;
      setActiveTrackId(trackId);
      // 更新 synthesizingIndices（用于进度条显示）
      setSynthesizingIndices(new Set(indicesToSynthesize));

      const items = indicesToSynthesize.map((index) => ({
        index,
        text: segments[index]?.text ?? ''
      }));

      const { requestId: taskRequestId, eventsChannel } = await window.YUA.tts.synthesizeBatch({
        resourceId,
        trackId,
        languageCode,
        items,
        config: {
          voiceName: config.voiceName,
          rate: config.rate ?? 20,
          pitch: config.pitch ?? 0
        },
        skipTrimSilence: !(config.autoTrimSilence ?? true)
      });

      // 将 requestId 和 trackId 的映射关系存储起来
      taskTrackMapRef.current.set(taskRequestId, trackId);
      activeTaskIdRef.current = taskRequestId;
      setActiveTaskId(taskRequestId);
      console.log(`[useTTSSynthesis] TTS任务已启动 requestId: ${taskRequestId}, trackId: ${trackId}, eventsChannel: ${eventsChannel}`);
      return taskRequestId;
    },
    [resourceId, subtitleEntriesRef]
  );

  // 监听TTS事件
  useEffect(() => {
    console.log('[useTTSSynthesis] 设置TTS事件监听器');

    const unsubscribe = window.YUA.tts.onEvent((event: TTSEventData) => {
      console.log(`[useTTSSynthesis] 收到TTS事件 - type: ${event.type}, requestId: ${event.requestId}`);

      // 根据 requestId 查找对应的 trackId
      const trackId = taskTrackMapRef.current.get(event.requestId);
      if (!trackId) {
        console.log(`[useTTSSynthesis] 事件被过滤 - 找不到 requestId 对应的 trackId: ${event.requestId}`);
        return;
      }

      console.log(`[useTTSSynthesis] 处理事件 - type: ${event.type}, trackId: ${trackId}`);

      switch (event.type) {
        case 'progress': {
          if (event.data) {
            const { currentIndex, percentage } = event.data;
            // 只更新当前活跃任务的进度（用于 UI 显示）
            if (event.requestId === activeTaskIdRef.current) {
              setSynthesisProgress(percentage);
            }
            if (currentIndex !== undefined) {
              setSynthesizedItemsByTrack((prev) => {
                const trackMap = prev.get(trackId);
                if (!trackMap) return prev;
                const nextTrack = new Map(trackMap);
                const existing = nextTrack.get(currentIndex);
                if (existing && existing.status !== 'synthesizing') {
                  nextTrack.set(currentIndex, { ...existing, status: 'synthesizing' });
                  const next = new Map(prev);
                  next.set(trackId, nextTrack);
                  return next;
                }
                return prev;
              });
            }
          }
          break;
        }

        case 'complete': {
          if (event.data && event.data.results) {
            const results = event.data.results as Array<{
              index: number;
              success: boolean;
              audioPath?: string;
              duration?: number;
              trimmedDuration?: number;
              error?: string;
              text: string;
            }>;
            setSynthesizedItemsByTrack((prev) => {
              const trackMap = prev.get(trackId) ?? new Map();
              const nextTrack = new Map(trackMap);
              for (const result of results) {
                const item: TTSSynthesisItem = {
                  index: result.index,
                  status: result.success ? 'completed' : 'error',
                  audioPath: result.audioPath,
                  duration: result.duration ? result.duration / 1000 : undefined,
                  trimmedDuration: result.trimmedDuration ? result.trimmedDuration / 1000 : undefined,
                  error: result.error,
                  text: result.text
                };
                nextTrack.set(result.index, item);
                onItemCompleteRef.current?.(item);
              }
              const next = new Map(prev);
              next.set(trackId, nextTrack);
              return next;
            });
          }
          break;
        }

        case 'done': {
          // 从映射中移除已完成的任务
          taskTrackMapRef.current.delete(event.requestId);

          // 如果这是当前活跃的任务，更新 UI 状态
          if (event.requestId === activeTaskIdRef.current) {
            setIsSynthesizing(false);
            setSynthesisProgress(100);
            setActiveTaskId(null);
            setActiveTrackId(null);
            activeTaskIdRef.current = null;
            activeTrackIdRef.current = null;
            onSynthesisCompleteRef.current?.();
          }
          break;
        }

        case 'error': {
          console.error('TTS合成错误:', event.data?.message);
          // 从映射中移除失败的任务
          taskTrackMapRef.current.delete(event.requestId);

          // 如果这是当前活跃的任务，更新 UI 状态
          if (event.requestId === activeTaskIdRef.current) {
            setIsSynthesizing(false);
            setActiveTaskId(null);
            setActiveTrackId(null);
            activeTaskIdRef.current = null;
            activeTrackIdRef.current = null;
          }
          break;
        }
      }
    });

    console.log('[useTTSSynthesis] 事件监听器设置完成');

    return () => {
      console.log('[useTTSSynthesis] 清理事件监听器');
      unsubscribe();
    };
  }, []); // 空依赖数组，只在组件挂载时设置一次

  // 组件卸载时取消所有任务
  useEffect(() => {
    return () => {
      // 取消所有正在进行的任务
      const requestIds = Array.from(taskTrackMapRef.current.keys());
      for (const requestId of requestIds) {
        window.YUA.tts.cancelTask(requestId).catch(console.error);
      }
      taskTrackMapRef.current.clear();
    };
  }, []);

  return {
    synthesizingIndices,
    synthesizedItemsByTrack,
    synthesisProgress,
    isSynthesizing,
    activeTrackId,
    isLoadingHistory,
    startSynthesis,
    stopSynthesis,
    resetSynthesis,
    loadTTSHistory,
    activeTaskId,
    getSynthesizedItem,
    getSynthesizedItemsByTrack,
    formatDuration
  };
}
