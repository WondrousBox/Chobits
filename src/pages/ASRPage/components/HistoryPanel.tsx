import { utils } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useState } from 'react';
import { TbClock, TbLoader2, TbRefresh, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecordingHistoryItem {
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
  isTransparent?: boolean;
  onSelectRecording?: (recording: RecordingHistoryItem, subtitleContent?: string) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isTransparent = false, onSelectRecording }) => {
  const [history, setHistory] = useState<RecordingHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载录音历史记录
  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.YUA.sherpa.getRecordingHistory({ limit: 50, offset: 0 });
      if (result.success) {
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
    loadHistory();
  }, [loadHistory]);

  // 删除历史记录
  const handleDelete = async (id: string): Promise<void> => {
    try {
      const result = await window.YUA.sherpa.deleteRecording({ resourceId: id });
      if (result.success) {
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
    if (!onSelectRecording) return;

    let subtitleContent: string | undefined;
    if (item.subtitleFilePath) {
      try {
        const result = await window.YUA.sherpa.readSubtitleContent({ filePath: item.subtitleFilePath });
        if (result.success && result.content) {
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

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className={`flex items-center justify-between px-4 py-2 border-b ${isTransparent ? 'border-border/50' : ''}`}>
        <div className="flex items-center gap-2">
          <TbClock className="h-4 w-4" />
          <span className="text-sm font-medium">历史记录</span>
        </div>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={loadHistory} disabled={isLoading}>
          <TbRefresh className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {isLoading && history.length === 0 ? (
            <div className={`flex items-center justify-center py-8 gap-2 text-sm ${isTransparent ? 'text-white/70' : 'text-muted-foreground'}`}>
              <TbLoader2 className="h-4 w-4 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : error ? (
            <div className={`text-center py-8 text-sm ${isTransparent ? 'text-white/70' : 'text-muted-foreground'}`}>
              <p>{error}</p>
              <Button size="sm" variant="ghost" className="mt-2" onClick={loadHistory}>
                重试
              </Button>
            </div>
          ) : history.length === 0 ? (
            <div className={`text-center py-8 text-sm ${isTransparent ? 'text-white/70' : 'text-muted-foreground'}`}>暂无历史记录</div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${isTransparent ? 'border-border/50 bg-background/50' : ''}`}
                onClick={() => handleClick(item)}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-sm font-medium truncate flex-1">{item.title || '未命名录音'}</div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(item.id);
                    }}
                  >
                    <TbTrash className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TbClock className="h-3 w-3" />
                  <span>{formatTime(item.createdAt)}</span>
                  <span>·</span>
                  <span>{utils.cleanTimeDisplay(item.duration)}</span>
                  <span>·</span>
                  <span>{formatSize(item.sizeBytes)}</span>
                  {item.subtitleFilePath && (
                    <>
                      <span>·</span>
                      <span className="text-green-500">有字幕</span>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
