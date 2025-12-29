/* eslint-disable react-hooks/set-state-in-effect */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowLeft, TbArrowRight, TbChevronLeft, TbChevronRight, TbDots, TbFile, TbFileDescription, TbLetterT, TbLink, TbMusic, TbPhoto, TbVideo } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';

import { ImagePlayer, MediaPlayer, SrtPlayer, TextPlayer } from './components/Players';
import type { MediaPlayerRef } from './components/Players/MediaPlayer/MediaPlayer';
import type { ResourceItem } from './types';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from './utils/resourceProtocol';
import { isSubtitleFile } from './utils/subtitleUtils';

interface IncomingPayload {
  current: ResourceItem;
  list?: ResourceItem[];
  index?: number;
}

const ResourcePreviewWindow: React.FC = () => {
  const [data, setData] = useState<ResourceItem | null>(null);
  const [list, setList] = useState<ResourceItem[]>([]);
  const [index, setIndex] = useState<number>(-1);
  const [subtitleList, setSubtitleList] = useState<ResourceItem[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<ResourceItem | null>(null);
  const [isPlaylistExpanded, setIsPlaylistExpanded] = useState(true);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // 当前播放时间（秒）
  const mainContentRef = useRef<HTMLDivElement>(null);
  const mediaPlayerRef = useRef<MediaPlayerRef>(null); // 媒体播放器的 ref

  // 处理视频加载完成，调整窗口大小
  const handleVideoLoaded = useCallback(async (videoElement: HTMLVideoElement) => {
    try {
      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;

      if (videoWidth > 0 && videoHeight > 0) {
        // 获取屏幕尺寸
        const screenSize = await window.YUA.window['screen:size:get']();

        // 计算视频宽高比
        const aspectRatio = videoWidth / videoHeight;

        // 设置控制栏高度（包括标题栏）
        const controlHeight = 36 + 80; // 标题栏 + 控制栏
        const availableHeight = screenSize.height - controlHeight;
        const availableWidth = screenSize.width;

        let windowWidth: number;
        let windowHeight: number;

        // 根据视频宽高比和屏幕尺寸计算最佳窗口大小
        if (aspectRatio > availableWidth / availableHeight) {
          // 视频更宽，以宽度为准
          windowWidth = Math.min(videoWidth, availableWidth);
          windowHeight = Math.floor(windowWidth / aspectRatio) + controlHeight;
        } else {
          // 视频更高，以高度为准
          windowHeight = Math.min(videoHeight + controlHeight, availableHeight);
          windowWidth = Math.floor((windowHeight - controlHeight) * aspectRatio);
        }

        // 确保窗口大小合理
        windowWidth = Math.max(400, Math.min(windowWidth, availableWidth));
        windowHeight = Math.max(300, Math.min(windowHeight, availableHeight));

        // 调整窗口大小并居中
        await window.YUA.window['window:size:set']('resourcePreview', windowWidth, windowHeight, true);
      }
    } catch (error) {
      console.warn('调整视频窗口大小失败:', error);
    }
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => {
      setIndex((prev) => {
        if (!list.length) return prev;
        let next = prev + dir;
        if (next < 0) next = list.length - 1;
        if (next >= list.length) next = 0;
        const target = list[next];
        if (target) {
          setData(target);
        }
        return next;
      });
    },
    [list]
  );

  // 切换到指定索引的资源
  const goToIndex = useCallback(
    (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= list.length) return;
      const target = list[targetIndex];
      if (target) {
        setData(target);
        setIndex(targetIndex);
      }
    },
    [list]
  );

  // 获取资源类型图标
  const getResourceIcon = useCallback((resource: ResourceItem) => {
    switch (resource.type) {
      case 'image':
        return TbPhoto;
      case 'video':
        return TbVideo;
      case 'audio':
        return TbMusic;
      case 'text':
        return TbLetterT;
      case 'document':
        return TbFileDescription;
      case 'link':
        return TbLink;
      case 'file':
        return TbFile;
      default:
        return TbDots;
    }
  }, []);

  // 文件列表滚动到当前项
  const playlistRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (playlistRef.current && index >= 0) {
      const itemElement = playlistRef.current.querySelector(`[data-index="${index}"]`);
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [index]);

  // 切换文件列表展开/收起
  const togglePlaylistExpanded = useCallback(() => {
    setIsPlaylistExpanded((prev) => !prev);
  }, []);

  // 检测鼠标是否在主内容区域（类似视频播放器控制栏）
  useEffect(() => {
    if (!mainContentRef.current) {
      setShowExpandButton(false);
      return;
    }
    if (isPlaylistExpanded) {
      setShowExpandButton(false);
      return;
    }

    const handleMouseEnter = (): void => {
      setShowExpandButton(true);
    };

    const handleMouseLeave = (): void => {
      setShowExpandButton(false);
    };

    const mainContent = mainContentRef.current;
    mainContent.addEventListener('mouseenter', handleMouseEnter);
    mainContent.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      mainContent.removeEventListener('mouseenter', handleMouseEnter);
      mainContent.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isPlaylistExpanded, list.length]);

  // 监听 data.id 变化，重新获取完整资源信息（处理列表切换的情况）
  useEffect(() => {
    if (data?.id) {
      window.ipcRenderer
        .invoke('getResource', { id: data.id })
        .then((fullResource) => {
          if (fullResource) {
            setData((prev) => (prev ? { ...prev, ...fullResource } : fullResource));
          }
        })
        .catch((err) => console.warn('Failed to refresh resource:', err));
    }
  }, [data?.id]);

  // 当当前资源为视频时，加载其子资源中的字幕文件
  useEffect(() => {
    const loadSubtitles = async (): Promise<void> => {
      if (!data?.id || data.type !== 'video') {
        setSubtitleList([]);
        setActiveSubtitle(null);
        setCurrentTime(0); // 切换资源时重置播放时间
        return;
      }
      try {
        const children: ResourceItem[] = await window.YUA.resource['resource:listChildren']({
          parentResourceId: data.id,
          limit: 100,
          offset: 0
        });
        const subs = (children || []).filter((item) => isSubtitleFile(item.filePath));
        setSubtitleList(subs);
        setActiveSubtitle((prev) => {
          if (prev && subs.find((s) => s.id === prev.id)) return prev;
          return subs[0] || null;
        });
      } catch (e) {
        console.warn('load subtitle children failed', e);
        setSubtitleList([]);
        setActiveSubtitle(null);
      }
    };
    loadSubtitles();
  }, [data?.id, data?.type]);

  // 监听资源数据推送
  useEffect(() => {
    const handler = async (_e: any, payload: IncomingPayload | ResourceItem): Promise<void> => {
      console.log(payload);

      let current: ResourceItem;
      let lst: ResourceItem[] = [];
      let idx: number = -1;

      if ((payload as any).current) {
        const p = payload as IncomingPayload;
        current = p.current;
        lst = p.list || [];
        idx = typeof p.index === 'number' ? p.index : p.list ? p.list.findIndex((r) => r.id === p.current.id) : -1;
      } else {
        current = payload as ResourceItem;
        lst = [];
        idx = -1;
      }

      // 获取完整资源信息
      if (current?.id) {
        try {
          const fullResource = await window.ipcRenderer.invoke('getResource', { id: current.id });
          if (fullResource) {
            current = fullResource;
            // 更新列表中的对应项
            if (idx !== -1 && lst[idx]) {
              lst[idx] = fullResource;
            }
          }
        } catch (error) {
          console.warn('Failed to fetch full resource details:', error);
        }
      }

      setData(current);
      setList(lst);
      setIndex(idx);
      setCurrentTime(0); // 切换资源时重置播放时间
    };
    window.ipcRenderer?.on('on:window:open:ready', handler);
    // 如果 120ms 后仍未接收到数据，主动拉取缓存（避免 race）
    const timer = setTimeout(async () => {
      if (!data) {
        try {
          const cached = await window.YUA.window['window:payload:get']('resourcePreview');
          if (cached && !data) {
            // 模拟事件处理逻辑
            handler(null, cached);
          }
        } catch {
          //
        }
      }
    }, 120);

    console.log('ResourcePreviewWindow mounted with data: ');

    window.YUA.window['window:open:ready']('resourcePreview');
    return () => {
      window.ipcRenderer?.off('on:window:open:ready', handler);
      clearTimeout(timer);
    };
  }, []);

  if (!data) {
    return <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">等待资源数据...</div>;
  }

  const title = data.title || data.filePath || data.url || data.id;
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url;

  const hasSubtitlePanel = isVideoFile(data.filePath) && subtitleList.length > 0 && !!activeSubtitle;

  // 渲染文件列表内容
  const renderPlaylistContent = (): React.ReactNode => {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-background border-l">
        <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground flex items-center justify-between">
          <Button size="sm" variant="ghost" className="h-8 w-8" onClick={togglePlaylistExpanded}>
            <TbChevronRight />
          </Button>
          <span>文件列表 ({list.length})</span>
        </div>
        <ScrollArea className="flex-1">
          <div ref={playlistRef} className="p-2 space-y-1">
            {list.map((item, idx) => {
              const Icon = getResourceIcon(item);
              const itemTitle = item.title || item.filePath || item.url || item.id;
              const itemSrc = item.filePath ? makeResSrc(item.filePath) : item.url;
              const isActive = idx === index;
              const hasThumbnail = item.thumbnailPath || (isImageFile(item.filePath) && itemSrc);

              return (
                <div
                  key={item.id}
                  data-index={idx}
                  onClick={() => goToIndex(idx)}
                  className={`
                    flex items-center gap-2 p-2 rounded cursor-pointer transition-colors
                    ${isActive ? 'bg-primary/20 border border-primary/50' : 'hover:bg-muted/50 border border-transparent'}
                  `}
                >
                  {/* 缩略图或图标 */}
                  <div className="w-12 h-12 flex-shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                    {hasThumbnail && isImageFile(item.filePath) ? (
                      <img src={item.thumbnailPath ? makeResSrc(item.thumbnailPath) : itemSrc} alt={itemTitle} className="w-full h-full object-cover" />
                    ) : (
                      <Icon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  {/* 标题和索引 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{itemTitle}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {idx + 1} / {list.length}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  };

  // 渲染字幕侧边栏内容（当当前资源为视频且存在子字幕资源时）
  const renderSubtitlePanel = (): React.ReactNode => {
    if (!hasSubtitlePanel || !activeSubtitle) return null;
    return (
      <div className="h-full flex flex-col overflow-hidden bg-background border-l">
        <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground flex items-center justify-between gap-2">
          <span>字幕 ({subtitleList.length})</span>
          {subtitleList.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs flex items-center gap-1">
                  <TbFileDescription className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[7rem]">{activeSubtitle.title || activeSubtitle.filePath || '字幕列表'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                {subtitleList.map((item) => {
                  const itemTitle = item.title || item.filePath || item.url || item.id;
                  const isActive = item.id === activeSubtitle.id;
                  return (
                    <DropdownMenuItem key={item.id} onClick={() => setActiveSubtitle(item)} className={`text-xs ${isActive ? 'font-semibold' : ''}`}>
                      {itemTitle}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex-1 min-h-0">
          <SrtPlayer
            resource={activeSubtitle}
            currentTime={currentTime}
            onSeek={(time) => {
              // 跳转到指定时间
              if (mediaPlayerRef.current) {
                mediaPlayerRef.current.seekTo(time);
              }
            }}
          />
        </div>
      </div>
    );
  };

  // 渲染主要内容
  const renderMainContent = (): React.ReactNode => (
    <div ref={mainContentRef} className="h-full relative flex items-center justify-center overflow-hidden">
      {isImageFile(data.filePath) && fileSrc && <ImagePlayer src={fileSrc} title={title} className="w-full h-full rounded-md shadow" />}
      {isVideoFile(data.filePath) && fileSrc && (
        <MediaPlayer ref={mediaPlayerRef} src={fileSrc} type="video" title={title} autoPlay={true} className="w-full h-full" onVideoLoaded={handleVideoLoaded} onTimeUpdate={setCurrentTime} />
      )}
      {isAudioFile(data.filePath) && fileSrc && <MediaPlayer ref={mediaPlayerRef} src={fileSrc} type="audio" title={title} autoPlay={true} className="w-full max-w-xl" onTimeUpdate={setCurrentTime} />}
      {isSubtitleFile(data.filePath) && <SrtPlayer resource={data} />}
      {!isImageFile(data.filePath) && !isVideoFile(data.filePath) && !isAudioFile(data.filePath) && !isSubtitleFile(data.filePath) && <TextPlayer resource={data} />}

      {/* 收起时，鼠标移入画面显示的展开按钮（类似视频播放器控制栏） */}
      {(list.length > 0 || data) && !isPlaylistExpanded && showExpandButton && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 z-10 transition-opacity duration-200">
          <Button size="sm" variant="ghost" className="h-8 w-8 bg-background/90 backdrop-blur-sm border shadow-lg hover:bg-background/95" onClick={togglePlaylistExpanded}>
            <TbChevronLeft />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      <DragAbleTitle
        title={<div className="text-xs font-medium truncate">{title}</div>}
        actions={
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {list.length > 0 && (
                <>
                  <Button size={'icon'} className="w-8 h-8" variant={'ghost'} onClick={() => go(-1)} disabled={!list.length}>
                    <TbArrowLeft />
                  </Button>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {index >= 0 ? index + 1 : '-'} / {list.length || '-'}
                  </span>
                  <Button size={'icon'} className="w-8 h-8" variant={'ghost'} onClick={() => go(1)} disabled={!list.length}>
                    <TbArrowRight />
                  </Button>
                </>
              )}
            </div>
          </>
        }
      />
      {/* Content */}
      <div className="h-full overflow-hidden" style={{ height: 'calc(100% - 36px)' }}>
        {data && isPlaylistExpanded && (list.length > 0 || hasSubtitlePanel) ? (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={75}>{renderMainContent()}</ResizablePanel>
            <ResizableHandle className="hover:bg-primary" withHandle />
            <ResizablePanel defaultSize={25} minSize={15}>
              {hasSubtitlePanel ? renderSubtitlePanel() : renderPlaylistContent()}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          renderMainContent()
        )}
      </div>
    </div>
  );
};

export default ResourcePreviewWindow;
