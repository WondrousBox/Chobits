import { utils } from '@aim-packages/subtitle';
import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowDown, TbArrowUp, TbBackground, TbBrain, TbClock, TbLoader2, TbMicrophone, TbMicrophoneOff, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { AIActionsPanel } from './components/AIActionsPanel';
import { ControlBar } from './components/ControlBar';
import { HistoryPanel } from './components/HistoryPanel';
import { SegmentList } from './components/SegmentList';
import { WaveformRef } from './components/Waveform';
import { useASR } from './hooks/useASR';
import { useTranslation } from './hooks/useTranslation';

const ASRPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [providerId, setProviderId] = useState<string>('');
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [cloudProviderId, setCloudProviderId] = useState<string>('');
  const [cloudModelId, setCloudModelId] = useState<string>('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTransparent, setIsTransparent] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  // 保存收起前的面板状态，用于恢复（使用 ref 避免在 useEffect 中触发额外渲染）
  const savedLeftPanelStateRef = useRef(false);
  const savedRightPanelStateRef = useRef(false);

  const pendingCloseRef = useRef(false);
  const waveformRef = useRef<WaveformRef>(null);

  // 获取配置参数
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const payload = (await window.YUA.window['window:payload:get']('asr' as any)) as
          | {
            enableTranslation?: boolean;
            targetLanguage?: string;
            providerId?: string;
            mode?: 'local' | 'cloud';
            cloudProviderId?: string;
            cloudModelId?: string;
          }
          | undefined;
        if (!mounted) return;
        if (payload) {
          setEnableTranslation(payload.enableTranslation || false);
          setTargetLanguage(payload.targetLanguage || 'en');
          setProviderId(payload.providerId || '');
          setMode(payload.mode || 'local');
          setCloudProviderId(payload.cloudProviderId || '');
          setCloudModelId(payload.cloudModelId || '');
        }
      } catch (error) {
        console.error('获取配置参数失败:', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const { translateText, cleanupTranslation } = useTranslation({
    enableTranslation,
    targetLanguage,
    providerId
  });

  const onAudioLevel = useCallback((level: number) => {
    waveformRef.current?.addBar(level);
  }, []);

  const { isRecording, isASRRunning, setIsASRRunning, recognizedSegments, pendingSegments, progressText, recordingDuration, startRecording, stopRecording, wsRef } = useASR({
    enableTranslation,
    translateText,
    onAudioLevel,
    mode,
    cloudProviderId,
    cloudModelId
  });

  // 停止录音（不停止 ASR 服务）
  const handleStopRecording = useCallback(async (): Promise<void> => {
    if (!isRecording || isLoading) return;
    await stopRecording();
    waveformRef.current?.clear();
  }, [isRecording, isLoading, stopRecording]);

  // 停止 ASR 服务并关闭窗口
  const handleStopASRAndClose = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    pendingCloseRef.current = true;

    try {
      // 第一步：如果正在录音，先停止录音
      if (isRecording) {
        await stopRecording();
      }

      // 第二步：关闭 WebSocket 连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      // 第三步：停止 ASR 服务
      if (isASRRunning) {
        await window.YUA.sherpa.freeInstance();
        setIsASRRunning(false);
      }

      // 第四步：关闭窗口
      window.YUA.window['window:close:self']();
    } catch (error) {
      console.error('停止 ASR 失败:', error);
      setIsLoading(false);
      pendingCloseRef.current = false;
    }
  }, [isASRRunning, isRecording, stopRecording, wsRef, setIsASRRunning]);

  // 处理窗口关闭请求
  const handleCloseRequest = useCallback(() => {
    handleStopASRAndClose();
  }, [handleStopASRAndClose]);

  // 基础窗口尺寸
  const baseWidth = 400; // 基础宽度（无面板时）
  const leftPanelWidth = 300; // 左侧历史面板的宽度
  const rightPanelWidth = 400; // 右侧AI面板的宽度（更宽）
  const baseHeight = 600; // 基础高度（展开时）
  const collapsedHeight = 200; // 收起时的高度

  // 处理收起/展开切换
  const handleToggleCollapse = useCallback(() => {
    if (isCollapsed) {
      // 展开时：恢复之前保存的面板状态
      setShowLeftPanel(savedLeftPanelStateRef.current);
      setShowRightPanel(savedRightPanelStateRef.current);
    } else {
      // 收起时：保存当前面板状态并隐藏
      savedLeftPanelStateRef.current = showLeftPanel;
      savedRightPanelStateRef.current = showRightPanel;
      setShowLeftPanel(false);
      setShowRightPanel(false);
    }
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed, showLeftPanel, showRightPanel]);

  // 根据展开/收起状态和面板显示状态调整窗口大小
  useEffect(() => {
    const adjustWindowSize = async (): Promise<void> => {
      try {
        // 收起时不显示面板，所以宽度只计算基础宽度
        // 展开时根据实际显示的面板计算宽度（使用不同的面板宽度）
        let targetWidth = baseWidth;
        if (!isCollapsed) {
          if (showLeftPanel) targetWidth += leftPanelWidth;
          if (showRightPanel) targetWidth += rightPanelWidth;
        }

        // 计算目标高度
        const targetHeight = isCollapsed ? collapsedHeight : baseHeight;

        await window.YUA.window['window:size:set']('asr' as any, targetWidth, targetHeight);
      } catch (error) {
        console.error('调整窗口大小失败:', error);
      }
    };

    adjustWindowSize();
  }, [isCollapsed, showLeftPanel, showRightPanel, baseWidth, leftPanelWidth, rightPanelWidth, baseHeight, collapsedHeight]);

  // 清理
  useEffect(() => {
    return () => {
      cleanupTranslation();
    };
  }, [cleanupTranslation]);

  return (
    <>
      <div
        className={`flex flex-col h-full rounded-3xl drag-region overflow-hidden border border-solid border-ring box-border ${isTransparent ? 'bg-transparent border-ring/50 border-b-ring/80 border-t-0' : 'bg-muted'}`}
      >
        {/* 顶部工具栏 */}
        <div className={`flex items-center justify-between gap-3 px-2 py-2 ${isTransparent ? 'border-b border-transparent' : 'border-b'}`}>
          {/* 左侧：面板控制按钮 */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant={showLeftPanel ? 'secondary' : 'ghost'} className="no-drag w-8 h-8" onClick={() => setShowLeftPanel(!showLeftPanel)}>
                  <TbClock className={`h-4 w-4 ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showLeftPanel ? '隐藏历史记录' : '显示历史记录'}</TooltipContent>
            </Tooltip>
          </div>

          {/* 中间：录音控制 */}
          <div className="flex items-center gap-2 flex-1 justify-center">
            {isRecording ? (
              <Button size="icon" variant="destructive" className="w-8 h-8 rounded-full no-drag" onClick={handleStopRecording} disabled={isLoading}>
                <TbMicrophoneOff className={isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''} />
              </Button>
            ) : (
              <Button size="icon" className="w-8 h-8 rounded-full no-drag" onClick={startRecording} disabled={!isASRRunning || isLoading}>
                {isLoading ? (
                  <TbLoader2 className={`animate-spin ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                ) : (
                  <TbMicrophone className={isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''} />
                )}
              </Button>
            )}
            {isRecording && (
              <span className={`text-sm tabular-nums ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-muted-foreground'}`}>
                {utils.cleanTimeDisplay(recordingDuration)}
              </span>
            )}
          </div>

          {/* 右侧：面板控制和其他操作 */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant={showRightPanel ? 'secondary' : 'ghost'} className="no-drag w-8 h-8" onClick={() => setShowRightPanel(!showRightPanel)}>
                  <TbBrain className={`h-4 w-4 ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showRightPanel ? '隐藏AI操作' : '显示AI操作'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="no-drag w-8 h-8" onClick={handleToggleCollapse}>
                  {isCollapsed ? (
                    <TbArrowDown className={`h-4 w-4 ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                  ) : (
                    <TbArrowUp className={`h-4 w-4 ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isCollapsed ? '展开窗口' : '收起窗口'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="no-drag w-8 h-8" onClick={() => setIsTransparent(!isTransparent)}>
                  <TbBackground className={`h-4 w-4 ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isTransparent ? '恢复背景' : '透明背景'}</TooltipContent>
            </Tooltip>
            <Button size="icon" variant="ghost" className="no-drag w-8 h-8" onClick={handleCloseRequest}>
              <TbX className={`h-4 w-4 ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
            </Button>
          </div>
        </div>

        {/* 主内容区域（包含左右面板） */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* 左侧面板：历史记录 */}
            {showLeftPanel && (
              <>
                <ResizablePanel defaultSize={20} minSize={15} maxSize={40} className="min-w-[200px]">
                  <HistoryPanel isTransparent={isTransparent} />
                </ResizablePanel>
                <ResizableHandle withHandle />
              </>
            )}

            {/* 中间：识别结果区域 */}
            <ResizablePanel defaultSize={showLeftPanel && showRightPanel ? 50 : showLeftPanel ? 70 : showRightPanel ? 60 : 100} minSize={30}>
              <div className="flex flex-col h-full">
                <SegmentList
                  segments={isCollapsed && recognizedSegments.length > 0 ? [recognizedSegments[recognizedSegments.length - 1]] : recognizedSegments}
                  pendingSegments={isCollapsed ? [] : pendingSegments}
                  progressText={progressText}
                  enableTranslation={enableTranslation}
                  isTransparent={isTransparent}
                />
                <div className={clsx(['flex', isTransparent ? 'bg-gradient-to-t from-background/20 via-background/5 to-transparent' : 'bg-background'])}>
                  <div className="w-4"></div>
                  <div className="flex-1">
                    {/* 底部控制栏 */}
                    <ControlBar isRecording={isRecording} progressText={progressText} waveformRef={waveformRef} isTransparent={isTransparent} />
                  </div>
                  <div className="w-4"></div>
                </div>
              </div>
            </ResizablePanel>

            {/* 右侧面板：AI操作 */}
            {showRightPanel && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={30} minSize={20} maxSize={50} className="min-w-[300px]">
                  <AIActionsPanel segments={recognizedSegments} isTransparent={isTransparent} />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  );
};

export default ASRPage;
