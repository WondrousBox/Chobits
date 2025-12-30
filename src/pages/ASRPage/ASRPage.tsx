import { utils } from '@aim-packages/subtitle';
import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowDown, TbArrowUp, TbBackground, TbLoader2, TbMicrophone, TbMicrophoneOff, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ControlBar } from './components/ControlBar';
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

  const { isRecording, isASRRunning, setIsASRRunning, recognizedSegments, progressText, recordingDuration, startRecording, stopRecording, wsRef } = useASR({
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

  // 根据展开/收起状态调整窗口高度
  useEffect(() => {
    const adjustWindowHeight = async (): Promise<void> => {
      try {
        const currentWidth = window.innerWidth;
        // 展开模式：高度较大（例如 600px）
        // 收起模式：高度较小（例如 200px）
        const targetHeight = isCollapsed ? 200 : 600;
        await window.YUA.window['window:size:set']('asr' as any, currentWidth, targetHeight);
      } catch (error) {
        console.error('调整窗口高度失败:', error);
      }
    };

    adjustWindowHeight();
  }, [isCollapsed]);

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
        {/* 状态指示器 */}
        <div className={`flex items-center justify-between gap-3 px-2 py-2 ${isTransparent ? 'border-b border-transparent' : 'border-b'}`}>
          <div className="flex items-center gap-2">
            {isRecording ? (
              <Button size="icon" variant="destructive" className="w-8 h-8 rounded-full no-drag ml-2" onClick={handleStopRecording} disabled={isLoading}>
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
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="no-drag w-8 h-8" onClick={() => setIsCollapsed(!isCollapsed)}>
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
        {/* 识别结果区域 */}
        <SegmentList
          segments={isCollapsed && recognizedSegments.length > 0 ? [recognizedSegments[recognizedSegments.length - 1]] : recognizedSegments}
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
    </>
  );
};

export default ASRPage;
