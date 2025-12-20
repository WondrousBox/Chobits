import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbMicrophone, TbMicrophoneOff, TbPlayerPause, TbPlayerPlay, TbRefresh } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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

  // 添加日志
  const addLog = useCallback((log: string) => {
    setLogs((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${log}`]);
  }, []);

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
              <Button disabled={isASRRunning} size="sm" className="flex-1">
                <TbPlayerPlay className="w-4 h-4 mr-2" />
                启动 ASR
              </Button>
              <Button disabled={!isASRRunning} size="sm" variant="outline" className="flex-1">
                <TbPlayerPause className="w-4 h-4 mr-2" />
                停止 ASR
              </Button>
              <Button onClick={async () => { }} disabled={!isASRRunning} size="sm" variant="outline">
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
              <Button disabled={isRecording || !isASRRunning} size="sm" className="flex-1" variant={isRecording ? 'destructive' : 'default'}>
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
