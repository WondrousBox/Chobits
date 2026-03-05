import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbLoader2, TbPlayerPause, TbPlayerPlay, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

/** 单行文本的状态 */
export interface TextLineStatus {
  text: string;
  status: 'pending' | 'synthesizing' | 'completed' | 'error';
  error?: string;
}

interface TTSBatchTextInputPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** TTS 轨道 ID */
  trackId: string;
  /** 轨道名称 */
  trackLabel: string;
  /** TTS 配置 */
  config: {
    voiceName: string;
    rate: number;
    pitch: number;
    autoTrimSilence: boolean;
  } | null;
  /** 当前是否正在合成其他任务 */
  isSynthesizing?: boolean;
  /** 合成进度 */
  synthesisProgress?: number;
  /** 开始合成回调（返回 requestId） */
  onSynthesize: (texts: string[], startIndex: number) => Promise<string | null>;
  /** 停止合成回调 */
  onStopSynthesis: () => void;
  /** 当前轨道已有的片段数量（用于计算起始索引） */
  existingSegmentCount?: number;
  /** 已合成的项目数量（用于检测合成完成） */
  synthesizedCount?: number;
  /** Custom class name */
  className?: string;
}

/**
 * TTSBatchTextInputPanel - TTS 批量文本输入面板
 *
 * 用于批量输入文本并依次合成 TTS 音频：
 * - 多行文本输入框
 * - 依次合成按钮
 * - 合成进度显示
 * - 已合成文本标记
 */
