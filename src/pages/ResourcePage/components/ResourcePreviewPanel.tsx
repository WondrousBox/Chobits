import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbExternalLink, TbMaximize, TbX } from 'react-icons/tb';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { BroadcastChannelManager, CHANNEL_NAMES, type MediaSyncMessage } from '@/utils/broadcastChannels';

import type { ResourceItem } from '../types';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from '../utils/resourceProtocol';
import { isSubtitleFile } from '../utils/subtitleUtils';
import { ImagePlayer, MediaPlayer } from './Players';
import type { MediaPlayerRef } from './Players/MediaPlayer/MediaPlayer';
import ResourceTabs from './ResourceTabs';

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
  const navigate = useNavigate();
  const [data, setData] = useState<ResourceItem>(resource);
  const [subtitleList, setSubtitleList] = useState<ResourceItem[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<ResourceItem | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const mediaPlayerRef = useRef<MediaPlayerRef>(null);

  // 判断资源类型（提前定义，供多处使用）
  const isVideo = isVideoFile(data?.filePath);
  const isAudio = isAudioFile(data?.filePath);
  const isImage = isImageFile(data?.filePath);

  // 当外部 resource 变化时，更新内部状态
  useEffect(() => {
    setData(resource);
    setCurrentTime(0);
    setMediaDuration(0);
  }, [resource]);

  // 处理资源切换（来自 ResourceFileList 的点击）
  const handleResourceChange = useCallback(
    (newResource: ResourceItem) => {
      setData(newResource);
      setCurrentTime(0);
      onResourceChange?.(newResource);
    },
    [onResourceChange]
  );

  // 当当前资源为视频或音频时，加载其子资源中的字幕文件
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

  // 监听弹窗的播放进度同步和互斥播放
  useEffect(() => {
    const channel = BroadcastChannelManager.acquire(CHANNEL_NAMES.MEDIA_SYNC);

    const handleMessage = (event: MessageEvent<MediaSyncMessage>): void => {
      const { type } = event.data;
      // 播放进度同步（弹窗关闭时）
      if (type === 'playbackProgress' && event.data.resourceId === data?.id && event.data.currentTime > 0) {
        if (mediaPlayerRef?.current) {
          mediaPlayerRef?.current.seekTo(event.data.currentTime);
        }
        setCurrentTime(event.data.currentTime);
      }
      // 互斥播放：弹窗开始播放时，面板暂停
      if (type === 'playStarted' && event.data.source === 'window' && event.data.resourceId === data?.id) {
        mediaPlayerRef?.current?.pause();
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
    // 触发自定义事件，通知 ResourceSubtitlePlayer
    window.dispatchEvent(new CustomEvent('custom:media-state-change', { detail: { isPlaying: true } }));
  }, [data?.id]);

  // 面板暂停时通知弹窗（可选）
  const handlePause = useCallback(() => {
    if (!data?.id) return;
    BroadcastChannelManager.postMessage(CHANNEL_NAMES.MEDIA_SYNC, {
      type: 'pause',
      source: 'panel',
      resourceId: data.id
    });
    // 触发自定义事件，通知 ResourceSubtitlePlayer
    window.dispatchEvent(new CustomEvent('custom:media-state-change', { detail: { isPlaying: false } }));
  }, [data?.id]);

  // 截图保存为资源：上传图片文件并创建子资源（type=screenshot），不在主资源列表直接展示
  const handleScreenshot = useCallback(
    async (blob: Blob) => {
      if (!data?.id) return;
      try {
        const buffer = await blob.arrayBuffer();
        const now = new Date();
        const pad = (n: number): string => n.toString().padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(
          now.getSeconds()
        )}`;
        const baseName = data.title || data.filePath || data.url || 'screenshot';
        const safeName = String(baseName).split(/[\\/]/).pop() || 'screenshot';
        const fileName = `${safeName}-${ts}.png`;

        const uploadResult = await window.YUA.resource.uploadResourceFile({
          fileName,
          data: buffer,
          workspaceId: data.workspaceId || undefined,
          folderId: data.folderId ?? null
        });

        if (!uploadResult?.success || !uploadResult.filePath) {
          console.warn('upload screenshot file failed', uploadResult);
          return;
        }

        const seconds = Math.floor(currentTime);
        const mm = Math.floor(seconds / 60)
          .toString()
          .padStart(2, '0');
        const ss = Math.floor(seconds % 60)
          .toString()
          .padStart(2, '0');

        await window.YUA.resource['resource:add']({
          resource: {
            type: 'screenshot',
            filePath: uploadResult.filePath,
            workspaceId: data.workspaceId,
            folderId: data.folderId,
            parentResourceId: data.id,
            title: `截图 @ ${mm}:${ss}`
          }
        });
      } catch (e) {
        console.warn('save screenshot resource failed', e);
      }
    },
    [data, currentTime]
  );

  if (!data) {
    return <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">选择资源进行预览</div>;
  }

  const title = data.title || data.filePath || data.url || data.id;
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url;

  // 渲染主要内容（播放器）- 仅用于视频、音频、图片等媒体类型
  // 文本类型（字幕、JSON、TXT等）将在"内容"Tab 中显示
  const renderMainContent = (): React.ReactNode => {
    // 视频：使用 aspect-video 保持 16:9 比例
    if (isVideo && fileSrc) {
      return (
        <div className="w-full aspect-video bg-black">
          <MediaPlayer
            ref={mediaPlayerRef}
            src={fileSrc}
            type="video"
            title={title}
            autoPlay={false}
            className="w-full h-full"
            onTimeUpdate={setCurrentTime}
            onDurationChange={setMediaDuration}
            onPlay={handlePlay}
            onPause={handlePause}
            onScreenshot={handleScreenshot}
          />
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
          <MediaPlayer ref={mediaPlayerRef} src={fileSrc} type="audio" title={title} autoPlay={false} className="w-full" onTimeUpdate={setCurrentTime} onDurationChange={setMediaDuration} onPlay={handlePlay} />
        </div>
      );
    }

    // 字幕和其他文本类型：不在此处渲染，将在"内容"Tab 中显示
    return null;
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
              if ((isVideo || isAudio) && mediaPlayerRef?.current) {
                startTime = mediaPlayerRef?.current?.getCurrentTime();
                mediaPlayerRef?.current?.pause();
              }
              // 通过路由跳转到大屏预览模式
              const searchParams = new URLSearchParams();
              if (startTime && startTime > 0) {
                searchParams.set('startTime', startTime.toString());
              }
              navigate(`/resources/preview/${data.id}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);
            }}
            title="展开大屏模式"
          >
            <TbMaximize className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="w-7 h-7"
            variant="ghost"
            onClick={() => {
              // 获取当前播放时间并暂停视频
              let startTime: number | undefined;
              if ((isVideo || isAudio) && mediaPlayerRef?.current) {
                startTime = mediaPlayerRef?.current?.getCurrentTime();
                mediaPlayerRef?.current?.pause();
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
        {/* 播放器区域 - 仅用于视频、音频、图片等媒体类型 */}
        {(isVideo || isAudio || isImage) && <div className="shrink-0">{renderMainContent()}</div>}

        {/* 功能标签区域 */}
        <ResourceTabs
          panelId="preview-panel-main"
          resource={data}
          currentTime={currentTime}
          mediaDuration={mediaDuration > 0 ? mediaDuration : undefined}
          mediaPlayerRef={mediaPlayerRef}
          subtitleList={subtitleList}
          activeSubtitle={activeSubtitle}
          setActiveSubtitle={setActiveSubtitle}
          onResourceChange={handleResourceChange}
          onMediaPlay={handlePlay}
          onMediaPause={handlePause}
          defaultPinnedTabs={['content', 'subtitle', 'translate', 'summary', 'list']}
        />
      </div>
    </div>
  );
};

export default ResourcePreviewPanel;
