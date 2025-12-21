import { utils } from '@aim-packages/subtitle';
import { AllModels } from '@packages/sherpa/common';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbMicrophone, TbMicrophoneOff, TbPlayerPause, TbPlayerPlay } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface RecognizedSegment {
  text: string;
  start: number;
  end: number;
}

const ASRTestPage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01');
  const [language, setLanguage] = useState('zh');
  const [enablePunctuation, setEnablePunctuation] = useState(false);
  const [recognizedSegments, setRecognizedSegments] = useState<RecognizedSegment[]>([]);
  const [progressText, setProgressText] = useState<string>('');
  const [progressStart, setProgressStart] = useState<number>(0);
  const [progressEnd, setProgressEnd] = useState<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 更新录音状态 ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

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

            // 发送给 ASR 服务
            if (isASRRunning) {
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
  }, [isASRRunning]);

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
      stopRecording();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopRecording]);

  const handleStartASR = useCallback(async (): Promise<void> => {
    if (isASRRunning || isLoading) return;

    setIsLoading(true);

    try {
      const success = await window.YUA.sherpa.createInstance({
        model: selectedModel as AllModels,
        language: language,
        punctuationModel: enablePunctuation ? 'sherpa-onnx-online-punct-en-2024-08-06' : undefined
      });

      if (success) {
        setIsASRRunning(true);
      }
    } catch (error) {
      console.error('启动 ASR 失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isASRRunning, isLoading, selectedModel, language, enablePunctuation]);

  const handleStopASR = useCallback(async (): Promise<void> => {
    if (!isASRRunning || isLoading) return;

    setIsLoading(true);

    try {
      // 如果正在录音，先停止录音
      if (isRecording) {
        await stopRecording();
      }

      // 关闭 WebSocket 连接
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const success = await window.YUA.sherpa.freeInstance();

      if (success) {
        setIsASRRunning(false);
      } else {
        // 即使返回 false，也更新状态，确保可以重新启动
        setIsASRRunning(false);
      }
    } catch (error) {
      console.error('停止 ASR 失败:', error);
      // 即使出错，也更新状态，确保可以重新启动
      setIsASRRunning(false);
    } finally {
      setIsLoading(false);
    }
  }, [isASRRunning, isLoading, isRecording, stopRecording]);

  return (
    <>
      <DragAbleTitle title="ASR 语音识别测试" />
      <div className="flex gap-6 px-2">
        <div>
          <div className="space-y-2">
            <Label htmlFor="model">模型</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01">Zipformer (英文)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">语言</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
                <SelectItem value="ko">한국어</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <input type="checkbox" id="punctuation" checked={enablePunctuation} onChange={(e) => setEnablePunctuation(e.target.checked)} className="w-4 h-4" />
            <Label htmlFor="punctuation" className="cursor-pointer">
              启用标点符号
            </Label>
          </div>
          <div className="flex gap-2">
            <Button disabled={isASRRunning || isLoading} onClick={handleStartASR} size="sm" className="flex-1">
              {isLoading && !isASRRunning ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  启动中...
                </>
              ) : (
                <>
                  <TbPlayerPlay />
                  启动 ASR
                </>
              )}
            </Button>
            <Button disabled={!isASRRunning || isLoading} onClick={handleStopASR} size="sm" variant="outline" className="flex-1">
              {isLoading && isASRRunning ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  停止中...
                </>
              ) : (
                <>
                  <TbPlayerPause />
                  停止 ASR
                </>
              )}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium">ASR 状态:</span>
              <span className={`text-sm ${isASRRunning ? 'text-green-500' : 'text-gray-500'}`}>{isASRRunning ? '运行中' : '已停止'}</span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button disabled={!isASRRunning} onClick={isRecording ? stopRecording : startRecording} size="sm" className="flex-1" variant={isRecording ? 'destructive' : 'default'}>
                {isRecording ? (
                  <>
                    <TbMicrophoneOff className="w-4 h-4 mr-2" />
                    停止录音
                  </>
                ) : (
                  <>
                    <TbMicrophone className="w-4 h-4 mr-2" />
                    开始录音
                  </>
                )}
              </Button>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium">录音状态:</span>
                <span className={`text-sm ${isRecording ? 'text-red-500' : 'text-gray-500'}`}>{isRecording ? '录音中' : '已停止'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 识别结果 */}
        <div className="space-y-4 flex-1 min-w-[500px]">
          <div className="flex items-center justify-between">
            <Label>识别结果</Label>
            <Button
              onClick={() => {
                setRecognizedSegments([]);
                setProgressText('');
                setProgressStart(0);
                setProgressEnd(0);
              }}
              size="sm"
              variant="outline"
            >
              清空结果
            </Button>
          </div>
          <ScrollArea className="h-[600px] w-full border rounded-md">
            <div className="px-4 py-3" ref={contentRef}>
              {/* 已识别的完整结果 */}
              {recognizedSegments.map((segment, index) => (
                <div key={index} className="flex items-start justify-center gap-2 relative pl-4 group mb-2">
                  <div className="select-none pt-3 cursor-pointer text-muted-foreground text-xs hover:text-primary w-20 text-center relative">
                    <span className="text-xs absolute left-1/2 -translate-x-1/2 -top-1 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">#{index + 1}</span>
                    <div className="text-[10px] leading-tight">
                      <div>{utils.cleanTimeDisplay(utils.formatTime(segment.start / 1000))}</div>
                    </div>
                  </div>
                  <div className="p-2 flex-1 outline-none break-words border-none text-base text-foreground" style={{ whiteSpace: 'pre-wrap' }}>
                    {segment.text || '\u200b'}
                  </div>
                </div>
              ))}

              {/* 最新的识别内容（置灰显示） */}
              {progressText && (
                <div className="flex items-start justify-center gap-2 relative pl-4 group mb-2">
                  <div className="select-none pt-3 cursor-pointer text-muted-foreground/60 text-xs hover:text-primary w-20 text-center relative">
                    <div className="text-[10px] leading-tight text-muted-foreground/60">
                      <div>{utils.cleanTimeDisplay(utils.formatTime(progressStart / 1000))}</div>
                    </div>
                  </div>
                  <div className="p-2 flex-1 outline-none break-words border-none text-base text-muted-foreground/60" style={{ whiteSpace: 'pre-wrap' }}>
                    {progressText || '\u200b'}
                  </div>
                </div>
              )}

              {recognizedSegments.length === 0 && !progressText && <div className="text-center text-muted-foreground py-8">识别结果将显示在这里...</div>}
            </div>
          </ScrollArea>
        </div>
      </div>
    </>
  );
};

export default ASRTestPage;
