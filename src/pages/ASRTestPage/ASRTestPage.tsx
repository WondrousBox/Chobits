import { AllModels } from '@packages/sherpa/common';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbMicrophone, TbMicrophoneOff, TbPlayerPause, TbPlayerPlay } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const ASRTestPage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('sherpa-onnx-streaming-zipformer-en-20M-2023-02-17');
  const [language, setLanguage] = useState('zh');
  const [enablePunctuation, setEnablePunctuation] = useState(false);
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [progressText, setProgressText] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);

  // 添加日志
  const addLog = useCallback((log: string) => {
    setLogs((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${log}`]);
  }, []);

  // 更新录音状态 ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // 连接 WebSocket
  const connectWebSocket = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      const port = 8765;
      const url = `ws://127.0.0.1:${port}`;
      addLog(`正在连接到 ${url}...`);

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          addLog('WebSocket 连接已建立');
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
                addLog(`发送音频数据失败: ${error}`);
              }
            }
          } else if (typeof event.data === 'string') {
            addLog(`收到消息: ${event.data}`);
          }
        };

        ws.onclose = () => {
          addLog('WebSocket 连接已关闭');
          setIsRecording(false);
          wsRef.current = null;
        };

        ws.onerror = (error) => {
          addLog('WebSocket 错误');
          console.error(error);
          setIsRecording(false);
          reject(error);
        };
      } catch (e) {
        addLog(`连接失败: ${e}`);
        reject(e);
      }
    });
  }, [addLog, isASRRunning]);

  // 开始录音
  const startRecording = useCallback(async (): Promise<void> => {
    if (!isASRRunning) {
      addLog('ASR 服务未运行，无法开始录音');
      return;
    }

    try {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        await connectWebSocket();
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('start');
        setIsRecording(true);
        addLog('开始录音');
      } else {
        addLog('WebSocket 连接失败，无法开始录音');
      }
    } catch (error) {
      console.error('开始录音失败:', error);
      addLog(`开始录音失败: ${error}`);
    }
  }, [isASRRunning, connectWebSocket, addLog]);

  // 停止录音
  const stopRecording = useCallback(async () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('stop');
        addLog('停止录音');
      }
      setIsRecording(false);
      // 不关闭 WebSocket，以便可以再次开始录音
    } catch (error) {
      console.error('停止录音失败:', error);
      addLog(`停止录音失败: ${error}`);
      setIsRecording(false);
    }
  }, [addLog]);

  // 监听 ASR 识别结果
  useEffect(() => {
    const handleASRMessage = (_event: any, data: { text: string; isEndpoint: boolean; start: number; end: number }) => {
      if (data.text) {
        setProgressText(data.text);
        addLog(`识别结果: ${data.text}${data.isEndpoint ? ' (结束)' : ''}`);

        if (data.isEndpoint) {
          // 如果是端点，添加到完整结果
          setRecognizedText((prev) => (prev ? `${prev}\n${data.text}` : data.text));
          setProgressText('');
        }
      }
    };

    window.ipcRenderer?.on('sherpa:message', handleASRMessage);

    return () => {
      window.ipcRenderer?.off('sherpa:message', handleASRMessage);
    };
  }, [addLog]);

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
    addLog('正在启动 ASR 服务...');

    try {
      const success = await window.YUA.sherpa.createInstance({
        model: selectedModel as AllModels,
        language: language,
        punctuationModel: enablePunctuation ? 'sherpa-onnx-online-punct-en-2024-08-06' : undefined
      });

      if (success) {
        setIsASRRunning(true);
        addLog('ASR 服务启动成功');
      } else {
        addLog('ASR 服务启动失败');
      }
    } catch (error) {
      console.error('启动 ASR 失败:', error);
      addLog(`启动 ASR 失败: ${error}`);
    } finally {
      setIsLoading(false);
    }
  }, [isASRRunning, isLoading, selectedModel, language, enablePunctuation, addLog]);

  const handleStopASR = useCallback(async (): Promise<void> => {
    if (!isASRRunning || isLoading) return;

    setIsLoading(true);
    addLog('正在停止 ASR 服务...');

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
        addLog('ASR 服务已停止');
      } else {
        // 即使返回 false，也更新状态，确保可以重新启动
        setIsASRRunning(false);
        addLog('ASR 服务已停止（可能已释放）');
      }
    } catch (error) {
      console.error('停止 ASR 失败:', error);
      addLog(`停止 ASR 失败: ${error}`);
      // 即使出错，也更新状态，确保可以重新启动
      setIsASRRunning(false);
    } finally {
      setIsLoading(false);
    }
  }, [isASRRunning, isLoading, isRecording, stopRecording, addLog]);

  return (
    <div>
      <DragAbleTitle title="ASR 语音识别测试" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 配置面板 */}
        <Card>
          <CardHeader>
            <CardTitle>配置</CardTitle>
            <CardDescription>设置 ASR 模型和参数</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model">模型</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sherpa-onnx-streaming-zipformer-en-20M-2023-02-17">Zipformer (英文)</SelectItem>
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
          </CardContent>
        </Card>

        {/* 控制面板 */}
        <Card>
          <CardHeader>
            <CardTitle>控制</CardTitle>
            <CardDescription>开始/停止录音和识别</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      </div>

      {/* 识别结果 */}
      <Card>
        <CardHeader>
          <CardTitle>识别结果</CardTitle>
          <CardDescription>实时显示识别文本</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>实时进度</Label>
              <Textarea value={progressText} readOnly placeholder="实时识别文本将显示在这里..." className="min-h-[60px] font-mono" />
            </div>
            <div>
              <Label>完整结果</Label>
              <Textarea value={recognizedText} readOnly placeholder="完整识别结果将显示在这里..." className="min-h-[200px] font-mono" />
            </div>
            <Button
              onClick={() => {
                setRecognizedText('');
                setProgressText('');
              }}
              size="sm"
              variant="outline"
            >
              清空结果
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 日志 */}
      <Card>
        <CardHeader>
          <CardTitle>日志</CardTitle>
          <CardDescription>ASR 运行日志</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-black text-green-400 p-4 rounded-md font-mono text-sm max-h-[300px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-gray-500">暂无日志</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))
            )}
          </div>
          <Button onClick={() => setLogs([])} size="sm" variant="outline" className="mt-2">
            清空日志
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ASRTestPage;
