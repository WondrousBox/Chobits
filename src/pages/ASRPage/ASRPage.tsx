import { utils } from '@aim-packages/subtitle';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbMicrophone, TbMicrophoneOff, TbX } from 'react-icons/tb';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecognizedSegment {
  text: string;
  start: number;
  end: number;
}

interface WaveBar {
  x: number;
  y: number;
  height: number;
  width: number;
}

// 波形高度系数，可在此处修改（范围：0-1，表示 canvas 高度的百分比）
const WAVE_HEIGHT_SCALE = 1.5;

// 波形移动速度，可在此处修改（值越小线条越密集，值越大线条越稀疏，建议范围：0.1-2）
const WAVE_MOVE_SPEED = 0.2;

// 波形线条宽度，可在此处修改（单位：像素，建议范围：0.5-3）
const WAVE_BAR_WIDTH = 0.6;

const ASRPage: React.FC = () => {
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const barsRef = useRef<WaveBar[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

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
            // 将 Blob 转换为 Float32Array
            const arrayBuffer = await event.data.arrayBuffer();
            const float32Array = new Float32Array(arrayBuffer);

            // 计算音频最大值用于波形显示
            let max = 0;
            for (let i = 0; i < float32Array.length; i++) {
              const abs = Math.abs(float32Array[i]);
              if (abs > max) {
                max = abs;
              }
            }

            // 添加新的波形条（每次收到数据都添加，让波形更密集）
            const canvas = canvasRef.current;
            if (canvas && isRecordingRef.current) {
              const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
              const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
              // 使用波形高度系数
              const maxHeight = canvasHeight * WAVE_HEIGHT_SCALE;
              const freq = Math.min(Math.floor(max * maxHeight), maxHeight);
              // 确保最小高度为 1，避免看不到
              const height = Math.max(freq, 1);
              barsRef.current.push({
                x: canvasWidth,
                y: canvasHeight / 2 - height / 2,
                height: height,
                width: WAVE_BAR_WIDTH
              });
            }

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
      // 清理波形图
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      barsRef.current = [];
      if (ctxRef.current && canvasRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      // 不关闭 WebSocket，以便可以再次开始录音
    } catch (error) {
      console.error('停止录音失败:', error);
      setIsRecording(false);
      // 清理波形图
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      barsRef.current = [];
      if (ctxRef.current && canvasRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
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

  // 初始化 canvas 和绘制循环
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctxRef.current = ctx;

    // 设置 canvas 尺寸（考虑 devicePixelRatio）
    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    setupCanvas();

    // 绘制函数
    const draw = () => {
      if (!ctx || !canvas || !isRecordingRef.current) return;

      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, width, height);

      for (let i = barsRef.current.length - 1; i >= 0; i--) {
        const bar = barsRef.current[i];
        ctx.fillStyle = 'hsl(var(--primary))';
        ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
        bar.x = bar.x - WAVE_MOVE_SPEED;

        if (bar.x < -bar.width) {
          barsRef.current.splice(i, 1);
        }
      }
    };

    // 绘制循环
    const loop = () => {
      if (isRecordingRef.current) {
        draw();
        animationFrameIdRef.current = requestAnimationFrame(loop);
      }
    };

    if (isRecording) {
      barsRef.current = [];
      loop();
    }

    // 监听窗口大小变化
    const handleResize = () => {
      setupCanvas();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isRecording]);

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
      <div className="flex flex-col h-full bg-background/40 rounded-lg overflow-hidden">
        {/* 状态指示器 */}
        <div className="flex items-center gap-3 px-4 py-2 border-b drag-region">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isASRRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} title="ASR 状态" />
            <span className="text-xs text-muted-foreground">ASR</span>
          </div>
        </div>

        {/* 识别结果区域 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-3" ref={contentRef}>
              {/* 已识别的完整结果 */}
              {recognizedSegments.map((segment, index) => (
                <div key={index} className="mb-2 group bg-background/80 p-2 rounded-md last:mb-0">
                  <div className="text-base leading-tight break-words select-text" style={{ whiteSpace: 'pre-wrap' }}>
                    <span className="text-muted-foreground mr-2 hover:text-primary font-mono select-text">{utils.cleanTimeDisplay(utils.formatTime(segment.start / 1000))}</span>
                    {segment.text || '\u200b'}
                  </div>
                </div>
              ))}

              {recognizedSegments.length === 0 && !progressText && (
                <div className="text-center text-muted-foreground py-12">
                  <div className="text-sm">识别结果将显示在这里...</div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 底部控制栏 */}
        <div className="border-t bg-background drag-region">
          <div className="flex items-center justify-center relative overflow-hidden h-12 group">
            {progressText && (
              <div className="absolute top-1/2 -translate-y-1/2 right-0">
                <div className="font-bold whitespace-nowrap text-right text-primary overflow-hidden">{progressText || '\u200b'}</div>
              </div>
            )}

            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 no-drag z-10">
              {isRecording ? (
                <Button size="icon" variant="destructive" className="w-10 h-10 rounded-full no-drag" onClick={handleStopRecording} disabled={isLoading}>
                  <TbMicrophoneOff />
                </Button>
              ) : (
                <Button size="icon" className="w-10 h-10 rounded-full no-drag" onClick={startRecording} disabled={!isASRRunning || isLoading}>
                  {isLoading ? <TbLoader2 className="animate-spin" /> : <TbMicrophone />}
                </Button>
              )}
              <Button size="icon" variant="outline" className="w-10 h-10 rounded-full no-drag" onClick={handleCloseRequest} title="关闭">
                <TbX />
              </Button>
            </div>
            {/* 波形图 */}
            {isRecording && <canvas ref={canvasRef} className="h-8 w-full no-drag opacity-30" />}
          </div>
        </div>
      </div>
    </>
  );
};

export default ASRPage;
