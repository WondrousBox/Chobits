import { utils } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbMicrophone, TbMicrophoneOff, TbTrash, TbX } from 'react-icons/tb';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecognizedSegment {
  text: string;
  start: number;
  end: number;
}

const ASRTestPage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [recognizedSegments, setRecognizedSegments] = useState<RecognizedSegment[]>([]);
  const [progressText, setProgressText] = useState<string>('');
  const [progressStart, setProgressStart] = useState<number>(0);
  const [progressEnd, setProgressEnd] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const isASRRunningRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingCloseRef = useRef(false);

  // 检查 ASR 服务是否已启动并自动开始录音
  // 由于测试页面是从配置页面打开的，我们假设服务已经启动
  useEffect(() => {
    // 从配置页面打开时，ASR 服务应该已经启动
    // 如果服务未启动，用户需要先通过配置页面启动
    setIsASRRunning(true);
    isASRRunningRef.current = true;

    // 自动开始录音
    const autoStart = async () => {
      try {
        // 连接 WebSocket
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          await connectWebSocket();
        }

        // 确保连接成功后再开始录音
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send('start');
          setIsRecording(true);
        }
      } catch (error) {
        console.error('自动开始录音失败:', error);
      }
    };

    // 延迟一点时间确保页面完全加载和 WebSocket 服务器就绪
    const timer = setTimeout(() => {
      autoStart();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 更新录音状态 ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // 更新 ASR 运行状态 ref
  useEffect(() => {
    isASRRunningRef.current = isASRRunning;
  }, [isASRRunning]);

  // 连接 WebSocket
  const connectWebSocket = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const port = 8765;
      const url = `ws://127.0.0.1:${port}`;

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          resolve();
        };

        ws.onmessage = async (event) => {
          if (event.data instanceof Blob && isRecordingRef.current) {
            console.log('onmessage', event.data, isASRRunningRef.current);
            // 将 Blob 转换为 Float32Array
            const arrayBuffer = await event.data.arrayBuffer();
            const float32Array = new Float32Array(arrayBuffer);

            // 发送给 ASR 服务
            if (isASRRunningRef.current) {
              try {
                await window.YUA.sherpa.sendData({
                  uuid: 'stream',
                  data: float32Array
                });
              } catch (error) {
                console.error('发送音频数据到 ASR 失败:', error);
              }
            }
          }
        };

        ws.onclose = () => {
          setIsRecording(false);
          wsRef.current = null;
        };

        ws.onerror = (error) => {
          console.error(error);
          setIsRecording(false);
          reject(error);
        };
      } catch (e) {
        reject(e);
      }
    });
  }, []);

  // 开始录音
  const startRecording = useCallback(async (): Promise<void> => {
    if (!isASRRunning) {
      return;
    }

    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connectWebSocket();
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('start');
        setIsRecording(true);
      }
    } catch (error) {
      console.error('开始录音失败:', error);
    }
  }, [isASRRunning, connectWebSocket]);

  // 停止录音
  const stopRecording = useCallback(async () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('stop');
      }
      setIsRecording(false);
      // 不关闭 WebSocket，以便可以再次开始录音
    } catch (error) {
      console.error('停止录音失败:', error);
      setIsRecording(false);
    }
  }, []);

  // 监听 ASR 识别结果
  useEffect(() => {
    const handleASRMessage = (
      _event: any,
      d: {
        type: string;
        data: { text: string; isEndpoint: boolean; start: number; end: number };
      }
    ): void => {
      const data = d.data;
      if (d.type !== 'sherpa:message') return;

      if (data.text) {
        setProgressText(data.text);
        setProgressStart(data.start);
        setProgressEnd(data.end);

        if (data.isEndpoint) {
          // 如果是端点，添加到完整结果列表
          setRecognizedSegments((prev) => [
            ...prev,
            {
              text: data.text,
              start: data.start,
              end: data.end
            }
          ]);
          setProgressText('');
          setProgressStart(0);
          setProgressEnd(0);
        }
      }
    };

    window.YUA.handleMessage(handleASRMessage, 'sherpa:message');

    return () => {
      window.YUA.removeHandler('sherpa:message');
    };
  }, []);

  // 自动滚动到底部
  useEffect(() => {
    if (contentRef.current) {
      const viewport = contentRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTop = viewport.scrollHeight;
        });
      }
    }
  }, [recognizedSegments, progressText]);

  // 清理
  useEffect(() => {
    return () => {
      // 如果窗口正在关闭，不在这里清理，让 handleStopASRAndClose 处理
      if (!pendingCloseRef.current) {
        stopRecording();
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      }
    };
  }, [stopRecording]);

  // 监听窗口关闭事件（用于通过系统菜单等方式关闭）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isASRRunning && !pendingCloseRef.current) {
        // 在 Electron 中，阻止默认行为并显示确认对话框
        e.preventDefault();
        e.returnValue = '';
        // 注意：在 beforeunload 中无法显示自定义对话框，只能显示浏览器默认对话框
        // 但我们可以通过 IPC 在主进程中处理，这里先阻止关闭
        setShowCloseConfirm(true);
        // 由于 beforeunload 的限制，我们需要通过其他方式处理
        // 这里主要依赖 DragAbleTitle 的 onClose 来处理
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isASRRunning]);

  // 停止录音（不停止 ASR 服务）
  const handleStopRecording = useCallback(async (): Promise<void> => {
    if (!isRecording || isLoading) return;

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('stop');
      }
      setIsRecording(false);
      isRecordingRef.current = false;
      // 不关闭 WebSocket，以便可以再次开始录音
    } catch (error) {
      console.error('停止录音失败:', error);
      setIsRecording(false);
    }
  }, [isRecording, isLoading]);

  // 停止 ASR 服务并关闭窗口
  const handleStopASRAndClose = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    pendingCloseRef.current = true;

    try {
      // 第一步：如果正在录音，先停止录音
      if (isRecording) {
        try {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send('stop');
          }
          setIsRecording(false);
          isRecordingRef.current = false;
        } catch (error) {
          console.error('停止录音失败:', error);
        }
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
        isASRRunningRef.current = false;
      }

      // 第四步：关闭窗口
      window.YUA.window['window:close:self']();
    } catch (error) {
      console.error('停止 ASR 失败:', error);
      setIsLoading(false);
      pendingCloseRef.current = false;
    }
  }, [isASRRunning, isRecording]);

  // 处理窗口关闭请求
  const handleCloseRequest = useCallback(() => {
    if (isASRRunning) {
      setShowCloseConfirm(true);
    } else {
      window.YUA.window['window:close:self']();
    }
  }, [isASRRunning]);

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
      <div className="flex flex-col h-full">
        {/* 状态指示器 */}
        <div className="flex items-center gap-3 px-4 py-2 border-b drag-region">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isASRRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} title="ASR 状态" />
            <span className="text-xs text-muted-foreground">ASR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'}`} title="录音状态" />
            <span className="text-xs text-muted-foreground">录音</span>
          </div>
        </div>

        {/* 识别结果区域 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="px-6 py-4" ref={contentRef}>
              {/* 已识别的完整结果 */}
              {recognizedSegments.map((segment, index) => (
                <div key={index} className="mb-4 group">
                  <div className="text-xs text-muted-foreground mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {utils.cleanTimeDisplay(utils.formatTime(segment.start / 1000))} - {utils.cleanTimeDisplay(utils.formatTime(segment.end / 1000))}
                  </div>
                  <div className="text-base leading-relaxed break-words" style={{ whiteSpace: 'pre-wrap' }}>
                    {segment.text || '\u200b'}
                  </div>
                </div>
              ))}

              {/* 最新的识别内容（置灰显示） */}
              {progressText && (
                <div className="mb-4">
                  <div className="text-xs text-muted-foreground/60 mb-1">
                    {utils.cleanTimeDisplay(utils.formatTime(progressStart / 1000))} - {utils.cleanTimeDisplay(utils.formatTime(progressEnd / 1000))}
                  </div>
                  <div className="text-base leading-relaxed break-words text-muted-foreground/60" style={{ whiteSpace: 'pre-wrap' }}>
                    {progressText || '\u200b'}
                  </div>
                </div>
              )}

              {recognizedSegments.length === 0 && !progressText && (
                <div className="text-center text-muted-foreground py-12">
                  <div className="text-sm">识别结果将显示在这里...</div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 底部控制栏 */}
        <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 drag-region">
          <div className="flex items-center justify-center gap-4 px-4 py-4">
            <Button
              size="icon"
              variant="ghost"
              className="w-10 h-10 rounded-full no-drag"
              onClick={() => {
                setRecognizedSegments([]);
                setProgressText('');
                setProgressStart(0);
                setProgressEnd(0);
              }}
              title="清空结果"
            >
              <TbTrash className="w-4 h-4" />
            </Button>
            {isRecording ? (
              <Button size="icon" variant="destructive" className="w-16 h-16 rounded-full no-drag" onClick={handleStopRecording} disabled={isLoading}>
                <TbMicrophoneOff className="w-6 h-6" />
              </Button>
            ) : (
              <Button size="icon" className="w-16 h-16 rounded-full no-drag" onClick={startRecording} disabled={!isASRRunning || isLoading}>
                {isLoading ? <TbLoader2 className="w-6 h-6 animate-spin" /> : <TbMicrophone className="w-6 h-6" />}
              </Button>
            )}
            <Button size="icon" variant="ghost" className="w-10 h-10 rounded-full no-drag" onClick={handleCloseRequest} title="关闭">
              <TbX className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ASRTestPage;