export const TTSBatchTextInputPanel: React.FC<TTSBatchTextInputPanelProps> = ({
  open,
  onClose,
  trackId,
  trackLabel,
  config,
  isSynthesizing = false,
  synthesisProgress = 0,
  onSynthesize,
  onStopSynthesis,
  existingSegmentCount = 0,
  synthesizedCount = 0,
  className
}) => {
  const [textLines, setTextLines] = useState<TextLineStatus[]>([]);
  const [rawText, setRawText] = useState('');
  const [isLocalSynthesizing, setIsLocalSynthesizing] = useState(false);
  const [currentSynthesizingIndex, setCurrentSynthesizingIndex] = useState<number | null>(null);
  const [startSynthesizedCount, setStartSynthesizedCount] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 解析文本为行
  const parsedLines = useMemo(() => {
    return rawText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, [rawText]);

  // 更新文本行状态
  useEffect(() => {
    setTextLines((prev) => {
      const newLines = parsedLines.map((text, index) => {
        const existing = prev[index];
        if (existing && existing.text === text) {
          return existing;
        }
        return { text, status: 'pending' as const };
      });
      return newLines;
    });
  }, [parsedLines]);

  // 当外部合成状态变化时更新本地状态
  useEffect(() => {
    if (!isSynthesizing && isLocalSynthesizing) {
      setIsLocalSynthesizing(false);
      setCurrentSynthesizingIndex(null);
    }
  }, [isSynthesizing, isLocalSynthesizing]);

  // 监听合成完成数量变化，更新文本行状态
  useEffect(() => {
    if (!isLocalSynthesizing || startSynthesizedCount === null) return;

    // 计算新完成的数量
    const newCompletedCount = synthesizedCount - startSynthesizedCount;
    if (newCompletedCount > 0 && newCompletedCount <= textLines.length) {
      // 更新已完成的行状态
      setTextLines((prev) => {
        const next = [...prev];
        for (let i = 0; i < newCompletedCount && i < next.length; i++) {
          if (next[i].status === 'pending' || next[i].status === 'synthesizing') {
            next[i] = { ...next[i], status: 'completed' };
          }
        }
        // 标记下一行为正在合成
        if (newCompletedCount < next.length && isSynthesizing) {
          next[newCompletedCount] = { ...next[newCompletedCount], status: 'synthesizing' };
          setCurrentSynthesizingIndex(newCompletedCount);
        }
        return next;
      });
    }
  }, [synthesizedCount, startSynthesizedCount, isLocalSynthesizing, textLines.length, isSynthesizing]);

  // 更新单行状态
  const updateLineStatus = useCallback((index: number, status: TextLineStatus['status'], error?: string) => {
    setTextLines((prev) => {
      if (index >= prev.length) return prev;
      const next = [...prev];
      next[index] = { ...next[index], status, error };
      return next;
    });
  }, []);

  // 开始依次合成
  const handleStartSynthesis = useCallback(async () => {
    if (!config) {
      console.warn('[TTSBatchTextInputPanel] 未配置 TTS 语音');
      return;
    }

    const pendingLines = textLines.filter((line) => line.status === 'pending');
    if (pendingLines.length === 0) {
      console.log('[TTSBatchTextInputPanel] 没有待合成的文本');
      return;
    }

    setIsLocalSynthesizing(true);
    setStartSynthesizedCount(synthesizedCount); // 记录开始时的已合成数量

    try {
      // 调用父组件的合成方法，一次性提交所有待合成的文本
      const requestId = await onSynthesize(parsedLines, existingSegmentCount);
      if (requestId) {
        // 标记第一行为 synthesizing
        updateLineStatus(0, 'synthesizing');
        setCurrentSynthesizingIndex(0);
      }
    } catch (error) {
      console.error('[TTSBatchTextInputPanel] 合成失败:', error);
      setIsLocalSynthesizing(false);
    }
  }, [config, textLines, parsedLines, existingSegmentCount, synthesizedCount, onSynthesize, updateLineStatus]);

  // 停止合成
  const handleStopSynthesis = useCallback(() => {
    onStopSynthesis();
    setIsLocalSynthesizing(false);
    setCurrentSynthesizingIndex(null);
  }, [onStopSynthesis]);

  // 关闭面板
  const handleClose = useCallback(() => {
    if (isLocalSynthesizing) {
      handleStopSynthesis();
    }
    onClose();
  }, [isLocalSynthesizing, handleStopSynthesis, onClose]);

  // 清空文本
  const handleClear = useCallback(() => {
    if (isLocalSynthesizing) return;
    setRawText('');
    setTextLines([]);
  }, [isLocalSynthesizing]);

  // 计算统计信息
  const stats = useMemo(() => {
    const total = textLines.length;
    const completed = textLines.filter((l) => l.status === 'completed').length;
    const pending = textLines.filter((l) => l.status === 'pending').length;
    const error = textLines.filter((l) => l.status === 'error').length;
    return { total, completed, pending, error };
  }, [textLines]);

  if (!open) return null;

  return (
    <div className={clsx('absolute right-0 top-0 bottom-0 w-80 bg-background border-l shadow-lg z-50 flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium truncate">{trackLabel}</h3>

          <Button variant="outline" size="sm" onClick={handleClear} disabled={isLocalSynthesizing || rawText.length === 0}>
            清空文本
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="w-6 h-6 p-0 shrink-0" onClick={handleClose}>
          <TbX className="w-4 h-4" />
        </Button>
      </div>

      {/* 配置状态提示 */}
      {!config && (
        <div className="px-3 py-2 bg-yellow-500/10 border-b shrink-0">
          <p className="text-xs text-yellow-600 dark:text-yellow-400">请先配置 TTS 语音设置</p>
        </div>
      )}

      {/* 输入区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 文本输入框 */}
        <div className="flex-1 p-3 overflow-hidden flex flex-col">
          <label className="text-xs font-medium text-foreground mb-2">输入文本（每行一句）</label>
          <textarea
            ref={textareaRef}
            className="flex-1 w-full p-2 text-sm border rounded-md resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="在此粘贴文本，一行为一句&#10;&#10;例如：&#10;这是第一句话&#10;这是第二句话&#10;这是第三句话"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            disabled={isLocalSynthesizing}
          />
        </div>

        {/* 文本预览与状态 */}
        {textLines.length > 0 && (
          <div className="border-t max-h-40 overflow-y-auto">
            <div className="px-3 py-1.5 bg-muted/30 text-xs text-muted-foreground sticky top-0">
              预览 ({stats.completed}/{stats.total} 已完成)
            </div>
            <div className="px-3 py-2 space-y-1">
              {textLines.map((line, index) => (
                <div
                  key={index}
                  className={clsx(
                    'text-xs py-1 px-2 rounded flex items-start gap-1.5',
                    line.status === 'completed' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                    line.status === 'synthesizing' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                    line.status === 'error' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                    line.status === 'pending' && 'bg-muted/30 text-muted-foreground'
                  )}
                >
                  <span className="shrink-0 w-4 text-center font-mono">
                    {line.status === 'completed' && '✓'}
                    {line.status === 'synthesizing' && <TbLoader2 className="w-3 h-3 animate-spin inline" />}
                    {line.status === 'error' && '✗'}
                    {line.status === 'pending' && index + 1}
                  </span>
                  <span className="truncate flex-1" title={line.text}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 进度条 */}
      {isLocalSynthesizing && (
        <div className="px-3 py-2 border-t shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>合成中...</span>
            <span>{synthesisProgress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${synthesisProgress}%` }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t p-3 space-y-2 shrink-0">
        <div className="flex gap-2">
          {isLocalSynthesizing ? (
            <Button variant="destructive" size="sm" className="flex-1" onClick={handleStopSynthesis}>
              <TbPlayerPause className="w-4 h-4 mr-1" />
              停止合成
            </Button>
          ) : (
            <Button variant="default" size="sm" className="flex-1" onClick={handleStartSynthesis} disabled={!config || textLines.length === 0 || stats.pending === 0}>
              <TbPlayerPlay className="w-4 h-4 mr-1" />
              依次合成 ({stats.pending} 句)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
