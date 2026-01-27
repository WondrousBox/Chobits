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
  /** 开始合成 */
  startSynthesis: (config: TTSSynthesisConfig, selectedIndices?: number[]) => Promise<string>;
  /** 停止合成 */
  stopSynthesis: () => Promise<void>;
  /** 重置合成状态 */
  resetSynthesis: () => void;
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
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Refs（用于内部追踪）
  const activeTaskIdRef = useRef<string | null>(null);
  const totalItemsRef = useRef(0);
  const completedCountRef = useRef(0);

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
      return result.requestId;
    },
    [resourceId, subtitleEntriesRef, resetSynthesis]
  );

  // 监听TTS事件
  useEffect(() => {
    const unsubscribe = window.YUA.tts.onEvent((event: TTSEventData) => {
      // 检查是否是当前任务的事件
      if (event.requestId !== activeTaskIdRef.current) {
        return;
      }

      switch (event.type) {
        case 'progress': {
          if (event.data) {
            const { currentIndex, percentage } = event.data;

            // 更新进度
            setSynthesisProgress(percentage);

            // 更新单项状态为正在合成
            if (currentIndex !== undefined) {
              setSynthesizedItems((prev) => {
                const next = new Map(prev);
                const existing = next.get(currentIndex);
                if (existing) {
                  next.set(currentIndex, {
                    ...existing,
                    status: 'synthesizing'
                  });
                }
                return next;
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

            setSynthesizedItems((prev) => {
              const next = new Map(prev);
              for (const result of results) {
                next.set(result.index, {
                  index: result.index,
                  status: result.success ? 'completed' : 'error',
                  audioPath: result.audioPath,
                  duration: result.duration,
                  trimmedDuration: result.trimmedDuration,
                  error: result.error,
                  text: result.text
                });

                // 触发单项完成回调
                onItemComplete?.({
                  index: result.index,
                  status: result.success ? 'completed' : 'error',
                  audioPath: result.audioPath,
                  duration: result.duration,
                  trimmedDuration: result.trimmedDuration,
                  error: result.error,
                  text: result.text
                });
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
          onSynthesisComplete?.();
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

    return () => {
      unsubscribe();
    };
  }, [onSynthesisComplete, onItemComplete]);

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
    startSynthesis,
    stopSynthesis,
    resetSynthesis,
    activeTaskId,
    getSynthesizedItem,
    formatDuration
  };
}
