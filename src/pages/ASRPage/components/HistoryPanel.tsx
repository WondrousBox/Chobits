import { utils } from '@aim-packages/subtitle';
import prettyBytes from 'pretty-bytes';
import React, { useCallback, useEffect, useState } from 'react';
import { TbClock, TbLoader2, TbMicrophone, TbRefresh, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface RecordingHistoryItem {
  id: string;
  title: string;
  audioFilePath: string;
  subtitleFilePath: string | null;
  subtitleResourceId: string | null;
  duration: number;
  sizeBytes: number;
  createdAt: number;
  updatedAt: number;
  workspaceId: string;
  folderId: string;
  status: string;
}

interface HistoryPanelProps {
  isSubtitleMode?: boolean;
  isRecording?: boolean; // 是否正在录音
  currentRecordingId?: string | null; // 当前录音的ID
  selectedId?: string | null; // 当前选中的历史记录ID
  onSelectRecording?: (recording: RecordingHistoryItem, subtitleContent?: string) => void;
  onRefresh?: () => void; // 外部触发刷新
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isSubtitleMode = false, isRecording = false, currentRecordingId = null, selectedId = null, onSelectRecording, onRefresh }) => {
  const [history, setHistory] = useState<RecordingHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载录音历史记录
  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.chobits.sherpa.getRecordingHistory({ limit: 50, offset: 0 });
      if (result.ok) {
        setHistory(result.data);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err) {
      console.error('加载历史记录失败:', err);
      setError('加载历史记录失败');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 组件挂载时加载历史记录
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时异步加载历史记录,加载态切换是有意的
    loadHistory();
  }, [loadHistory]);

  // 外部触发刷新
  useEffect(() => {
    if (onRefresh) {
      // 注册刷新回调，但这里不直接调用
    }
  }, [onRefresh]);

  // 删除历史记录
  const handleDelete = async (e: React.MouseEvent, id: string): Promise<void> => {
    e.stopPropagation();
    try {
      const result = await window.chobits.sherpa.deleteRecording({ resourceId: id });
      if (result.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      } else {
        console.error('删除失败:', result.error);
      }
    } catch (err) {
      console.error('删除录音失败:', err);
    }
  };

  // 点击录音项
  const handleClick = async (item: RecordingHistoryItem): Promise<void> => {
    // 如果正在录音，不允许切换（除非暂停）
    if (isRecording) return;

    if (!onSelectRecording) return;

    let subtitleContent: string | undefined;
    if (item.subtitleFilePath) {
      try {
        const result = await window.chobits.sherpa.readSubtitleContent({ filePath: item.subtitleFilePath });
        if (result.ok && result.content) {
          subtitleContent = result.content;
        }
      } catch (err) {
        console.error('读取字幕失败:', err);
      }
    }

    onSelectRecording(item, subtitleContent);
  };

  // 格式化时间
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 暴露刷新方法
  const refreshHistory = loadHistory;

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className={`flex items-center justify-between px-4 py-2 border-b ${isSubtitleMode ? 'border-border/50' : ''}`}>
        <div className="flex items-center gap-2">
          <TbClock className="h-4 w-4" />
          <span className="text-sm font-medium">历史记录</span>
        </div>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={refreshHistory} disabled={isLoading}>
          <TbRefresh className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <ScrollArea className="flex-1 no-drag">
        <div className="p-2 space-y-2">
          {isLoading && history.length === 0 ? (
            <div className={`flex items-center justify-center py-8 gap-2 text-sm ${isSubtitleMode ? 'text-white/70' : 'text-muted-foreground'}`}>
              <TbLoader2 className="h-4 w-4 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : error ? (
            <div className={`text-center py-8 text-sm ${isSubtitleMode ? 'text-white/70' : 'text-muted-foreground'}`}>
              <p>{error}</p>
              <Button size="sm" variant="ghost" className="mt-2" onClick={refreshHistory}>
                重试
              </Button>
            </div>
          ) : history.length === 0 ? (
            <div className={`text-center py-8 text-sm ${isSubtitleMode ? 'text-white/70' : 'text-muted-foreground'}`}>暂无历史记录</div>
          ) : (
            history.map((item) => {
              const isSelected = selectedId === item.id;
              const isCurrentRecording = currentRecordingId === item.id;
              const isDisabled = isRecording && !isCurrentRecording;

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    isSelected ? 'border-primary bg-primary/10' : isCurrentRecording ? 'border-orange-500 bg-orange-500/10' : isSubtitleMode ? 'border-border/50 bg-background/50' : 'border-border'
                  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                  onClick={() => !isDisabled && handleClick(item)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isCurrentRecording && <TbMicrophone className="h-4 w-4 text-orange-500 animate-pulse shrink-0" />}
                      <div className="text-sm font-medium truncate">{item.title || '未命名录音'}</div>
                    </div>
                    {!isCurrentRecording && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={(e) => handleDelete(e, item.id)}>
                        <TbTrash className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatTime(item.createdAt)}</span>
                    <span>{utils.cleanTimeDisplay(item.duration)}</span>
                    <span>{prettyBytes(item.sizeBytes)}</span>
                    {item.status === 'new' && (
                      <>
                        <span>·</span>
                        <span className="text-orange-500">录制中</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
