import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbMicrophone, TbMicrophoneOff, TbPlayerPause, TbPlayerPlay, TbRefresh } from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type ASRProgressData = {
  start: number;
  end: number;
  text: string;
  isEndpoint: boolean;
};

const ASRTestPage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isASRRunning, setIsASRRunning] = useState(false);
  const [modelDir, setModelDir] = useState('H:/AI/whisper/models');
  const [selectedModel, setSelectedModel] = useState('sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17');
  const [language, setLanguage] = useState('zh');
  const [enablePunctuation, setEnablePunctuation] = useState(true);
  const [recognizedText, setRecognizedText] = useState<string>('');
  const [progressText, setProgressText] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const progressUnsubscribeRef = useRef<(() => void) | null>(null);
  const logUnsubscribeRef = useRef<(() => void) | null>(null);

  // 添加日志
  const addLog = useCallback((log: string) => {
    setLogs((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${log}`]);
  }, []);

  // 启动录音服务器
  const startRecorderServer = useCallback(async () => {
    try {
      const running = await window.YUA.recorder.getStatus();
      if (!running) {
        await window.YUA.recorder.start(8765);
        addLog('录音服务器已启动');
      }
    } catch (error) {
      console.error('启动录音服务器失败:', error);
      toast.error('启动录音服务器失败');
      addLog(`启动录音服务器失败: ${error}`);
    }
  }, [addLog]);

  // 启动 ASR
  const startASR = useCallback(async () => {
    try {
      await window.YUA.asr.start({
        model: selectedModel as any,
        modelDir,
        cpu_numThreads: 2,
        language: language || undefined,
        enablePunctuation
      });
      setIsASRRunning(true);
      addLog('ASR 已启动');
      toast.success('ASR 已启动');
    } catch (error) {
      console.error('启动 ASR 失败:', error);
      toast.error('启动 ASR 失败');
      addLog(`启动 ASR 失败: ${error}`);
    }
  }, [selectedModel, modelDir, language, enablePunctuation, addLog]);

  // 停止 ASR
  const stopASR = useCallback(async () => {
    try {
      await window.YUA.asr.stop();
      setIsASRRunning(false);
      setProgressText('');
      addLog('ASR 已停止');
    } catch (error) {
      console.error('停止 ASR 失败:', error);
      addLog(`停止 ASR 失败: ${error}`);
    }
  }, [addLog]);

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      // 确保录音服务器运行
      await startRecorderServer();

      // 确保 ASR 运行
      const running = await window.YUA.asr.isRunning();
      if (!running) {
        await startASR();
      }

      // 连接 WebSocket
      const port = 8765;
      const url = `ws://127.0.0.1:${port}`;
      addLog(`正在连接到 ${url}...`);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        addLog('WebSocket 连接已建立');
        ws.send('start');
        setIsRecording(true);
        addLog('开始录音');
        toast.success('开始录音');
      };

      ws.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          try {
            // 将 Blob 转换为 ArrayBuffer
            const arrayBuffer = await event.data.arrayBuffer();
            // 录音服务器发送的是 Int16Array 格式的 PCM 数据
            // 每个样本 2 字节，所以长度是 arrayBuffer.byteLength / 2
            const int16Array = new Int16Array(arrayBuffer);
            const samples = new Float32Array(int16Array.length);

            // 将 Int16 转换回 Float32 (范围 -1.0 到 1.0)
            for (let i = 0; i < int16Array.length; i++) {
              samples[i] = int16Array[i] / 32767.0;
            }

            console.log(samples);

            // 发送音频数据到 ASR
            await window.YUA.asr.sendAudioData(samples);
          } catch (error) {
            console.error('处理音频数据失败:', error);
            addLog(`处理音频数据失败: ${error}`);
          }
        } else if (event.data instanceof ArrayBuffer) {
          // 如果直接是 ArrayBuffer
          try {
            const int16Array = new Int16Array(event.data);
            const samples = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
              samples[i] = int16Array[i] / 32767.0;
            }
            console.log(samples);
            await window.YUA.asr.sendAudioData(samples);
          } catch (error) {
            console.error('处理音频数据失败:', error);
            addLog(`处理音频数据失败: ${error}`);
          }
        } else {
          addLog(`收到消息: ${event.data}`);
        }
      };

      ws.onclose = () => {
        addLog('WebSocket 连接已关闭');
        setIsRecording(false);
      };

      ws.onerror = (error) => {
        addLog('WebSocket 错误');
        console.error(error);
        setIsRecording(false);
        toast.error('WebSocket 连接错误');
      };
    } catch (error) {
      console.error('开始录音失败:', error);
      toast.error('开始录音失败');
      addLog(`开始录音失败: ${error}`);
    }
  }, [startRecorderServer, startASR, addLog]);

  // 停止录音
  const stopRecording = useCallback(async () => {
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('stop');
        wsRef.current.close();
      }
      wsRef.current = null;
      setIsRecording(false);
      addLog('停止录音');
    } catch (error) {
      console.error('停止录音失败:', error);
      addLog(`停止录音失败: ${error}`);
    }
  }, [addLog]);

  // 监听 ASR 进度
  useEffect(() => {
    progressUnsubscribeRef.current = window.YUA.asr.onProgress((data: ASRProgressData) => {
      setProgressText(data.text);
      if (data.isEndpoint) {
        setRecognizedText((prev) => {
          const newText = prev ? `${prev}\n${data.text}` : data.text;
          return newText;
        });
        setProgressText('');
        addLog(`识别完成: ${data.text}`);
      }
    });

    logUnsubscribeRef.current = window.YUA.asr.onLog((log: string) => {
      addLog(log);
    });

    return () => {
      progressUnsubscribeRef.current?.();
      logUnsubscribeRef.current?.();
    };
  }, [addLog]);

  // 检查 ASR 状态
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const running = await window.YUA.asr.isRunning();
        setIsASRRunning(running);
      } catch (error) {
        console.error('检查 ASR 状态失败:', error);
      }
    };
    checkStatus();
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      stopRecording();
      stopASR();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [stopRecording, stopASR]);

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
              <Label htmlFor="modelDir">模型目录</Label>
              <Input id="modelDir" value={modelDir} onChange={(e) => setModelDir(e.target.value)} placeholder="输入模型目录路径" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">模型</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17">SenseVoice (多语言)</SelectItem>
                  <SelectItem value="sherpa-onnx-streaming-paraformer-bilingual-zh-en">Paraformer (中英双语)</SelectItem>
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
              <Button onClick={startASR} disabled={isASRRunning} size="sm" className="flex-1">
                <TbPlayerPlay className="w-4 h-4 mr-2" />
                启动 ASR
              </Button>
              <Button onClick={stopASR} disabled={!isASRRunning} size="sm" variant="outline" className="flex-1">
                <TbPlayerPause className="w-4 h-4 mr-2" />
                停止 ASR
              </Button>
              <Button
                onClick={async () => {
                  await stopASR();
                  await startASR();
                }}
                disabled={!isASRRunning}
                size="sm"
                variant="outline"
              >
                <TbRefresh className="w-4 h-4" />
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
              <Button onClick={startRecording} disabled={isRecording || !isASRRunning} size="sm" className="flex-1" variant={isRecording ? 'destructive' : 'default'}>
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
