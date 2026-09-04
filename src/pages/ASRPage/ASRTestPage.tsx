import type { ASRResultPayload } from '@packages/sherpa/ipc-renderer';
import { ScrollArea } from '@radix-ui/react-scroll-area';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbMicrophone, TbPlayerStop, TbSettings } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const SAMPLE_RATE = 16000; // 采样率 16kHz

// 将音频从原始采样率 resample 到目标采样率（简单线性插值）
function resampleTo16kHz(inputBuffer: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === SAMPLE_RATE) return inputBuffer;
  const ratio = inputSampleRate / SAMPLE_RATE;
  const outputLength = Math.round(inputBuffer.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputBuffer.length - 1);
    const frac = srcIndex - srcIndexFloor;
    output[i] = inputBuffer[srcIndexFloor] * (1 - frac) + inputBuffer[srcIndexCeil] * frac;
  }
  return output;
}

const ASRTestPage: React.FC = () => {
  const [model, setModel] = useState<string>('');
  const [isEngineReady, setIsEngineReady] = useState<boolean | null>(null); // null=checking
  const [isTesting, setIsTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [partialText, setPartialText] = useState('');
  const [results, setResults] = useState<string[]>([]);

  const isTestingRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  // 读取窗口 payload 并检查 ASR 引擎状态
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const payload = (await window.chobits.window['window:payload:get']('asrTest' as any)) as { model?: string; language?: string } | undefined;
        if (!mounted) return;
        if (payload?.model) setModel(payload.model);

        const status = await window.chobits.sherpa.getStatus();
        if (mounted) setIsEngineReady(!!(status.ok && status.running));
      } catch (error) {
        console.error('[ASR测试] 初始化失败:', error);
        if (mounted) setIsEngineReady(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 结果追加后滚动到底部
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [results, partialText]);

  const stopCapture = useCallback((): void => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    isTestingRef.current = false;
    setIsTesting(false);
    setAudioLevel(0);
    setPartialText('');
  }, []);

  // 监听 ASR 识别结果（主进程广播到所有窗口）
  useEffect(() => {
    const handleASRResult = (data: ASRResultPayload): void => {
      if (!isTestingRef.current) return;
      const text = data?.text;
      if (!text) return;

      if (data.isEndpoint) {
        setResults((prev) => [...prev, text]);
        setPartialText('');
      } else {
        setPartialText(text);
      }
    };

    const unsubscribe = window.chobits.sherpa.onASRResult(handleASRResult);
    return () => {
      unsubscribe();
    };
  }, []);

  // 组件卸载时确保停止采集
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  const handleStartTest = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      // 使用 ScriptProcessorNode 获取原始音频数据（bufferSize=4096）
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = async (e) => {
        if (!isTestingRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const resampled = resampleTo16kHz(inputData, audioCtx.sampleRate);

        // 计算音频电平
        let max = 0;
        for (let i = 0; i < resampled.length; i++) {
          const abs = Math.abs(resampled[i]);
          if (abs > max) max = abs;
        }
        setAudioLevel(max);

        // 发送给 ASR 服务（不保存录音）
        try {
          await window.chobits.sherpa.sendData({
            uuid: 'stream',
            data: resampled,
            shouldSave: false
          });
        } catch (error) {
          console.error('[ASR测试] 发送音频数据失败:', error);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination); // 需要连到 destination 才能触发 onaudioprocess

      isTestingRef.current = true;
      setIsTesting(true);
      setResults([]);
      setPartialText('');
    } catch (error) {
      console.error('[ASR测试] 启动麦克风失败:', error);
      toast.error('无法访问麦克风，请检查系统授权');
      stopCapture();
    }
  };

  const handleOpenConfig = (): void => {
    window.chobits.window['window:open']('asrConfig' as any);
    window.chobits.window['window:close']('asrTest' as any);
  };

  return (
    <div className="flex flex-col h-full w-full box-border rounded-lg bg-background drag-region">
      <div className="flex items-start justify-between gap-2 p-4 box-border border-b">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">语音识别测试</h2>
          <p className="text-sm text-muted-foreground truncate">{model ? `当前模型：${model}` : '对着麦克风说话，验证识别效果'}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" className="w-8 h-8 shrink-0 no-drag" onClick={handleOpenConfig}>
              <TbSettings />
            </Button>
          </TooltipTrigger>
          <TooltipContent>识别服务设置</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1 overflow-y-auto px-4 py-3 no-drag">
        {isEngineReady === false ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-muted-foreground">
            <span>语音识别服务未运行，请先在配置页启动</span>
            <Button size="sm" variant="outline" onClick={handleOpenConfig}>
              打开配置
            </Button>
          </div>
        ) : results.length === 0 && !partialText ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">{isTesting ? '聆听中，请开始说话...' : '点击下方「开始测试」，然后对着麦克风说话'}</div>
        ) : (
          <div className="space-y-2">
            {results.map((text, index) => (
              <div key={index} className="rounded-lg bg-muted/50 px-3 py-2 text-sm leading-relaxed break-words">
                {text}
              </div>
            ))}
            {partialText && <div className="rounded-lg border border-dashed px-3 py-2 text-sm leading-relaxed break-words text-muted-foreground">{partialText}</div>}
            <div ref={scrollEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* 音频电平条 */}
      {isTesting && (
        <div className="px-4 pb-2 no-drag">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-100" style={{ width: `${Math.min(100, Math.round(audioLevel * 100))}%` }} />
          </div>
        </div>
      )}

      <div className="flex gap-2 border-t p-2 px-4">
        <Button variant="outline" className="flex-1 no-drag" onClick={() => window.chobits.window['window:close']('asrTest' as any)}>
          关闭
        </Button>
        {isTesting ? (
          <Button variant="destructive" className="flex-1 no-drag" onClick={stopCapture}>
            停止
            <TbPlayerStop />
          </Button>
        ) : (
          <Button disabled={!isEngineReady} className="flex-1 no-drag" onClick={handleStartTest}>
            {isEngineReady === null ? (
              <>
                <TbLoader2 className="animate-spin" />
                检查中...
              </>
            ) : (
              <>
                开始测试
                <TbMicrophone />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ASRTestPage;
