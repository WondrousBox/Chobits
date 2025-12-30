import { useCallback, useEffect, useRef, useState } from 'react';

import { RecognizedSegment } from '../types';

interface UseASRProps {
  enableTranslation: boolean;
  translateText: (text: string, onUpdate?: (translation: string) => void) => Promise<void>;
  onAudioLevel?: (level: number) => void;
  mode?: 'local' | 'cloud';
  cloudProviderId?: string;
  cloudModelId?: string;
}

// Helper to convert Float32Array to WAV Blob
function float32ToWav(samples: Float32Array, sampleRate: number = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write samples
  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

const SAMPLE_RATE = 16000; // 采样率 16kHz

export const useASR = ({
  enableTranslation,
  translateText,
  onAudioLevel,
  mode = 'local',
  cloudProviderId,
  cloudModelId
}: UseASRProps): {
  isRecording: boolean;
  isASRRunning: boolean;
  setIsASRRunning: React.Dispatch<React.SetStateAction<boolean>>;
  recognizedSegments: RecognizedSegment[];
  progressText: string;
  progressStart: number;
  progressEnd: number;
  recordingDuration: number; // 录音时长（秒）
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  wsRef: React.MutableRefObject<WebSocket | null>;
} => {
  const [isRecording, setIsRecording] = useState(false);
  // 默认假设 ASR 服务已启动，因为是从配置页面进入的
  const [isASRRunning, setIsASRRunning] = useState(true);
  const [recognizedSegments, setRecognizedSegments] = useState<RecognizedSegment[]>([]);
  const [progressText, setProgressText] = useState<string>('');
  const [progressStart, setProgressStart] = useState<number>(0);
  const [progressEnd, setProgressEnd] = useState<number>(0);
  const [totalSamples, setTotalSamples] = useState<number>(0); // 已发送的总采样点数

  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const isASRRunningRef = useRef(true);
  const recognizedTextRef = useRef('');

  // 更新录音状态 ref
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // 更新 ASR 运行状态 ref
  useEffect(() => {
    isASRRunningRef.current = isASRRunning;
  }, [isASRRunning]);

  // 更新已识别文本 ref (用于 prompt)
  useEffect(() => {
    // 取最近的 5 条记录作为上下文
    const recentSegments = recognizedSegments.slice(-5);
    const text = recentSegments.map((s) => s.text).join('');
    // 限制长度，避免过长
    recognizedTextRef.current = text.slice(-500);
  }, [recognizedSegments]);

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

            // 回调音频电平
            onAudioLevel?.(max);

            // 发送给 ASR 服务
            if (isASRRunningRef.current) {
              try {
                await window.YUA.sherpa.sendData({
                  uuid: 'stream',
                  data: float32Array
                });
                // 累加已发送的采样点数
                setTotalSamples((prev) => prev + float32Array.length);
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
  }, [onAudioLevel]);

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
        // 重置采样点数计数器
        setTotalSamples(0);
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
    } catch (error) {
      console.error('停止录音失败:', error);
      setIsRecording(false);
    }
  }, []);

  // 监听 ASR 识别结果
  useEffect(() => {
    const handleASRMessage = async (
      _event: any,
      d: {
        type: string;
        data: any;
      }
    ): Promise<void> => {
      const data = d.data;
      if (d.type !== 'sherpa:message') return;

      // 处理 VAD 片段 (云端模式)
      if (mode === 'cloud' && data.samples && cloudProviderId) {
        try {
          // 转换音频数据
          const samples = new Float32Array(data.samples);
          const wavBlob = float32ToWav(samples);
          const wavBuffer = await wavBlob.arrayBuffer();

          // 显示正在识别状态
          setProgressText('正在识别...');
          setProgressStart(data.start);
          setProgressEnd(data.start + data.duration);

          // 调用云端识别
          const result = await window.YUA.ai.transcribe({
            providerId: cloudProviderId,
            file: wavBuffer as any,
            model: cloudModelId,
            language: 'zh', // TODO: 支持多语言配置
            prompt: recognizedTextRef.current
          });

          console.log(result);

          if (result && result.text) {
            const newSegment: RecognizedSegment = {
              text: result.text,
              start: data.start,
              end: data.start + data.duration
            };

            setRecognizedSegments((prev) => [...prev, newSegment]);

            // 翻译
            if (enableTranslation && result.text.trim()) {
              translateText(result.text, (translation) => {
                setRecognizedSegments((prev) => {
                  const updated = [...prev];
                  const index = updated.findIndex((s) => s.start === newSegment.start && s.end === newSegment.end);
                  if (index !== -1) {
                    updated[index] = { ...updated[index], translation };
                  }
                  return updated;
                });
              });
            }
          }
          setProgressText('');
        } catch (error) {
          console.error('云端识别失败:', error);
          setProgressText('识别失败');
        }
        return;
      }

      if (data.text) {
        setProgressText(data.text);
        setProgressStart(data.start);
        setProgressEnd(data.end);

        if (data.isEndpoint) {
          // 如果是端点，添加到完整结果列表
          const newSegment: RecognizedSegment = {
            text: data.text,
            start: data.start,
            end: data.end
          };

          // 先添加到列表
          setRecognizedSegments((prev) => [...prev, newSegment]);

          // 翻译完整片段（仅在句子结束时）
          if (enableTranslation && data.text.trim()) {
            translateText(data.text, (translation) => {
              setRecognizedSegments((prev) => {
                const updated = [...prev];
                // 查找对应的片段进行更新
                const index = updated.findIndex((s) => s.start === data.start && s.end === data.end && s.text === data.text);
                if (index !== -1) {
                  updated[index] = { ...updated[index], translation };
                }
                return updated;
              });
            });
          }
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
  }, [enableTranslation, translateText, mode, cloudProviderId, cloudModelId]);

  // 自动开始录音
  useEffect(() => {
    const autoStart = async (): Promise<void> => {
      try {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          await connectWebSocket();
        }
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send('start');
          setIsRecording(true);
          // 重置采样点数计数器
          setTotalSamples(0);
        }
      } catch (error) {
        console.error('自动开始录音失败:', error);
      }
    };

    const timer = setTimeout(() => {
      autoStart();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [connectWebSocket]);

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

  // 计算录音时长（秒）
  const recordingDuration = totalSamples / SAMPLE_RATE;

  return {
    isRecording,
    isASRRunning,
    setIsASRRunning,
    recognizedSegments,
    progressText,
    progressStart,
    progressEnd,
    recordingDuration,
    startRecording,
    stopRecording,
    wsRef
  };
};
