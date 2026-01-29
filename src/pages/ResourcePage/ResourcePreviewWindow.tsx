import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowLeft, TbLayoutBottombar, TbLayoutBottombarFilled, TbLayoutSidebarRight, TbLayoutSidebarRightFilled } from 'react-icons/tb';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { BroadcastChannelManager, CHANNEL_NAMES, type MediaSyncMessage } from '@/utils/broadcastChannels';

import { ImagePlayer, MediaPlayer, ResourceSubtitlePlayer, TextPlayer } from './components/Players';
import type { MediaPlayerRef } from './components/Players/MediaPlayer/MediaPlayer';
import ResourceTabs from './components/ResourceTabs';
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
  const params = useParams<{ resourceId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // 判断是否为路由模式（通过检查是否有 resourceId 参数）
  const isRouteMode = !!params.resourceId;

  const [data, setData] = useState<ResourceItem | null>(null);
  const [subtitleList, setSubtitleList] = useState<ResourceItem[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<ResourceItem | null>(null);
  const TABS_EXPANDED_KEY = 'chobits:resource-preview:tabsExpanded';
  const BOTTOM_EXPANDED_KEY = 'chobits:resource-preview:bottomExpanded';
  const [isTabsExpanded, setIsTabsExpandedState] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(TABS_EXPANDED_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return true;
  });
  const [isBottomExpanded, setIsBottomExpandedState] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem(BOTTOM_EXPANDED_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return true;
  });
  const [currentTime, setCurrentTime] = useState(0); // 当前播放时间（秒）
  const [pendingStartTime, setPendingStartTime] = useState<number | null>(null); // 待跳转的起始时间
  const mediaPlayerRef = useRef<MediaPlayerRef>(null); // 媒体播放器的 ref

  // 已移除 shouldCollapseBottomPanel 相关逻辑，统一展示底部面板

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

  // 切换 Tab 面板展开/收起
  const toggleTabsExpanded = useCallback(() => {
    setIsTabsExpandedState((prev) => {
      const next = !prev;
      localStorage.setItem(TABS_EXPANDED_KEY, String(next));
      return next;
    });
  }, []);

  // 切换底部面板展开/收起
  const toggleBottomExpanded = useCallback(() => {
    setIsBottomExpandedState((prev) => {
      const next = !prev;
      localStorage.setItem(BOTTOM_EXPANDED_KEY, String(next));
      return next;
    });
  }, []);

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

  // 当当前资源为视频或音频时，加载其子资源中的字幕文件
  // 注意：完整资源信息已在 handleResourceChange 和初始化 handler 中获取，无需重复获取
  // 注意：currentTime 的重置已在 handleResourceChange 和初始化 handler 中处理，此处不应重复
  useEffect(() => {
    const loadSubtitles = async (): Promise<void> => {
      if (!data?.id || (data.type !== 'video' && data.type !== 'audio')) {
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

  // 路由模式：从路由参数加载资源
  useEffect(() => {
    if (!isRouteMode || !params.resourceId) return;

    const loadResourceFromRoute = async (): Promise<void> => {
      try {
        const resourceId = params.resourceId!;
        const fullResource = await window.ipcRenderer.invoke('getResource', { id: resourceId });
        if (fullResource) {
          setData(fullResource);
          // 从查询参数获取起始时间
          const startTimeParam = searchParams.get('startTime');
          const startTime = startTimeParam ? parseFloat(startTimeParam) : 0;
          setCurrentTime(startTime);
          if (startTime > 0) {
            setPendingStartTime(startTime);
          }
        }
      } catch (error) {
        console.warn('Failed to load resource from route:', error);
      }
    };

    loadResourceFromRoute();
  }, [isRouteMode, params.resourceId, searchParams]);

  // 窗口模式：监听资源数据推送
  useEffect(() => {
    if (isRouteMode) return; // 路由模式下不监听窗口事件

    const hasReceivedDataRef = { current: false };

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
  }, [isRouteMode]);

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

  // 窗口关闭时广播播放进度，以便右侧面板同步（仅窗口模式）
  useEffect(() => {
    if (isRouteMode) return; // 路由模式下不处理 beforeunload

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
  }, [data?.id, isRouteMode]);

  // 弹窗播放时通知面板暂停
  const handlePlay = useCallback(() => {
    if (!data?.id) return;
    // 使用管理器发送一次性消息
    BroadcastChannelManager.postMessage(CHANNEL_NAMES.MEDIA_SYNC, {
      type: 'playStarted',
      source: 'window',
      resourceId: data.id
    });
  }, [data]);

  if (!data) {
    return <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">等待资源数据...</div>;
  }

  const title = data.title || data.filePath || data.url || data.id;
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url;

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
      {isSubtitleFile(data.filePath) && <ResourceSubtitlePlayer resource={data} />}
      {!isImageFile(data.filePath) && !isVideoFile(data.filePath) && !isAudioFile(data.filePath) && !isSubtitleFile(data.filePath) && <TextPlayer resource={data} />}
    </div>
  );

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden">
      {/* Header */}
      {isRouteMode ? (
        <div className="flex items-center w-full drag-region gap-2 h-9 px-2 box-border bg-background">
          <Button variant="ghost" size="icon" className="h-8 w-8 no-drag" onClick={() => navigate(-1)}>
            <TbArrowLeft />
          </Button>
          {title}
        </div>
      ) : (
        <DragAbleTitle
          title={<div className="text-xs font-medium truncate">{title}</div>}
          actions={
            <>
              <Button size="icon" className="w-8 h-8" variant="ghost" onClick={toggleBottomExpanded} title={isBottomExpanded ? '收起底栏' : '展开底栏'}>
                {isBottomExpanded ? <TbLayoutBottombarFilled /> : <TbLayoutBottombar />}
              </Button>
              <Button size="icon" className="w-8 h-8" variant="ghost" onClick={toggleTabsExpanded} title={isTabsExpanded ? '收起标签' : '展开标签'}>
                {isTabsExpanded ? <TbLayoutSidebarRightFilled /> : <TbLayoutSidebarRight />}
              </Button>
            </>
          }
        />
      )}
      {/* Content */}
      <div className="h-full overflow-hidden" style={{ height: 'calc(100% - 36px)' }}>
        {data && (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* 左侧：垂直布局（播放器 + 底部 ResourceTabs） */}
            <ResizablePanel defaultSize={isTabsExpanded ? 60 : 100}>
              <ResizablePanelGroup direction="vertical" className="h-full">
                {/* 上方：播放器 */}
                <ResizablePanel defaultSize={isBottomExpanded ? 60 : 100} minSize={30}>
                  {renderMainContent()}
                </ResizablePanel>
                {/* 下方：ResourceTabs 底部面板 */}
                {isBottomExpanded && (
                  <>
                    <ResizableHandle className="hover:bg-primary" withHandle />
                    <ResizablePanel defaultSize={40} minSize={0} collapsible={true}>
                      <div className="h-full flex flex-col overflow-hidden bg-background border-t">
                        <ResourceTabs
                          panelId="preview-window-bottom"
                          resource={data}
                          currentTime={currentTime}
                          mediaPlayerRef={mediaPlayerRef}
                          subtitleList={subtitleList}
                          activeSubtitle={activeSubtitle}
                          setActiveSubtitle={setActiveSubtitle}
                          onResourceChange={handleResourceChange}
                          defaultPinnedTabs={['subtitle', 'translate']}
                        />
                      </div>
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            </ResizablePanel>
            {/* 右侧：ResourceTabs 侧边栏 */}
            {isTabsExpanded && (
              <>
                <ResizableHandle className="hover:bg-primary" withHandle />
                <ResizablePanel defaultSize={40} minSize={20}>
                  <div className="h-full flex flex-col overflow-hidden bg-background border-l">
                    <ResourceTabs
                      panelId="preview-window-sidebar"
                      resource={data}
                      currentTime={currentTime}
                      mediaPlayerRef={mediaPlayerRef}
                      subtitleList={subtitleList}
                      activeSubtitle={activeSubtitle}
                      setActiveSubtitle={setActiveSubtitle}
                      onResourceChange={handleResourceChange}
                      defaultPinnedTabs={['summary', 'list']}
                    />
                  </div>
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
