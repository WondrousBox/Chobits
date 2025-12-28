import React, { useCallback, useEffect, useRef, useState } from 'react';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import { ControlBar } from './components/ControlBar';
import { SegmentList } from './components/SegmentList';
import { WaveformRef } from './components/Waveform';
import { useASR } from './hooks/useASR';
import { useTranslation } from './hooks/useTranslation';

const ASRPage: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [providerId, setProviderId] = useState<string>('');
  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [cloudProviderId, setCloudProviderId] = useState<string>('');
  const [cloudModelId, setCloudModelId] = useState<string>('');

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

  const { isRecording, isASRRunning, setIsASRRunning, recognizedSegments, progressText, startRecording, stopRecording, wsRef } = useASR({
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
    if (isASRRunning) {
      setShowCloseConfirm(true);
    } else {
      window.YUA.window['window:close:self']();
    }
  }, [isASRRunning]);

  // 监听窗口关闭事件
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (isASRRunning && !pendingCloseRef.current) {
        e.preventDefault();
        e.returnValue = '';
        setShowCloseConfirm(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isASRRunning]);

  // 清理
  useEffect(() => {
    return () => {
      cleanupTranslation();
    };
  }, [cleanupTranslation]);

  return (
    <>
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认关闭</AlertDialogTitle>
            <AlertDialogDescription>ASR 服务正在运行，关闭窗口将停止 ASR 服务。确定要关闭吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCloseConfirm(false)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleStopASRAndClose} disabled={isLoading}>
              {isLoading ? '正在关闭...' : '确定关闭'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col h-full bg-muted rounded-lg overflow-hidden border border-solid border-ring">
        {/* 状态指示器 */}
        <div className="flex items-center gap-3 px-4 py-2 border-b drag-region">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isASRRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} title="ASR 状态" />
            <span className="text-xs text-muted-foreground">ASR</span>
          </div>
        </div>

        {/* 识别结果区域 */}
        <SegmentList segments={recognizedSegments} progressText={progressText} enableTranslation={enableTranslation} />

        {/* 底部控制栏 */}
        <ControlBar
          isRecording={isRecording}
          isLoading={isLoading}
          isASRRunning={isASRRunning}
          progressText={progressText}
          onStartRecording={startRecording}
          onStopRecording={handleStopRecording}
          onClose={handleCloseRequest}
          waveformRef={waveformRef}
        />
      </div>
    </>
  );
};

export default ASRPage;
