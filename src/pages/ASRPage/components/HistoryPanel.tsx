import { utils } from '@aim-packages/subtitle';
import React, { useState } from 'react';
import { TbClock, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface HistoryItem {
  id: string;
  timestamp: number;
  segments: Array<{
    text: string;
    translation?: string;
    start: number;
    end: number;
  }>;
  duration: number;
}

interface HistoryPanelProps {
  isTransparent?: boolean;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isTransparent = false }) => {
  // 从localStorage加载历史记录（使用lazy initialization）
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('asr-history');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
    return [];
  });

  // 删除历史记录
  const handleDelete = (id: string): void => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem('asr-history', JSON.stringify(updated));
      return updated;
    });
  };

  // 清空所有历史记录
  const handleClearAll = (): void => {
    setHistory([]);
    localStorage.removeItem('asr-history');
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

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className={`flex items-center justify-between px-4 py-2 border-b ${isTransparent ? 'border-border/50' : ''}`}>
        <div className="flex items-center gap-2">
          <TbClock className="h-4 w-4" />
          <span className="text-sm font-medium">历史记录</span>
        </div>
        {history.length > 0 && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={handleClearAll}>
            清空
          </Button>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {history.length === 0 ? (
            <div className={`text-center py-8 text-sm ${isTransparent ? 'text-white/70' : 'text-muted-foreground'}`}>暂无历史记录</div>
          ) : (
            history.map((item) => (
              <div key={item.id} className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${isTransparent ? 'border-border/50 bg-background/50' : ''}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TbClock className="h-3 w-3" />
                    <span>{formatTime(item.timestamp)}</span>
                    <span>·</span>
                    <span>{utils.cleanTimeDisplay(item.duration)}</span>
                  </div>
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
                <div className="text-sm line-clamp-3">{item.segments.map((segment) => segment.text).join(' ')}</div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
