import { useCallback, useEffect, useRef, useState } from 'react';

import { RecognizedSegment } from '../types';

interface UseASRProps {
  enableTranslation: boolean;
  translateText: (text: string, onUpdate?: (translation: string) => void) => Promise<void>;
  onAudioLevel?: (level: number) => void;
}

export const useASR = ({
  enableTranslation,
  translateText,
  onAudioLevel
}: UseASRProps): {
  isRecording: boolean;
  isASRRunning: boolean;
  setIsASRRunning: React.Dispatch<React.SetStateAction<boolean>>;
  recognizedSegments: RecognizedSegment[];
  progressText: string;
  progressStart: number;
  progressEnd: number;
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

  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const isASRRunningRef = useRef(true);

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

            // 回调音频电平
            onAudioLevel?.(max);

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
  }, [enableTranslation, translateText]);

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

  return {
    isRecording,
    isASRRunning,
    setIsASRRunning,
    recognizedSegments,
    progressText,
    progressStart,
    progressEnd,
    startRecording,
    stopRecording,
    wsRef
  };
};
