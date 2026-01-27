import { AimSegments } from '@aim-packages/subtitle';
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

/**
 * Hook 返回值
 */
export interface UseTTSSynthesisReturn {
  /** 正在合成的字幕索引集合 */
  synthesizingIndices: Set<number>;
  /** 已完成合成的项目列表 */
  synthesizedItems: Map<number, TTSSynthesisItem>;
  /** 合成进度 0-100 */
  synthesisProgress: number;
  /** 是否正在合成 */
  isSynthesizing: boolean;
  /** 合成是否已完成 */
  isSynthesisComplete: boolean;
  /** 是否正在加载历史记录 */
  isLoadingHistory: boolean;
  /** 开始合成 */
  startSynthesis: (config: TTSSynthesisConfig, selectedIndices?: number[]) => Promise<string>;
  /** 停止合成 */
  stopSynthesis: () => Promise<void>;
  /** 重置合成状态 */
  resetSynthesis: () => void;
  /** 加载TTS历史记录 */
  loadTTSHistory: (config: TTSSynthesisConfig) => Promise<void>;
  /** 当前活跃的任务 ID */
  activeTaskId: string | null;
  /** 获取指定索引的合成结果 */
  getSynthesizedItem: (index: number) => TTSSynthesisItem | undefined;
  /** 获取音频时长格式化字符串 */
  formatDuration: (seconds: number) => string;
}

/**
 * TTS合成逻辑 Hook
 * 负责管理TTS合成状态、监听合成事件、处理合成进度等
 */
