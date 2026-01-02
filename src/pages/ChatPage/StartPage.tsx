import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbDownload, TbLoader2, TbMicrophone, TbMicrophoneOff, TbWorld, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import ChatInput from './components/ChatInput';

// URL检测函数
const isVideoUrl = (url: string): boolean => {
  const videoPatterns = [
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /^https?:\/\/(www\.)?bilibili\.com\/video\/.+/,
    /^https?:\/\/(www\.)?bilibili\.com\/bangumi\/play\/.+/,
    /^https?:\/\/(www\.)?vimeo\.com\/.+/,
    /^https?:\/\/(www\.)?dailymotion\.com\/video\/.+/,
    /^https?:\/\/(www\.)?twitch\.tv\/videos\/.+/,
    /^https?:\/\/(www\.)?tiktok\.com\/@.+\/video\/.+/,
    /^https?:\/\/(www\.)?douyin\.com\/video\/.+/,
    /^https?:\/\/(www\.)?iqiyi\.com\/v_.+/,
    /^https?:\/\/(www\.)?youku\.com\/v_show\/.+/,
    /^https?:\/\/(www\.)?tencent\.com\/video\/.+/
  ];
  return videoPatterns.some((pattern) => pattern.test(url));
};

const isWebUrl = (text: string): boolean => {
  const urlPattern = /^https?:\/\/[^\s]+$/;
  return urlPattern.test(text.trim());
};
const AssistantPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [phIndex, setPhIndex] = useState(() => Math.floor(Math.random() * 7));
  const [opening, setOpening] = useState(true);
  const [closing, setClosing] = useState(false);
  const [showVideoButton, setShowVideoButton] = useState(false);
  const [showWebButton, setShowWebButton] = useState(false);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [isAnalyzingWeb, setIsAnalyzingWeb] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const contentRootRef = useRef<HTMLDivElement | null>(null);
  const inputBlockRef = useRef<HTMLDivElement | null>(null);
  // 控制当实例下拉展开时，暂停自动尺寸调整
  const instanceMenuOpenRef = useRef<boolean>(false);

  const handleToggleRecording = useCallback(async () => {
    try {
      if (isRecording) {
        await window.YUA.recorder.stop();
        setIsRecording(false);
      } else {
        await window.YUA.recorder.start();
        setIsRecording(true);
      }
    } catch (error) {
      console.error('Failed to toggle recording:', error);
      setIsRecording(false);
    }
  }, [isRecording]);

  // 实例选择由 ChatInput 自行管理；主进程在新增资源后会自动打标签，无需渲染进程参与

  const placeholders = [
    '输入问题，如：总结最近导入的 PDF...',
    '粘贴一段文字，让我帮你提炼要点',
    '帮我把这段中文翻译成英文',
    '写一个 TypeScript 函数组件示例',
    '下载这个视频并提取字幕（粘贴 URL: https://example.com/video/xxx）',
    '分析这个网页并输出摘要（粘贴 URL: https://example.com/）',
    '检索资源库中关于「会议纪要」的内容'
  ];

  // 自动聚焦由 ChatInput 控制

  // 进场动画结束标记
  useEffect(() => {
    const t = setTimeout(() => setOpening(false), 180);
    return () => clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => window.YUA.window['window:close']('assistant'), 160); // 与动画时长匹配
  }, [closing]);

  // ESC 关闭（仅全局监听 ESC）
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // 已移除自动上下文收集逻辑（剪贴板/最近资源）

  const send = async (content: string): Promise<void> => {
    if (!content.trim()) return;
    try {
      const res = await window.YUA.resource['resource:add']({ resource: { contentText: content } });

      if (res.success) console.log(res.data);
    } catch (e) {
      console.warn('[resource] save text failed', e);
    }
  };

  const handleDownloadVideo = async (): Promise<void> => {
    console.log('下载视频:', query);
    setIsAnalyzingVideo(true);
    try {
      // 获取视频信息
      const infoResult = await window.YUA.videoDownloader.getVideoInfo(query);
      if (!infoResult.success) {
        console.error('获取视频信息失败:', infoResult.error);
        return;
      }

      const videoInfo = infoResult.data;
      console.log('视频信息:', videoInfo);

      // 开始下载
      const downloadResult = await window.YUA.videoDownloader.downloadVideo({
        url: query,
        filename: videoInfo.filename || `${videoInfo.title}.${videoInfo.ext}`
      });

      if (downloadResult.success) {
        console.log('下载任务已创建:', downloadResult.data.taskId);

        // 下载任务已创建，进度将由主进程直接处理
        console.log('下载任务已创建，进度将在主窗口任务栏中显示');

        // 关闭当前助手窗口
        setTimeout(() => {
          close();
        }, 500); // 延迟500ms让用户看到成功反馈
      } else {
        console.error('创建下载任务失败:', downloadResult.error);
      }
    } catch (error) {
      console.error('下载视频时出错:', error);
    } finally {
      setIsAnalyzingVideo(false);
    }
  };

  const handleAnalyzeWeb = async (): Promise<void> => {
    console.log('分析网页:', query);
    setIsAnalyzingWeb(true);
    try {
      // 这里可以实现网页分析逻辑
      // 例如：获取网页内容、提取关键信息等
      console.log('网页分析功能待实现');
      // 模拟分析过程
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('分析网页时出错:', error);
    } finally {
      setIsAnalyzingWeb(false);
    }
  };

  // 监听输入内容识别命令模式和URL
  const onChangeText = (v: string): void => {
    setQuery(v);
    // 检测URL并设置按钮状态
    const trimmedQuery = v.trim();
    if (isWebUrl(trimmedQuery)) {
      if (isVideoUrl(trimmedQuery)) {
        setShowVideoButton(true);
        setShowWebButton(false);
      } else {
        setShowVideoButton(false);
        setShowWebButton(true);
      }
    } else {
      setShowVideoButton(false);
      setShowWebButton(false);
    }
  };

  // 轮换占位文案：仅在输入为空时，每 2 秒切换一次
  useEffect(() => {
    const isEmpty = !query.trim();
    if (!isEmpty) return;
    const t = setInterval(() => {
      setPhIndex((i) => (i + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(t);
  }, [query, placeholders.length]);

  // 统一封装：根据内容高度调整窗口大小
  const resizeToContent = useCallback(async () => {
    try {
      const html = document.documentElement;
      const blockEl = inputBlockRef.current;
      const blockRect = blockEl?.getBoundingClientRect();
      const extraMargin = 12;
      const contentHeight = Math.ceil((blockRect?.bottom ?? window.innerHeight) + extraMargin);
      const currentWidth = window.innerWidth || html.clientWidth;
      let maxW = Number.POSITIVE_INFINITY;
      let maxH = Number.POSITIVE_INFINITY;
      const screen = await window.YUA.window['screen:size:get']();
      maxW = screen.width;
      maxH = screen.height;
      const minW = 360;
      const minH = 100;
      const desiredWidth = Math.max(minW, Math.min(currentWidth, maxW));
      const padding = 0;
      const desiredHeight = Math.max(minH, Math.min(contentHeight + padding, maxH));
      await window.YUA.window['window:size:set']('assistant', desiredWidth, desiredHeight);
    } catch {
      //
    }
  }, []);

  // 根据内容高度动态调整窗口大小（含首次渲染）
  useEffect(() => {
    let disposed = false;
    let debounceTimer: number | null = null;

    const adjustWindowSize = async (): Promise<void> => {
      try {
        if (debounceTimer) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(async () => {
          if (disposed) return;
          // 菜单展开时不做自动收缩，避免刚撑开又被收回
          if (instanceMenuOpenRef.current) return;
          await resizeToContent();
        }, 90);
      } catch {
        //
      }
    };

    // 首次渲染后调整一次
    adjustWindowSize();

    // 监听内容尺寸变化
    const target = inputBlockRef.current || contentRootRef.current || document.body;
    const ro = new ResizeObserver(() => adjustWindowSize());
    try {
      ro.observe(target);
    } catch {
      /* noop */
    }

    // 监听窗口尺寸变化（例如开发者工具导致布局变化）
    const onWinResize = (): Promise<void> => adjustWindowSize();
    window.addEventListener('resize', onWinResize);

    return () => {
      disposed = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      try {
        ro.disconnect();
      } catch {
        //
      }
      window.removeEventListener('resize', onWinResize);
    };
  }, [resizeToContent]);

  // 当实例选择菜单展开时，临时增高窗口；关闭后恢复到内容高度
  const handleInstanceMenuOpenChange = useCallback(
    async (open: boolean) => {
      try {
        instanceMenuOpenRef.current = open;
        const html = document.documentElement;
        const currentWidth = window.innerWidth || html.clientWidth;
        let maxH = Number.POSITIVE_INFINITY;
        const screen = await window.YUA.window['screen:size:get']();
        maxH = screen.height;
        if (open) {
          // 预留足够空间给下拉面板
          const extra = 360;
          const desiredHeight = Math.min(Math.max(window.innerHeight + extra, 420), maxH);
          await window.YUA.window['window:size:set']('assistant', currentWidth, desiredHeight);
        } else {
          await resizeToContent();
        }
      } catch {
        //
      }
    },
    [resizeToContent]
  );

  return (
    <div ref={contentRootRef} className="w-full h-full font-sans pointer-events-auto select-none relative drag-region">
      {/* 居中浮层 */}
      <div className={`w-full flex flex-col overflow-hidden transition-all duration-180 ${opening ? 'opacity-0 scale-95' : closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        <Button className="rounded-full no-drag absolute top-2 right-2 z-10" size={'icon'} variant={'ghost'} onClick={close}>
          <TbX />
        </Button>

        {/* 输入区（统一使用 ChatInput，内置指令匹配） */}
        <div className="drag-region space-y-2">
          <div ref={inputBlockRef} className="flex items-start gap-3 relative no-drag">
            <div className="flex-1 relative">
              <ChatInput
                value={query}
                onChange={onChangeText}
                placeholder={placeholders[phIndex % placeholders.length]}
                autoFocus
                onStart={send}
                onInstanceMenuOpenChange={handleInstanceMenuOpenChange}
                footerRightExtra={
                  <>
                    {showVideoButton && (
                      <Button onClick={handleDownloadVideo} variant={'outline'} size={'icon'} className="rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white">
                        {isAnalyzingVideo ? <TbLoader2 className="animate-spin" /> : <TbDownload />}
                      </Button>
                    )}
                    {showWebButton && (
                      <Button onClick={handleAnalyzeWeb} variant={'outline'} size={'icon'} disabled={isAnalyzingWeb} className="rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                        {isAnalyzingWeb ? <TbLoader2 className="animate-spin" /> : <TbWorld />}
                      </Button>
                    )}
                    <Button
                      variant={'outline'}
                      size={'icon'}
                      className={`rounded-full ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'}`}
                      onClick={handleToggleRecording}
                    >
                      {isRecording ? <TbMicrophoneOff /> : <TbMicrophone />}
                    </Button>
                  </>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantPage;
