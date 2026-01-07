import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbFileDescription, TbList } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { BroadcastChannelManager, CHANNEL_NAMES, type MediaSyncMessage } from '@/utils/broadcastChannels';

import { ImagePlayer, MediaPlayer, SubtitlePlayer, TextPlayer } from './components/Players';
import type { MediaPlayerRef } from './components/Players/MediaPlayer/MediaPlayer';
import ResourceFileList from './components/ResourceFileList';
import type { ResourceItem } from './types';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from './utils/resourceProtocol';
import { isSubtitleFile } from './utils/subtitleUtils';

interface IncomingPayload {
  current: ResourceItem;
  list?: ResourceItem[];
  index?: number;
  startTime?: number; // 从指定时间开始播放（秒）
}

// 类型守卫：判断 payload 是否为 IncomingPayload
function isIncomingPayload(payload: unknown): payload is IncomingPayload {
  return typeof payload === 'object' && payload !== null && 'current' in payload;
}

const ResourcePreviewWindow: React.FC = () => {
  const [data, setData] = useState<ResourceItem | null>(null);
  const [subtitleList, setSubtitleList] = useState<ResourceItem[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<ResourceItem | null>(null);
  const [isPlaylistExpanded, setIsPlaylistExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0); // 当前播放时间（秒）
  const [pendingStartTime, setPendingStartTime] = useState<number | null>(null); // 待跳转的起始时间
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

  // 处理 startTime 跳转（视频和音频都适用）
  useEffect(() => {
    if (pendingStartTime === null || pendingStartTime <= 0) {
      return;
    }
    // 延迟执行，确保媒体已加载
    const timer = setTimeout(() => {
      mediaPlayerRef.current?.seekTo(pendingStartTime);
      setPendingStartTime(null);
    }, 150);
    return () => clearTimeout(timer);
  }, [pendingStartTime]);

  // 处理资源切换
  const handleResourceChange = useCallback(async (resource: ResourceItem) => {
    // 获取完整资源信息
    if (resource?.id) {
      try {
        const fullResource = await window.ipcRenderer.invoke('getResource', { id: resource.id });
        if (fullResource) {
          setData(fullResource);
          setCurrentTime(0); // 切换资源时重置播放时间
        } else {
          setData(resource);
        }
      } catch (error) {
        console.warn('Failed to fetch full resource details:', error);
        setData(resource);
      }
    } else {
      setData(resource);
    }
  }, []);

  // 切换文件列表展开/收起
  const togglePlaylistExpanded = useCallback(() => {
    setIsPlaylistExpanded((prev) => !prev);
  }, []);

  // 当当前资源为视频时，加载其子资源中的字幕文件
  // 注意：完整资源信息已在 handleResourceChange 和初始化 handler 中获取，无需重复获取
  // 注意：currentTime 的重置已在 handleResourceChange 和初始化 handler 中处理，此处不应重复
  useEffect(() => {
    const loadSubtitles = async (): Promise<void> => {
      if (!data?.id || data.type !== 'video') {
        setSubtitleList([]);
        setActiveSubtitle(null);
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

  // 用于跟踪是否已接收到数据（避免闭包陷阱）
  const hasReceivedDataRef = useRef(false);

  // 监听资源数据推送
  useEffect(() => {
    hasReceivedDataRef.current = false;

    const handler = async (_e: Electron.IpcRendererEvent | null, payload: IncomingPayload | ResourceItem): Promise<void> => {
      // 标记已接收到数据
      hasReceivedDataRef.current = true;

      let current: ResourceItem;
      let startTime: number | undefined;

      // 使用类型守卫判断 payload 类型
      if (isIncomingPayload(payload)) {
        current = payload.current;
        startTime = payload.startTime;
      } else {
        current = payload;
      }

      // 获取完整资源信息
      if (current?.id) {
        try {
          const fullResource = await window.ipcRenderer.invoke('getResource', { id: current.id });
          if (fullResource) {
            current = fullResource;
          }
        } catch (error) {
          console.warn('Failed to fetch full resource details:', error);
        }
      }

      setData(current);
      setCurrentTime(startTime ?? 0); // 设置初始播放时间
      // 如果有起始时间，设置待跳转时间（在视频加载完成后跳转）
      if (startTime && startTime > 0) {
        setPendingStartTime(startTime);
      }
    };
    window.ipcRenderer?.on('on:window:open:ready', handler);

    // 如果 120ms 后仍未接收到数据，主动拉取缓存（避免 race）
    const timer = setTimeout(async () => {
      // 使用 ref 判断，避免闭包陷阱
      if (!hasReceivedDataRef.current) {
        try {
          const cached = await window.YUA.window['window:payload:get']('resourcePreview');
          if (cached && !hasReceivedDataRef.current) {
            // 模拟事件处理逻辑
            handler(null, cached);
          }
        } catch {
          //
        }
      }
    }, 120);

    window.YUA.window['window:open:ready']('resourcePreview');
    return () => {
      window.ipcRenderer?.off('on:window:open:ready', handler);
      clearTimeout(timer);
    };
  }, []);

  // 使用 ref 持有 channel 实例，确保 beforeunload 时可用
  const mediaSyncChannelRef = useRef<BroadcastChannel | null>(null);

  // 初始化媒体同步 channel 并监听互斥播放事件
  useEffect(() => {
    const channel = BroadcastChannelManager.acquire(CHANNEL_NAMES.MEDIA_SYNC);
    mediaSyncChannelRef.current = channel;

    const handleMessage = (event: MessageEvent<MediaSyncMessage>): void => {
      const { type } = event.data;
      // 互斥播放：面板开始播放时，弹窗暂停
      if (type === 'playStarted' && event.data.source === 'panel' && event.data.resourceId === data?.id) {
        mediaPlayerRef.current?.pause();
      }
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      BroadcastChannelManager.release(CHANNEL_NAMES.MEDIA_SYNC);
      mediaSyncChannelRef.current = null;
    };
  }, [data?.id]);

  // 窗口关闭时广播播放进度，以便右侧面板同步
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      if (data?.id && mediaPlayerRef.current) {
        const time = mediaPlayerRef.current.getCurrentTime();
        if (time > 0 && mediaSyncChannelRef.current) {
          // 使用已持有的 channel 实例发送消息，避免竞态条件
          mediaSyncChannelRef.current.postMessage({
            type: 'playbackProgress',
            resourceId: data.id,
            currentTime: time
          });
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [data?.id]);

  // 弹窗播放时通知面板暂停
  const handlePlay = useCallback(() => {
    if (!data?.id) return;
    // 使用管理器发送一次性消息
    BroadcastChannelManager.postMessage(CHANNEL_NAMES.MEDIA_SYNC, {
      type: 'playStarted',
      source: 'window',
      resourceId: data.id
    });
  }, [data?.id]);

  if (!data) {
    return <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">等待资源数据...</div>;
  }

  const title = data.title || data.filePath || data.url || data.id;
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url;

  const hasSubtitlePanel = isVideoFile(data.filePath) && subtitleList.length > 0 && !!activeSubtitle;

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
          <SubtitlePlayer
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
    <div className="h-full relative flex items-center justify-center overflow-hidden">
      {isImageFile(data.filePath) && fileSrc && <ImagePlayer src={fileSrc} title={title} className="w-full h-full rounded-md shadow" />}
      {isVideoFile(data.filePath) && fileSrc && (
        <MediaPlayer
          ref={mediaPlayerRef}
          src={fileSrc}
          type="video"
          title={title}
          autoPlay={true}
          className="w-full h-full"
          onVideoLoaded={handleVideoLoaded}
          onTimeUpdate={setCurrentTime}
          onPlay={handlePlay}
        />
      )}
      {isAudioFile(data.filePath) && fileSrc && (
        <MediaPlayer ref={mediaPlayerRef} src={fileSrc} type="audio" title={title} autoPlay={true} className="w-full max-w-xl" onTimeUpdate={setCurrentTime} onPlay={handlePlay} />
      )}
      {isSubtitleFile(data.filePath) && <SubtitlePlayer resource={data} />}
      {!isImageFile(data.filePath) && !isVideoFile(data.filePath) && !isAudioFile(data.filePath) && !isSubtitleFile(data.filePath) && <TextPlayer resource={data} />}
    </div>
  );

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      <DragAbleTitle
        title={<div className="text-xs font-medium truncate">{title}</div>}
        actions={
          <Button size="icon" className="w-8 h-8" variant="ghost" onClick={togglePlaylistExpanded} title={isPlaylistExpanded ? '收起文件列表' : '展开文件列表'}>
            <TbList />
          </Button>
        }
      />
      {/* Content */}
      <div className="h-full overflow-hidden" style={{ height: 'calc(100% - 36px)' }}>
        {data && (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={60}>{renderMainContent()}</ResizablePanel>
            {hasSubtitlePanel && (
              <>
                <ResizableHandle className="hover:bg-primary" withHandle />
                <ResizablePanel defaultSize={40} minSize={15}>
                  {renderSubtitlePanel()}
                </ResizablePanel>
              </>
            )}
            {isPlaylistExpanded && (
              <>
                <ResizableHandle className="hover:bg-primary" withHandle />
                <ResizablePanel defaultSize={30} minSize={15}>
                  <ResourceFileList currentResource={data} onResourceChange={handleResourceChange} onClose={togglePlaylistExpanded} />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
};

export default ResourcePreviewWindow;
