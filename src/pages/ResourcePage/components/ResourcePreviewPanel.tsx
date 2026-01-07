import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbExternalLink, TbFileText, TbLanguage, TbList, TbSparkles, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BroadcastChannelManager, CHANNEL_NAMES, type MediaSyncMessage } from '@/utils/broadcastChannels';

import type { ResourceItem } from '../types';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from '../utils/resourceProtocol';
import { isSubtitleFile } from '../utils/subtitleUtils';
import { ImagePlayer, MediaPlayer, SubtitlePlayer, TextPlayer } from './Players';
import type { MediaPlayerRef } from './Players/MediaPlayer/MediaPlayer';
import ResourceFileList from './ResourceFileList';

// 功能标签类型
type TabType = 'subtitle' | 'translate' | 'summary' | 'list';

interface TabConfig {
  id: TabType;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

// 所有可用的标签配置（使用组件引用而非 JSX 实例，避免模块加载时创建对象）
const ALL_TABS: TabConfig[] = [
  { id: 'translate', label: '翻译', Icon: TbLanguage },
  { id: 'subtitle', label: '字幕', Icon: TbFileText },
  { id: 'summary', label: '总结', Icon: TbSparkles },
  { id: 'list', label: '列表', Icon: TbList }
];

interface ResourcePreviewPanelProps {
  /** 当前预览的资源 */
  resource: ResourceItem;
  /** 资源列表（用于切换） */
  resourceList?: ResourceItem[];
  /** 关闭面板回调 */
  onClose?: () => void;
  /** 切换资源回调 */
  onResourceChange?: (resource: ResourceItem) => void;
}

/**
 * 资源预览侧边面板组件
 * 在主界面右侧滑出显示资源预览，支持视频、音频、图片、文本、字幕等类型
 */
const ResourcePreviewPanel: React.FC<ResourcePreviewPanelProps> = ({ resource, resourceList, onClose, onResourceChange }) => {
  const [data, setData] = useState<ResourceItem>(resource);
  const [subtitleList, setSubtitleList] = useState<ResourceItem[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<ResourceItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('subtitle');
  const [currentTime, setCurrentTime] = useState(0);
  const mediaPlayerRef = useRef<MediaPlayerRef>(null);

  // 判断资源类型（提前定义，供多处使用）
  const isVideo = isVideoFile(data?.filePath);
  const isAudio = isAudioFile(data?.filePath);
  const isImage = isImageFile(data?.filePath);
  const isSubtitle = isSubtitleFile(data?.filePath);

  // 根据资源类型获取可用的标签
  const availableTabs = useMemo((): TabConfig[] => {
    if (isVideo) {
      // 视频：显示所有标签
      return ALL_TABS;
    } else if (isAudio) {
      // 音频：翻译、总结、列表
      return ALL_TABS.filter((t) => ['translate', 'summary', 'list'].includes(t.id));
    } else if (isImage) {
      // 图片：总结、列表
      return ALL_TABS.filter((t) => ['summary', 'list'].includes(t.id));
    } else if (isSubtitle) {
      // 字幕：翻译、总结、列表
      return ALL_TABS.filter((t) => ['translate', 'summary', 'list'].includes(t.id));
    } else {
      // 其他文本：翻译、总结、列表
      return ALL_TABS.filter((t) => ['translate', 'summary', 'list'].includes(t.id));
    }
  }, [isVideo, isAudio, isImage, isSubtitle]);

  // 当外部 resource 变化时，更新内部状态
  useEffect(() => {
    setData(resource);
    setCurrentTime(0);
  }, [resource]);

  // 当可用标签变化时，确保当前选中的标签有效
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find((t) => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // 处理资源切换（来自 ResourceFileList 的点击）
  const handleResourceChange = useCallback(
    (newResource: ResourceItem) => {
      setData(newResource);
      setCurrentTime(0);
      onResourceChange?.(newResource);
    },
    [onResourceChange]
  );

  // 当当前资源为视频时，加载其子资源中的字幕文件
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

  // 监听弹窗的播放进度同步和互斥播放
  useEffect(() => {
    const channel = BroadcastChannelManager.acquire(CHANNEL_NAMES.MEDIA_SYNC);

    const handleMessage = (event: MessageEvent<MediaSyncMessage>): void => {
      const { type } = event.data;
      // 播放进度同步（弹窗关闭时）
      if (type === 'playbackProgress' && event.data.resourceId === data?.id && event.data.currentTime > 0) {
        if (mediaPlayerRef.current) {
          mediaPlayerRef.current.seekTo(event.data.currentTime);
        }
        setCurrentTime(event.data.currentTime);
      }
      // 互斥播放：弹窗开始播放时，面板暂停
      if (type === 'playStarted' && event.data.source === 'window' && event.data.resourceId === data?.id) {
        mediaPlayerRef.current?.pause();
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      BroadcastChannelManager.release(CHANNEL_NAMES.MEDIA_SYNC);
    };
  }, [data?.id]);

  // 面板播放时通知弹窗暂停
  const handlePlay = useCallback(() => {
    if (!data?.id) return;
    BroadcastChannelManager.postMessage(CHANNEL_NAMES.MEDIA_SYNC, {
      type: 'playStarted',
      source: 'panel',
      resourceId: data.id
    });
  }, [data?.id]);

  if (!data) {
    return <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">选择资源进行预览</div>;
  }

  const title = data.title || data.filePath || data.url || data.id;
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url;

  // 渲染主要内容（播放器）
  const renderMainContent = (): React.ReactNode => {
    // 视频：使用 aspect-video 保持 16:9 比例
    if (isVideo && fileSrc) {
      return (
        <div className="w-full aspect-video bg-black">
          <MediaPlayer ref={mediaPlayerRef} src={fileSrc} type="video" title={title} autoPlay={false} className="w-full h-full" onTimeUpdate={setCurrentTime} onPlay={handlePlay} />
        </div>
      );
    }

    // 图片：自适应宽高比，限制最大高度
    if (isImage && fileSrc) {
      return (
        <div className="w-full flex items-center justify-center bg-black/5 max-h-[50vh]">
          <ImagePlayer src={fileSrc} title={title} className="max-w-full max-h-[50vh] object-contain rounded-md shadow" />
        </div>
      );
    }

    // 音频：固定高度
    if (isAudio && fileSrc) {
      return (
        <div className="w-full p-4 bg-muted/30">
          <MediaPlayer ref={mediaPlayerRef} src={fileSrc} type="audio" title={title} autoPlay={false} className="w-full" onTimeUpdate={setCurrentTime} onPlay={handlePlay} />
        </div>
      );
    }

    // 字幕：使用固定高度区域
    if (isSubtitle) {
      return (
        <div className="w-full h-[200px] overflow-auto">
          <SubtitlePlayer resource={data} />
        </div>
      );
    }

    // 其他文本：使用固定高度区域
    return (
      <div className="w-full h-[200px] overflow-auto">
        <TextPlayer resource={data} />
      </div>
    );
  };

  // 渲染字幕内容
  const renderSubtitleContent = (): React.ReactNode => {
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

  // 渲染翻译内容（占位）
  const renderTranslateContent = (): React.ReactNode => <div className="h-full flex items-center justify-center text-muted-foreground text-sm">翻译功能开发中...</div>;

  // 渲染总结内容（占位）
  const renderSummaryContent = (): React.ReactNode => <div className="h-full flex items-center justify-center text-muted-foreground text-sm">总结功能开发中...</div>;

  // 渲染列表内容
  const renderListContent = (): React.ReactNode => (
    <div className="h-full overflow-hidden">
      <ResourceFileList currentResource={data} onResourceChange={handleResourceChange} />
    </div>
  );

  // 渲染标签内容
  const renderTabContent = (tabId: TabType): React.ReactNode => {
    switch (tabId) {
      case 'subtitle':
        return renderSubtitleContent();
      case 'translate':
        return renderTranslateContent();
      case 'summary':
        return renderSummaryContent();
      case 'list':
        return renderListContent();
      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full bg-background text-foreground overflow-hidden flex flex-col border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30 shrink-0">
        <div className="text-xs font-medium truncate flex-1 mr-2">{title}</div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            className="w-7 h-7"
            variant="ghost"
            onClick={() => {
              // 获取当前播放时间并暂停视频
              let startTime: number | undefined;
              if ((isVideo || isAudio) && mediaPlayerRef.current) {
                startTime = mediaPlayerRef.current.getCurrentTime();
                mediaPlayerRef.current.pause();
              }
              // 使用独立窗口打开当前资源，传递播放进度
              window.YUA.window['window:open'](
                'resourcePreview',
                {
                  current: data,
                  list: resourceList,
                  index: resourceList?.findIndex((r) => r.id === data.id) ?? 0,
                  startTime
                },
                {
                  sameDisplayAsSender: true
                }
              );
            }}
            title="在弹窗中打开"
          >
            <TbExternalLink className="w-4 h-4" />
          </Button>
          <Button size="icon" className="w-7 h-7" variant="ghost" onClick={onClose} title="关闭预览">
            <TbX className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 主内容区 + 标签区 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* 播放器区域 - 根据内容自适应高度 */}
        <div className="shrink-0">{renderMainContent()}</div>

        {/* 功能标签区域 */}
        {availableTabs.length > 0 && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* 标签栏 */}
            <TabsList className="w-full justify-start rounded-none border-y bg-muted/30 h-9 px-2 shrink-0">
              {availableTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-xs gap-1.5 data-[state=active]:bg-background">
                  <tab.Icon className="w-4 h-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* 标签内容 */}
            <div className="flex-1 overflow-hidden min-h-0">
              {availableTabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="h-full m-0 data-[state=inactive]:hidden">
                  {renderTabContent(tab.id)}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default ResourcePreviewPanel;
