import React from 'react';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { SubtitlePlayer } from '../Players';
import { useResourceTabContext } from './ResourceTabContext';

/**
 * 字幕 Tab 组件
 * 用于显示视频资源的字幕内容
 */
const SubtitleTab: React.FC = () => {
  const { subtitleList, activeSubtitle, setActiveSubtitle, currentTime, mediaPlayerRef } = useResourceTabContext();

  if (subtitleList.length === 0) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">暂无字幕</div>;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 字幕选择下拉框 */}
      {subtitleList.length > 1 && (
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <span className="text-xs text-muted-foreground">字幕文件</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
                {activeSubtitle?.title || activeSubtitle?.filePath?.split('/').pop() || '选择字幕'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              {subtitleList.map((item) => {
                const itemTitle = item.title || item.filePath?.split('/').pop() || item.id;
                const isActive = item.id === activeSubtitle?.id;
                return (
                  <DropdownMenuItem key={item.id} onClick={() => setActiveSubtitle(item)} className={`text-xs ${isActive ? 'font-semibold' : ''}`}>
                    {itemTitle}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {/* 字幕播放器 */}
      <div className="flex-1 min-h-0">
        {activeSubtitle && (
          <SubtitlePlayer
            resource={activeSubtitle}
            currentTime={currentTime}
            onSeek={(time) => {
              if (mediaPlayerRef.current) {
                mediaPlayerRef.current.seekTo(time);
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

export default SubtitleTab;
