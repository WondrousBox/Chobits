import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowLeft, TbArrowRight, TbChevronLeft, TbChevronRight, TbDots, TbFile, TbFileDescription, TbFileText, TbLetterT, TbLink, TbMusic, TbPhoto, TbVideo } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isAudioFile, isImageFile, isVideoFile, makeResSrc } from '@/lib/resourceProtocol';

import { MediaPlayer } from './components/MediaPlayer';
import type { ResourceItem } from './types';

interface IncomingPayload {
  current: ResourceItem;
  list?: ResourceItem[];
  index?: number;
}

const ResourcePreviewWindow: React.FC = () => {
  const [data, setData] = useState<ResourceItem | null>(null);
  const [list, setList] = useState<ResourceItem[]>([]);
  const [index, setIndex] = useState<number>(-1);
  const [textContent, setTextContent] = useState<string>('');
  const [loadingText, setLoadingText] = useState(false);
  const [isPlaylistExpanded, setIsPlaylistExpanded] = useState(true);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<string>('playlist');
  const [taskResults, setTaskResults] = useState<{ transcode: any[]; transcribe: any[]; keyframes: any[]; other: any[] }>({
    transcode: [],
    transcribe: [],
    keyframes: [],
    other: []
  });
  const [loadingTaskResults, setLoadingTaskResults] = useState(false);
  const hasAutoSwitchedRef = useRef(false);
  const mainContentRef = useRef<HTMLDivElement>(null);

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

  // 加载任务结果
  const loadTaskResults = useCallback(async () => {
    if (!data?.filePath) return;
    setLoadingTaskResults(true);
    try {
      const result = await window.ipcRenderer.invoke('wf:getTaskResults', { filePath: data.filePath });
      if (result.ok && result.data) {
        setTaskResults(result.data);
      }
    } catch (error) {
      console.warn('[ResourcePreviewWindow] 加载任务结果失败', error);
    } finally {
      setLoadingTaskResults(false);
    }
  }, [data?.filePath]);

  // 当数据变化时，如果有文件路径，加载任务结果
  useEffect(() => {
    if (data?.filePath && isPlaylistExpanded) {
      // 切换资源时重置自动切换标志和任务结果
      hasAutoSwitchedRef.current = false;
      setTaskResults({ transcode: [], transcribe: [], keyframes: [], other: [] });
      loadTaskResults();
    }
  }, [data?.filePath, isPlaylistExpanded, loadTaskResults]);

  // 当首次加载到任务结果时，自动切换到任务结果tab（仅自动切换一次）
  useEffect(() => {
    const hasResults = taskResults.transcode.length > 0 || taskResults.transcribe.length > 0 || taskResults.keyframes.length > 0 || taskResults.other.length > 0;
    if (hasResults && !hasAutoSwitchedRef.current && activeSidebarTab === 'playlist') {
      setActiveSidebarTab('tasks');
      hasAutoSwitchedRef.current = true;
    }
  }, [taskResults, activeSidebarTab]);

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

  // 监听资源数据推送
  useEffect(() => {
    const handler = (_e: any, payload: IncomingPayload | ResourceItem): void => {
      console.log(payload);

      if ((payload as any).current) {
        const p = payload as IncomingPayload;
        setData(p.current);
        setList(p.list || []);
        setIndex(typeof p.index === 'number' ? p.index : p.list ? p.list.findIndex((r) => r.id === p.current.id) : -1);
      } else {
        setData(payload as ResourceItem);
        setList([]);
        setIndex(-1);
      }
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

  // 加载文本类资源内容（通过主进程读取文件内容）

  useEffect(() => {
    if (!data) {
      setTextContent('');
      return;
    }
    if (data.type === 'text' || data.type === 'document' || data.type === 'file') {
      if (data.type === 'text') {
        setTextContent(data.contentText || '');
        return;
      }

      // 优先使用 contentText
      if (data.contentText) {
        setTextContent(data.contentText || '');
        return;
      }
      // 通过主进程读取文件内容
      if (data.filePath) {
        const lower = data.filePath.toLowerCase();
        if (/(\.txt|\.md|\.log|\.json|\.csv|\.ts|\.js|\.tsx|\.jsx|\.py|\.go|\.rs|\.java|\.c|\.cpp|\.yml|\.yaml|\.toml|\.ini)$/i.test(lower)) {
          setLoadingText(true);
          window.YUA.file['file:readContent'](data.filePath, 20000)
            .then((result: any) => {
              if (result.success) {
                let content = result.content || '';
                if (result.truncated) {
                  content += `\n\n...（文件已截取，原始大小: ${Math.round(result.originalSize / 1024)}KB）`;
                }
                setTextContent(content);
              } else {
                setTextContent('（无法加载文本内容）');
              }
            })
            .catch(() => setTextContent('（无法加载文本内容）'))
            .finally(() => setLoadingText(false));
          return;
        }
      }
      setTextContent('（暂无提取文本）');
    } else {
      setTextContent('');
    }
  }, [data]);

  // END: resource subscription

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        window.YUA.window['window:close']('resourcePreview');
      }
      if (e.key === 'PageUp') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'PageDown') {
        e.preventDefault();
        go(1);
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && list.length) {
        e.preventDefault();
        go(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, list.length]);

  // 格式化文件大小
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  // 处理任务结果文件点击
  const handleTaskFileClick = useCallback((filePath: string) => {
    const fileSrc = makeResSrc(filePath);
    window.open(fileSrc, '_blank');
  }, []);

  // 渲染任务结果文件列表
  const renderTaskFileList = useCallback(
    (files: any[], type: string) => {
      if (files.length === 0) {
        return (
          <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
            暂无{type === 'transcode' ? '转码' : type === 'transcribe' ? '转录' : type === 'keyframes' ? '关键帧' : '其他'}结果
          </div>
        );
      }

      return (
        <div className="p-2 space-y-1">
          {files.map((file, idx) => {
            const fileSrc = makeResSrc(file.path);
            const isImage = isImageFile(file.path);
            const isVideo = isVideoFile(file.path);
            const isAudio = isAudioFile(file.path);
            const ext = file.name.split('.').pop()?.toLowerCase() || '';

            return (
              <div
                key={`${file.path}-${idx}`}
                onClick={() => handleTaskFileClick(file.path)}
                className="flex items-center gap-2 p-2 rounded cursor-pointer transition-colors hover:bg-muted/50 border border-transparent hover:border-border"
              >
                {/* 文件图标或预览 */}
                <div className="w-12 h-12 flex-shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                  {isImage ? (
                    <img src={fileSrc} alt={file.name} className="w-full h-full object-cover" />
                  ) : isVideo ? (
                    <TbVideo className="w-6 h-6 text-muted-foreground" />
                  ) : isAudio ? (
                    <TbFile className="w-6 h-6 text-muted-foreground" />
                  ) : ext === 'txt' || ext === 'srt' || ext === 'vtt' ? (
                    <TbFileText className="w-6 h-6 text-muted-foreground" />
                  ) : (
                    <TbFile className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                {/* 文件信息 */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{file.name}</div>
                  <div className="text-[10px] text-muted-foreground">{formatFileSize(file.size)}</div>
                </div>
              </div>
            );
          })}
        </div>
      );
    },
    [formatFileSize, handleTaskFileClick]
  );

  // 判断是否有任务结果
  const hasTaskResults = taskResults.transcode.length > 0 || taskResults.transcribe.length > 0 || taskResults.keyframes.length > 0 || taskResults.other.length > 0;

  if (!data) {
    return <div className="w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm">等待资源数据...</div>;
  }

  const title = data.title || data.filePath || data.url || data.id;
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url;

  // 渲染文件列表内容（包含 Tabs）
  const renderPlaylistContent = (): React.ReactNode => {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-background border-l">
        <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground flex items-center justify-between">
          <Button size="sm" variant="ghost" className="h-8 w-8" onClick={togglePlaylistExpanded}>
            <TbChevronRight />
          </Button>
          <span>文件列表 ({list.length})</span>
        </div>
        <Tabs value={activeSidebarTab} onValueChange={setActiveSidebarTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-2 mt-2 h-auto p-1">
            <TabsTrigger value="playlist" className="text-[10px] py-1 flex-1">
              文件列表
            </TabsTrigger>
            {hasTaskResults && (
              <TabsTrigger value="tasks" className="text-[10px] py-1 flex-1">
                任务结果
              </TabsTrigger>
            )}
          </TabsList>
          <ScrollArea className="flex-1">
            <TabsContent value="playlist" className="m-0 h-full">
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
            </TabsContent>
            {hasTaskResults && (
              <TabsContent value="tasks" className="m-0 h-full">
                {loadingTaskResults ? (
                  <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">加载中...</div>
                ) : (
                  <Tabs
                    defaultValue={taskResults.transcribe.length > 0 ? 'transcribe' : taskResults.transcode.length > 0 ? 'transcode' : taskResults.keyframes.length > 0 ? 'keyframes' : 'other'}
                    className="h-full flex flex-col"
                  >
                    <TabsList className="mx-2 mt-2 h-auto p-1 grid grid-cols-2">
                      {taskResults.transcribe.length > 0 && (
                        <TabsTrigger value="transcribe" className="text-[10px] py-1">
                          转录 ({taskResults.transcribe.length})
                        </TabsTrigger>
                      )}
                      {taskResults.transcode.length > 0 && (
                        <TabsTrigger value="transcode" className="text-[10px] py-1">
                          转码 ({taskResults.transcode.length})
                        </TabsTrigger>
                      )}
                      {taskResults.keyframes.length > 0 && (
                        <TabsTrigger value="keyframes" className="text-[10px] py-1">
                          关键帧 ({taskResults.keyframes.length})
                        </TabsTrigger>
                      )}
                      {taskResults.other.length > 0 && (
                        <TabsTrigger value="other" className="text-[10px] py-1">
                          其他 ({taskResults.other.length})
                        </TabsTrigger>
                      )}
                    </TabsList>
                    <ScrollArea className="flex-1">
                      {taskResults.transcribe.length > 0 && (
                        <TabsContent value="transcribe" className="m-0 h-full">
                          {renderTaskFileList(taskResults.transcribe, 'transcribe')}
                        </TabsContent>
                      )}
                      {taskResults.transcode.length > 0 && (
                        <TabsContent value="transcode" className="m-0 h-full">
                          {renderTaskFileList(taskResults.transcode, 'transcode')}
                        </TabsContent>
                      )}
                      {taskResults.keyframes.length > 0 && (
                        <TabsContent value="keyframes" className="m-0 h-full">
                          {renderTaskFileList(taskResults.keyframes, 'keyframes')}
                        </TabsContent>
                      )}
                      {taskResults.other.length > 0 && (
                        <TabsContent value="other" className="m-0 h-full">
                          {renderTaskFileList(taskResults.other, 'other')}
                        </TabsContent>
                      )}
                    </ScrollArea>
                  </Tabs>
                )}
              </TabsContent>
            )}
          </ScrollArea>
        </Tabs>
      </div>
    );
  };

  // 渲染主要内容
  const renderMainContent = (): React.ReactNode => (
    <div ref={mainContentRef} className="h-full relative flex items-center justify-center overflow-hidden">
      {isImageFile(data.filePath) && fileSrc && <img src={fileSrc} alt={title} className="max-w-full max-h-full object-contain rounded-md shadow" />}
      {isVideoFile(data.filePath) && fileSrc && <MediaPlayer src={fileSrc} type="video" title={title} autoPlay={true} className="w-full h-full" onVideoLoaded={handleVideoLoaded} />}
      {isAudioFile(data.filePath) && fileSrc && <MediaPlayer src={fileSrc} type="audio" title={title} autoPlay={true} className="w-full max-w-xl" />}
      {!isImageFile(data.filePath) && !isVideoFile(data.filePath) && !isAudioFile(data.filePath) && (
        <div className="w-full h-full text-xs text-muted-foreground break-words">
          {(data.type === 'text' || textContent) && (
            <div className="w-full h-full box-border select-text overflow-auto rounded border px-2 text-left whitespace-pre-wrap font-mono text-xs leading-relaxed shadow-inner">
              {loadingText ? '加载中…' : textContent || '（无文本内容）'}
            </div>
          )}
          {!(data.type === 'text') && !textContent && fileSrc && <div className="text-[11px] break-all">来源: {fileSrc}</div>}
        </div>
      )}

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
        {(list.length > 0 || data) && isPlaylistExpanded ? (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={75} minSize={30}>
              {renderMainContent()}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
              {renderPlaylistContent()}
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