export function useTTSSynthesis({ resourceId, subtitleEntriesRef, onSynthesisComplete, onItemComplete }: UseTTSSynthesisOptions): UseTTSSynthesisReturn {
  // 合成状态管理
  const [synthesizingIndices, setSynthesizingIndices] = useState<Set<number>>(new Set());
  const [synthesizedItems, setSynthesizedItems] = useState<Map<number, TTSSynthesisItem>>(new Map());
  const [synthesisProgress, setSynthesisProgress] = useState(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isSynthesisComplete, setIsSynthesisComplete] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Refs（用于内部追踪）
  const activeTaskIdRef = useRef<string | null>(null);
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

  // 获取指定索引的合成结果
  const getSynthesizedItem = useCallback(
    (index: number): TTSSynthesisItem | undefined => {
      return synthesizedItems.get(index);
    },
    [synthesizedItems]
  );

  // 重置合成状态
  const resetSynthesis = useCallback(() => {
    setIsSynthesisComplete(false);
    setSynthesizingIndices(new Set());
    setSynthesizedItems(new Map());
    setSynthesisProgress(0);
    setIsSynthesizing(false);
    setActiveTaskId(null);
    activeTaskIdRef.current = null;
    totalItemsRef.current = 0;
    completedCountRef.current = 0;
  }, []);

  // 加载TTS历史记录
  const loadTTSHistory = useCallback(
    async (config: TTSSynthesisConfig): Promise<void> => {
      const currentEntries = subtitleEntriesRef.current || [];
      if (currentEntries.length === 0 || !resourceId) {
        console.log('[useTTSSynthesis] 没有字幕条目或资源ID，跳过加载历史');
        return;
      }

      setIsLoadingHistory(true);
      try {
        console.log(`[useTTSSynthesis] 加载TTS历史 - resourceId: ${resourceId}`);

        // 通过主进程加载历史，主进程会自动计算 configPrefix
        const history: BatchTTSHistory | null = await window.YUA.tts.loadHistory({
          resourceId,
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

        // 将历史记录转换为 synthesizedItems
        // 由于我们不能在渲染进程计算 MD5，我们需要使用 orderList 来匹配
        // orderList 的顺序就是合成时的索引顺序
        const loadedItems = new Map<number, TTSSynthesisItem>();

        // 如果 orderList 存在且长度匹配，直接使用顺序匹配
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
                  duration: duration ? duration / 1000 : undefined, // 转换为秒
                  trimmedDuration: trimmedDuration ? trimmedDuration / 1000 : undefined, // 转换为秒
                  text: currentEntries[index]?.text || ''
                });
              }
            }
          });
        }

        if (loadedItems.size > 0) {
          console.log(`[useTTSSynthesis] 加载了 ${loadedItems.size} 个已合成的TTS项目`);
          setSynthesizedItems(loadedItems);
          setIsSynthesisComplete(true);
        }
      } catch (error) {
        console.error('[useTTSSynthesis] 加载TTS历史失败:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [resourceId, subtitleEntriesRef]
  );

  // 停止合成
  const stopSynthesis = useCallback(async () => {
    if (activeTaskIdRef.current) {
      try {
        await window.YUA.tts.cancelTask(activeTaskIdRef.current);
      } catch (error) {
        console.error('停止TTS合成失败:', error);
      }
    }
    setIsSynthesizing(false);
    setActiveTaskId(null);
    activeTaskIdRef.current = null;
  }, []);

  // 开始合成
  const startSynthesis = useCallback(
    async (config: TTSSynthesisConfig, selectedIndices?: number[]): Promise<string> => {
      const currentEntries = subtitleEntriesRef.current || [];
      if (currentEntries.length === 0) {
        throw new Error('没有字幕条目可供合成');
      }

      // 确定要合成的索引
      const indicesToSynthesize = selectedIndices || currentEntries.map((_, i) => i);
      if (indicesToSynthesize.length === 0) {
        throw new Error('没有选择要合成的字幕');
      }

      // 重置状态
      resetSynthesis();
      setIsSynthesizing(true);
      totalItemsRef.current = indicesToSynthesize.length;

      // 构建合成项目列表
      const items = indicesToSynthesize.map((index) => ({
        index,
        text: currentEntries[index]?.text || ''
      }));

      // 初始化合成状态
      const initialItems = new Map<number, TTSSynthesisItem>();
      const initialSynthesizing = new Set<number>();
      for (const item of items) {
        initialItems.set(item.index, {
          index: item.index,
          status: 'pending',
          text: item.text
        });
        initialSynthesizing.add(item.index);
      }
      console.log(`[useTTSSynthesis] 初始化 ${initialItems.size} 个TTS项目为 pending 状态`);
      setSynthesizedItems(initialItems);
      setSynthesizingIndices(initialSynthesizing);

      // 调用合成API
      const result = await window.YUA.tts.synthesizeBatch({
        resourceId,
        items,
        config: {
          voiceName: config.voiceName,
          rate: config.rate ?? 20,
          pitch: config.pitch ?? 0
        },
        skipTrimSilence: !(config.autoTrimSilence ?? true)
      });

      activeTaskIdRef.current = result.requestId;
      setActiveTaskId(result.requestId);
      console.log(`[useTTSSynthesis] TTS任务已启动 - requestId: ${result.requestId}`);
      console.log(`[useTTSSynthesis] activeTaskIdRef.current 已设置为: ${activeTaskIdRef.current}`);
      return result.requestId;
    },
    [resourceId, subtitleEntriesRef, resetSynthesis]
  );

  // 监听TTS事件
  useEffect(() => {
    console.log('[useTTSSynthesis] 设置TTS事件监听器');

    const unsubscribe = window.YUA.tts.onEvent((event: TTSEventData) => {
      console.log(`[useTTSSynthesis] 收到TTS事件 - type: ${event.type}, requestId: ${event.requestId}`);

      // 检查是否是当前任务的事件
      if (event.requestId !== activeTaskIdRef.current) {
        console.log(`[useTTSSynthesis] 事件被过滤 - requestId不匹配`);
        return;
      }
      
      console.log(`[useTTSSynthesis] 处理事件 - type: ${event.type}`);

      switch (event.type) {
        case 'progress': {
          if (event.data) {
            const { currentIndex, percentage } = event.data;

            // 更新进度
            setSynthesisProgress(percentage);

            // 更新单项状态为正在合成
            if (currentIndex !== undefined) {
              console.log(`[useTTSSynthesis] 进度事件 - 索引 ${currentIndex}, 进度 ${percentage}%`);
              setSynthesizedItems((prev) => {
                const next = new Map(prev);
                const existing = next.get(currentIndex);
                if (existing && existing.status !== 'synthesizing') {
                  console.log(`[useTTSSynthesis] 更新索引 ${currentIndex} 状态为 synthesizing`);
                  next.set(currentIndex, {
                    ...existing,
                    status: 'synthesizing'
                  });
                  return next;
                }
                return prev; // 如果没有变化，返回原对象避免不必要的渲染
              });
            }
          }
          break;
        }

        case 'complete': {
          if (event.data && event.data.results) {
            // 更新所有已完成的项目状态
            const results = event.data.results as Array<{
              index: number;
              success: boolean;
              audioPath?: string;
              duration?: number;
              trimmedDuration?: number;
              error?: string;
              text: string;
            }>;

            console.log(`[useTTSSynthesis] 收到 complete 事件，包含 ${results.length} 个结果`);

            setSynthesizedItems((prev) => {
              const next = new Map(prev);
              for (const result of results) {
                // 后端返回的 duration 是毫秒，需要转换为秒
                const item: TTSSynthesisItem = {
                  index: result.index,
                  status: result.success ? 'completed' : 'error',
                  audioPath: result.audioPath,
                  duration: result.duration ? result.duration / 1000 : undefined,
                  trimmedDuration: result.trimmedDuration ? result.trimmedDuration / 1000 : undefined,
                  error: result.error,
                  text: result.text
                };

                next.set(result.index, item);
                console.log(`[useTTSSynthesis] 更新索引 ${result.index}: ${result.success ? 'completed' : 'error'}, 音频路径: ${result.audioPath}`);

                // 触发单项完成回调
                onItemCompleteRef.current?.(item);
              }
              return next;
            });
          }
          break;
        }

        case 'done': {
          setIsSynthesizing(false);
          setIsSynthesisComplete(true);
          setSynthesizingIndices(new Set());
          setSynthesisProgress(100);
          setActiveTaskId(null);
          activeTaskIdRef.current = null;
          onSynthesisCompleteRef.current?.();
          break;
        }

        case 'error': {
          console.error('TTS合成错误:', event.data?.message);
          setIsSynthesizing(false);
          setActiveTaskId(null);
          activeTaskIdRef.current = null;
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

  // 组件卸载时取消任务
  useEffect(() => {
    return () => {
      if (activeTaskIdRef.current) {
        window.YUA.tts.cancelTask(activeTaskIdRef.current).catch(console.error);
      }
    };
  }, []);

  return {
    synthesizingIndices,
    synthesizedItems,
    synthesisProgress,
    isSynthesizing,
    isSynthesisComplete,
    isLoadingHistory,
    startSynthesis,
    stopSynthesis,
    resetSynthesis,
    loadTTSHistory,
    activeTaskId,
    getSynthesizedItem,
    formatDuration
  };
}
