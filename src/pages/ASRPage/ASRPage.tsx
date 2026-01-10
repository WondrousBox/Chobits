import { utils } from '@aim-packages/subtitle';
import clsx from 'clsx';
import { PanelLeft, PanelRight } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowLeft, TbLoader2, TbMicrophone, TbMicrophoneOff, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { AIActionsPanel } from './components/AIActionsPanel';
import { AudioPlayer } from './components/AudioPlayer';
import { ControlBar } from './components/ControlBar';
import { HistoryPanel, RecordingHistoryItem } from './components/HistoryPanel';
import { SegmentList } from './components/SegmentList';
import { WaveformRef } from './components/Waveform';
import { useASR } from './hooks/useASR';
import { RecognizedSegment } from './types';
import { parseSrtContent } from './utils/srt-parser';

// 视图模式
type ViewMode = 'recording' | 'preview';

const ASRPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [cloudProviderId, setCloudProviderId] = useState<string>('');
  const [cloudModelId, setCloudModelId] = useState<string>('');
  const [isSubtitleMode, setIsSubtitleMode] = useState(false); // 字幕模式（合并了透明和收起功能）
  const [showLeftPanel, setShowLeftPanel] = useState(false); // 默认显示左侧面板
  const [showRightPanel, setShowRightPanel] = useState(true); // 默认显示右侧 AI 面板

  // 预览模式状态
  const [viewMode, setViewMode] = useState<ViewMode>('recording');
  const [previewRecording, setPreviewRecording] = useState<RecordingHistoryItem | null>(null);
  const [previewSegments, setPreviewSegments] = useState<RecognizedSegment[]>([]);

  // 保存字幕模式前的状态，用于恢复
  const savedLeftPanelStateRef = useRef(true);
  const savedRightPanelStateRef = useRef(false);

  const pendingCloseRef = useRef(false);
  const waveformRef = useRef<WaveformRef>(null);

  // 获取配置参数并检查未完成的录音
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const payload = (await window.YUA.window['window:payload:get']('asr' as any)) as
          | {
            mode?: 'local' | 'cloud';
            cloudProviderId?: string;
            cloudModelId?: string;
          }
          | undefined;
        if (!mounted) return;
        if (payload) {
          // 翻译配置现在由 AI 面板控制，不再从 payload 获取
          setMode(payload.mode || 'local');
          setCloudProviderId(payload.cloudProviderId || '');
          setCloudModelId(payload.cloudModelId || '');
        }

        // 检查是否有未完成的录音需要恢复
        // 由于字幕现在是流式写入的，只需要完成音频文件状态的更新
        try {
          const savedRecording = localStorage.getItem('asr-current-recording');
          if (savedRecording) {
            const parsed = JSON.parse(savedRecording);
            const { resourceId } = parsed;
            console.log('[ASR] 发现未完成的录音记录，resourceId:', resourceId);

            // 完成音频和字幕文件的保存（更新状态为 ready，创建字幕资源记录）
            const result = await window.YUA.sherpa.checkPendingRecording({ resourceId });
            console.log('[ASR] checkPendingRecording 结果:', result);

            if (result.success && result.filePath) {
              console.log('[ASR] 未完成的录音已恢复，资源ID:', resourceId, '文件路径:', result.filePath);
            } else {
              console.log('[ASR] 资源不存在或文件为空，error:', result.error);
            }

            // 清除 localStorage 中的录音记录
            localStorage.removeItem('asr-current-recording');
            console.log('[ASR] 已清除 localStorage 中的录音记录');
          }
        } catch (error) {
          console.error('[ASR] 检查未完成录音失败:', error);
          // 发生错误时也清除记录，避免下次继续报错
          localStorage.removeItem('asr-current-recording');
        }
      } catch (error) {
        console.error('获取配置参数失败:', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onAudioLevel = useCallback((level: number) => {
    waveformRef.current?.addBar(level);
  }, []);

  // 翻译功能已移至 AIActionsPanel，这里禁用内置翻译
  const {
    isRecording,
    isASRRunning,
    setIsASRRunning,
    recognizedSegments,
    pendingSegments,
    progressText,
    recordingDuration,
    startRecording,
    stopRecording,
    resumeRecording,
    wsRef,
    updateSegmentTranslation
  } = useASR({
    enableTranslation: false,
    translateText: async () => { },
    onAudioLevel,
    mode,
    cloudProviderId,
    cloudModelId
  });

  // 处理AI面板的翻译更新
  const handleTranslationUpdate = useCallback(
    (segmentIndex: number, translation: string) => {
      updateSegmentTranslation(segmentIndex, translation);
    },
    [updateSegmentTranslation]
  );

  // 停止录音（不停止 ASR 服务）
  const handleStopRecording = useCallback(async (): Promise<void> => {
    if (!isRecording || isLoading) return;
    await stopRecording();
    waveformRef.current?.clear();
  }, [isRecording, isLoading, stopRecording]);

  // 选择历史录音进行预览
  const handleSelectRecording = useCallback((recording: RecordingHistoryItem, subtitleContent?: string) => {
    // 解析字幕内容
    const segments = subtitleContent ? parseSrtContent(subtitleContent) : [];
    setPreviewRecording(recording);
    setPreviewSegments(segments);
    setViewMode('preview');
  }, []);

  // 继续录制选中的录音
  const handleResumeRecording = useCallback(async () => {
    if (!previewRecording || previewRecording.status === 'ready') return;

    try {
      await resumeRecording(previewRecording.id);
      // 切换回录音模式
      setViewMode('recording');
      setPreviewRecording(null);
      setPreviewSegments([]);
    } catch (error) {
      console.error('继续录音失败:', error);
    }
  }, [previewRecording, resumeRecording]);

  // 返回录音模式
  const handleBackToRecording = useCallback(() => {
    setViewMode('recording');
    setPreviewRecording(null);
    setPreviewSegments([]);
  }, []);

  // 停止 ASR 服务并关闭窗口
  const handleStopASRAndClose = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    pendingCloseRef.current = true;

    try {
      // 第一步：如果正在录音，先停止录音（这会同时关闭音频和字幕写入流）
      if (isRecording) {
        console.log('[ASR] 正在停止录音...');
        await stopRecording();
        console.log('[ASR] 录音已停止，音频和字幕流已关闭');
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

      // 第四步：清理录音流（以防万一）
      await window.YUA.sherpa.cleanupStreams();

      // 第五步：清除 localStorage 中的录音记录
      localStorage.removeItem('asr-current-recording');

      // 第六步：关闭窗口
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
  const baseWidth = 520; // 基础宽度（无面板时）
  const leftPanelWidth = 260; // 左侧历史面板的宽度
  const rightPanelWidth = 320; // 右侧AI面板的宽度（更宽）
  const baseHeight = 600; // 基础高度（展开时）
  const subtitleModeHeight = 200; // 字幕模式的高度

  // 处理字幕模式切换
  const handleToggleSubtitleMode = useCallback(() => {
    if (isSubtitleMode) {
      // 退出字幕模式：恢复之前保存的状态
      setShowLeftPanel(savedLeftPanelStateRef.current);
      setShowRightPanel(savedRightPanelStateRef.current);
    } else {
      // 进入字幕模式：保存当前状态并设置字幕模式
      savedLeftPanelStateRef.current = showLeftPanel;
      savedRightPanelStateRef.current = showRightPanel;
      setShowLeftPanel(false); // 隐藏左侧面板
      setShowRightPanel(true); // 显示右侧面板
    }
    setIsSubtitleMode(!isSubtitleMode);
  }, [isSubtitleMode, showLeftPanel, showRightPanel]);

  // 根据字幕模式和面板显示状态调整窗口大小
  useEffect(() => {
    const adjustWindowSize = async (): Promise<void> => {
      try {
        let targetWidth: number;
        let targetHeight: number;

        if (isSubtitleMode) {
          // 字幕模式：只显示中间和右侧面板
          targetWidth = baseWidth + rightPanelWidth;
          targetHeight = subtitleModeHeight;
        } else {
          // 正常模式：根据实际显示的面板计算宽度
          targetWidth = baseWidth;
          if (showLeftPanel) targetWidth += leftPanelWidth;
          if (showRightPanel) targetWidth += rightPanelWidth;
          targetHeight = baseHeight;
        }

        console.log('调整窗口大小:', { targetWidth, targetHeight, isSubtitleMode, showLeftPanel, showRightPanel });

        await window.YUA.window['window:size:set']('asr', targetWidth, targetHeight);
      } catch (error) {
        console.error('调整窗口大小失败:', error);
      }
    };

    adjustWindowSize();
  }, [isSubtitleMode, showLeftPanel, showRightPanel, baseWidth, leftPanelWidth, rightPanelWidth, baseHeight, subtitleModeHeight]);

  return (
    <>
      <div className="flex h-full w-full">
        {showLeftPanel && (
          <HistoryPanel isTransparent={isSubtitleMode} isRecording={isRecording} selectedId={viewMode === 'preview' ? previewRecording?.id : null} onSelectRecording={handleSelectRecording} />
        )}
        <div className={`flex flex-col h-full group drag-region overflow-hidden box-border ${isSubtitleMode ? 'bg-transparent' : 'bg-muted'}`}>
          {/* 顶部工具栏 */}
          <div className={`flex items-center justify-between gap-3 p-1 ${isSubtitleMode ? 'border-b border-transparent' : 'border-b'}`}>
            {/* 左侧：面板控制按钮 */}
            {!isSubtitleMode && (
              <PanelLeft
                className={`h-4 w-4 mx-2 cursor-pointer no-drag ${isSubtitleMode ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`}
                onClick={() => setShowLeftPanel(!showLeftPanel)}
              />
            )}
            {<div className="flex-1"></div>}

            {/* 右侧：面板控制和其他操作 */}
            <div className="flex items-center gap-1">
              <Button
                size={isSubtitleMode ? 'icon' : 'sm'}
                variant={isSubtitleMode ? 'secondary' : 'ghost'}
                className={clsx(['no-drag', isSubtitleMode && 'group-hover:opacity-100 opacity-0 w-8 h-8'])}
                onClick={handleToggleSubtitleMode}
              >
                {isSubtitleMode ? <TbX /> : '字幕模式'}
              </Button>
              {!isSubtitleMode && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" variant={showRightPanel ? 'secondary' : 'ghost'} className="no-drag w-8 h-8" onClick={() => setShowRightPanel(!showRightPanel)}>
                      <PanelRight className={`h-4 w-4 ${isSubtitleMode ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showRightPanel ? '隐藏AI操作' : '显示AI操作'}</TooltipContent>
                </Tooltip>
              )}
              {!isSubtitleMode && (
                <Button size="icon" variant="ghost" className="no-drag w-8 h-8" onClick={handleCloseRequest}>
                  <TbX className={`h-4 w-4 ${isSubtitleMode ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                </Button>
              )}
            </div>
          </div>

          {/* 主内容区域（包含左右面板） */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div style={{ width: isSubtitleMode ? baseWidth + rightPanelWidth : baseWidth }}>
              <div className="flex flex-col h-full">
                {/* 预览模式时显示返回按钮和录音信息 */}
                {viewMode === 'preview' && previewRecording && (
                  <div className={`flex items-center justify-between gap-2 px-4 py-2 border-b ${isSubtitleMode ? 'border-border/50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleBackToRecording}>
                        <TbArrowLeft className="h-4 w-4 mr-1" />
                        返回录音
                      </Button>
                      <span className={`text-sm ${isSubtitleMode ? 'text-white/70' : 'text-muted-foreground'}`}>{previewRecording.title || '未命名录音'}</span>
                    </div>
                    {/* 如果录音状态不是 ready，显示继续录音按钮 */}
                    {previewRecording.status !== 'ready' && (
                      <Button size="sm" variant="default" className="h-7" onClick={handleResumeRecording}>
                        <TbMicrophone className="h-4 w-4 mr-1" />
                        继续录音
                      </Button>
                    )}
                  </div>
                )}

                <SegmentList
                  segments={viewMode === 'preview' ? previewSegments : isSubtitleMode && recognizedSegments.length > 0 ? [recognizedSegments[recognizedSegments.length - 1]] : recognizedSegments}
                  pendingSegments={viewMode === 'preview' ? [] : pendingSegments}
                  progressText={viewMode === 'preview' ? '' : progressText}
                  enableTranslation={true}
                  isTransparent={isSubtitleMode}
                />

                <div className={clsx(['flex', isSubtitleMode ? 'bg-gradient-to-t from-background/20 via-background/5 to-transparent' : 'bg-background'])}>
                  {isSubtitleMode ? (
                    <div className="w-4"></div>
                  ) : (
                    <div className="p-2 flex gap-2 items-center">
                      {isRecording ? (
                        <Button size="icon" variant="destructive" className="w-8 h-8 rounded-full no-drag" onClick={handleStopRecording} disabled={isLoading}>
                          <TbMicrophoneOff className={isSubtitleMode ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''} />
                        </Button>
                      ) : (
                        <Button
                          size="icon"
                          className="w-8 h-8 rounded-full no-drag"
                          onClick={() => {
                            console.log('[ASR] 录音按钮被点击');
                            console.log('[ASR] isASRRunning:', isASRRunning);
                            console.log('[ASR] isLoading:', isLoading);
                            startRecording();
                          }}
                          disabled={!isASRRunning || isLoading}
                        >
                          {isLoading ? (
                            <TbLoader2 className={`animate-spin ${isSubtitleMode ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`} />
                          ) : (
                            <TbMicrophone className={isSubtitleMode ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''} />
                          )}
                        </Button>
                      )}
                      {isRecording && (
                        <div className={`text-sm tabular-nums ${isSubtitleMode ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : 'text-muted-foreground'}`}>
                          {utils.cleanTimeDisplay(recordingDuration)}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex-1">
                    {/* 预览模式显示音频播放器，录音模式显示波形控制栏 */}
                    {viewMode === 'preview' && previewRecording ? (
                      <AudioPlayer audioFilePath={previewRecording.audioFilePath} isTransparent={isSubtitleMode} />
                    ) : (
                      <ControlBar isRecording={isRecording} progressText={progressText} waveformRef={waveformRef} isSubtitleMode={isSubtitleMode} />
                    )}
                  </div>
                  <div className="w-4"></div>
                </div>
              </div>
            </div>

            {/* 右侧面板：AI操作 */}
            {showRightPanel && !isSubtitleMode && (
              <div style={{ width: rightPanelWidth }}>
                <AIActionsPanel segments={viewMode === 'preview' ? previewSegments : recognizedSegments} isTransparent={isSubtitleMode} onTranslationUpdate={handleTranslationUpdate} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ASRPage;
