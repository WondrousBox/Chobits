import { useCallback, useEffect, useRef, useState } from 'react';

import { PendingSegment, PunctuationSegment, RecognizedSegment } from '../types';

export type AudioSource = 'microphone' | 'system-audio';

interface UseASRProps {
  enableTranslation: boolean;
  translateText: (text: string, onUpdate?: (translation: string) => void) => Promise<void>;
  onAudioLevel?: (level: number) => void;
  mode?: 'local' | 'cloud';
  cloudProviderId?: string;
  cloudProviderPresetId?: string;
  cloudModelId?: string;
  enableSmallSegments?: boolean; // 是否启用分小段模式（按标点符号拆分）
  audioSource?: AudioSource; // 音频来源：麦克风或系统音频
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

export const useASR = ({
  enableTranslation,
  translateText,
  onAudioLevel,
  mode = 'local',
  cloudProviderId,
  cloudProviderPresetId,
  cloudModelId,
  enableSmallSegments = true, // 默认开启分小段模式
  audioSource = 'system-audio'
}: UseASRProps): {
  isRecording: boolean;
  isASRRunning: boolean;
  setIsASRRunning: React.Dispatch<React.SetStateAction<boolean>>;
  recognizedSegments: RecognizedSegment[];
  pendingSegments: PendingSegment[]; // 临时展示的片段（未到 endpoint）
  progressText: string;
  progressStart: number;
  progressEnd: number;
  recordingDuration: number; // 录音时长（秒）
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resumeRecording: (resourceId: string) => Promise<void>; // 继续之前的录音
  wsRef: React.MutableRefObject<WebSocket | null>;
  getRecordingResourceId: () => string | null; // 获取当前录音的资源ID
  updateSegmentTranslation: (index: number, translation: string) => void; // 更新指定索引的翻译
} => {
  const [isRecording, setIsRecording] = useState(false);
  // 默认假设 ASR 服务已启动，因为是从配置页面进入的
  const [isASRRunning, setIsASRRunning] = useState(true);
  const [recognizedSegments, setRecognizedSegments] = useState<RecognizedSegment[]>([]);
  const [pendingSegments, setPendingSegments] = useState<PendingSegment[]>([]); // 临时展示的片段
  const [progressText, setProgressText] = useState<string>('');
  const [progressStart, setProgressStart] = useState<number>(0);
  const [progressEnd, setProgressEnd] = useState<number>(0);
  const [totalSamples, setTotalSamples] = useState<number>(0); // 已发送的总采样点数

  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const isASRRunningRef = useRef(true);
  const recognizedTextRef = useRef('');
  const recordingResourceIdRef = useRef<string | null>(null); // 当前录音的资源ID

  // 麦克风模式相关 refs
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

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
                  data: float32Array,
                  save: isRecordingRef.current && recordingResourceIdRef.current !== null // 如果正在录音且有资源ID，则保存
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

  // 创建录音存储资源（共用逻辑）
  const createRecordingResource = useCallback(async (): Promise<void> => {
    try {
      console.log('[ASR] 开始调用主进程创建录音资源');
      const result = await window.YUA.sherpa.startRecording({});
      console.log('[ASR] 录音资源创建结果:', result);

      if (result.success && result.resourceId) {
        recordingResourceIdRef.current = result.resourceId;
        console.log('[ASR] ✅ 录音资源ID已保存到ref:', recordingResourceIdRef.current);
        const sessionInfo = {
          resourceId: result.resourceId,
          startTime: Date.now(),
          segments: []
        };
        localStorage.setItem('asr-current-recording', JSON.stringify(sessionInfo));
      } else {
        console.error('[ASR] ❌ 录音资源创建失败:', result.error || '未知错误');
      }
    } catch (error) {
      console.error('[ASR] ❌ 开始录音存储异常:', error);
    }
  }, []);

  // 麦克风模式：连接麦克风并开始采集
  const startMicrophoneRecording = useCallback(async (): Promise<void> => {
    console.log('[ASR] 开始麦克风录音模式');

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
        if (!isRecordingRef.current || !isASRRunningRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // resample 到 16kHz
        const resampled = resampleTo16kHz(inputData, audioCtx.sampleRate);

        // 计算音频电平
        let max = 0;
        for (let i = 0; i < resampled.length; i++) {
          const abs = Math.abs(resampled[i]);
          if (abs > max) max = abs;
        }
        onAudioLevel?.(max);

        // 发送给 ASR 服务
        try {
          await window.YUA.sherpa.sendData({
            uuid: 'stream',
            data: resampled,
            save: isRecordingRef.current && recordingResourceIdRef.current !== null
          });
          setTotalSamples((prev) => prev + resampled.length);
        } catch (error) {
          console.error('[ASR] 发送麦克风音频数据到 ASR 失败:', error);
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination); // 需要连到 destination 才能触发 onaudioprocess

      console.log('[ASR] ✅ 麦克风音频采集已启动，采样率:', audioCtx.sampleRate);
    } catch (error) {
      console.error('[ASR] ❌ 启动麦克风失败:', error);
      throw error;
    }
  }, [onAudioLevel]);

  // 麦克风模式：停止采集
  const stopMicrophoneRecording = useCallback(() => {
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
    console.log('[ASR] 麦克风音频采集已停止');
  }, []);

  // 开始录音
  const startRecording = useCallback(async (): Promise<void> => {
    console.log('[ASR] ========== startRecording ==========, audioSource:', audioSource);

    if (!isASRRunning) {
      console.error('[ASR] ❌ ASR服务未运行，无法开始录音');
      return;
    }

    try {
      if (audioSource === 'microphone') {
        // 麦克风模式
        await createRecordingResource();
        await startMicrophoneRecording();
        setIsRecording(true);
        setTotalSamples(0);
        console.log('[ASR] ========== 麦克风录音流程完成 ==========');
      } else {
        // 系统音频模式（原有 WebSocket 逻辑）
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[ASR] WebSocket未连接，开始连接...');
          await connectWebSocket();
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          await createRecordingResource();
          wsRef.current.send('start');
          setIsRecording(true);
          setTotalSamples(0);
          console.log('[ASR] ========== 系统音频录音流程完成 ==========');
        } else {
          console.error('[ASR] ❌ WebSocket未连接，无法开始录音');
        }
      }
    } catch (error) {
      console.error('[ASR] ❌ 开始录音失败:', error);
    }
  }, [isASRRunning, audioSource, connectWebSocket, createRecordingResource, startMicrophoneRecording]);

  // 停止录音
  const stopRecording = useCallback(async () => {
    try {
      // 根据音频源停止对应的采集
      if (audioSource === 'microphone') {
        stopMicrophoneRecording();
      } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send('stop');
      }

      // 停止录音存储
      console.log('[ASR] ========== 停止录音流程 ==========');
      console.log('[ASR] 检查录音资源ID，recordingResourceIdRef.current:', recordingResourceIdRef.current);

      // 尝试从localStorage恢复资源ID（如果ref为空）
      if (!recordingResourceIdRef.current) {
        console.log('[ASR] ref为空，尝试从localStorage恢复...');
        try {
          const savedRecording = localStorage.getItem('asr-current-recording');
          console.log('[ASR] localStorage中的录音记录:', savedRecording);
          if (savedRecording) {
            const parsed = JSON.parse(savedRecording);
            console.log('[ASR] 解析后的录音记录:', parsed);
            const { resourceId } = parsed;
            if (resourceId) {
              console.log('[ASR] ✅ 从localStorage恢复录音资源ID:', resourceId);
              recordingResourceIdRef.current = resourceId;
            } else {
              console.warn('[ASR] ⚠️ localStorage中的录音记录没有resourceId字段');
            }
          } else {
            console.warn('[ASR] ⚠️ localStorage中没有录音记录');
          }
        } catch (error) {
          console.error('[ASR] ❌ 从localStorage恢复录音资源ID失败:', error);
        }
      }

      console.log('[ASR] 最终检查，recordingResourceIdRef.current:', recordingResourceIdRef.current);

      if (recordingResourceIdRef.current) {
        console.log('[ASR] ✅ 找到录音资源ID，开始停止录音存储，resourceId:', recordingResourceIdRef.current);
        try {
          const result = await window.YUA.sherpa.stopRecording();
          console.log('[ASR] 停止录音存储结果:', result);

          if (result.success) {
            console.log('[ASR] ✅ 录音存储已停止，resourceId:', result.resourceId);
            // 清空ref
            recordingResourceIdRef.current = null;
            console.log('[ASR] ✅ 已清空录音资源ID ref');
          } else {
            console.error('[ASR] ❌ 停止录音存储失败:', result.error);
          }

          // 清除localStorage中的录音记录
          localStorage.removeItem('asr-current-recording');
          console.log('[ASR] ✅ 已清除localStorage中的录音记录');
        } catch (error) {
          console.error('[ASR] ❌ 停止录音存储异常:', error);
          if (error instanceof Error) {
            console.error('[ASR] ❌ 错误堆栈:', error.stack);
          }
        }
      } else {
        console.error('[ASR] ❌ 没有活动的录音资源ID，跳过停止录音存储');
        console.error('[ASR] ❌ 可能的原因：1) 开始录音时未成功创建资源 2) ref被意外清空');
        console.error('[ASR] ❌ 请检查开始录音时的日志，确认是否看到"开始调用主进程创建录音资源"');
      }

      console.log('[ASR] ========== 停止录音流程完成 ==========');

      setIsRecording(false);
    } catch (error) {
      console.error('停止录音失败:', error);
      setIsRecording(false);
    }
  }, [audioSource, stopMicrophoneRecording]);

  // 继续之前的录音
  const resumeRecording = useCallback(
    async (resourceId: string): Promise<void> => {
      console.log('[ASR] ========== resumeRecording函数被调用 ==========');
      console.log('[ASR] resourceId:', resourceId);

      if (!isASRRunning) {
        console.error('[ASR] ❌ ASR服务未运行，无法继续录音');
        return;
      }

      try {
        // 确保 WebSocket 已连接
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('[ASR] WebSocket未连接，开始连接...');
          await connectWebSocket();
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log('[ASR] 开始调用主进程继续录音');

          // 调用继续录音接口
          const result = await window.YUA.sherpa.resumeRecording({ resourceId });
          console.log('[ASR] 继续录音结果:', result);

          if (result.success && result.resourceId) {
            recordingResourceIdRef.current = result.resourceId;
            console.log('[ASR] ✅ 录音资源ID已恢复:', recordingResourceIdRef.current);

            // 保存到 localStorage
            const sessionInfo = {
              resourceId: result.resourceId,
              startTime: Date.now(),
              segments: [],
              isResumed: true,
              previousSegmentCount: result.segmentCount || 0
            };
            localStorage.setItem('asr-current-recording', JSON.stringify(sessionInfo));
            console.log('[ASR] ✅ 录音会话信息已保存到localStorage');

            // 发送 start 消息
            wsRef.current.send('start');
            setIsRecording(true);
            // 重置采样点数（继续录音时从0开始计算新增部分）
            setTotalSamples(0);

            console.log('[ASR] ========== 继续录音成功 ==========');
          } else {
            console.error('[ASR] ❌ 继续录音失败:', result.error);
          }
        } else {
          console.error('[ASR] ❌ WebSocket未连接，无法继续录音');
        }
      } catch (error) {
        console.error('[ASR] ❌ 继续录音失败:', error);
      }
    },
    [isASRRunning, connectWebSocket]
  );

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
      if (mode === 'cloud' && data.samples && cloudProviderId && cloudProviderPresetId) {
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
            providerPresetId: cloudProviderPresetId,
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

            // 流式写入字幕文件
            window.YUA.sherpa.appendSubtitle({ segment: newSegment }).catch((err) => {
              console.error('[ASR] 流式写入字幕失败:', err);
            });

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
        // 处理 result_with_punctuation 数据
        const resultWithPunctuation: PunctuationSegment[] | undefined = data.result_with_punctuation;

        if (data.isEndpoint) {
          // 如果是端点，清空临时展示的片段，添加到完整结果列表
          setPendingSegments([]);

          if (enableSmallSegments && resultWithPunctuation && resultWithPunctuation.length > 0) {
            // 分小段模式：将每个标点分割的片段都作为独立的已识别片段
            const smallSegments: RecognizedSegment[] = resultWithPunctuation.map((seg, index) => ({
              text: seg.text + (seg.punctuation || ''),
              start: data.start + (index === 0 ? 0 : (resultWithPunctuation[index - 1].timestamps?.slice(-1)[0] || 0) * 1000),
              end: data.end
            }));

            setRecognizedSegments((prev) => [...prev, ...smallSegments]);

            // 流式写入字幕文件（每个小段都写入）
            smallSegments.forEach((segment) => {
              window.YUA.sherpa.appendSubtitle({ segment }).catch((err) => {
                console.error('[ASR] 流式写入字幕失败:', err);
              });
            });

            // 翻译每个小段（翻译完成后更新字幕文件）
            if (enableTranslation) {
              smallSegments.forEach((segment) => {
                if (segment.text.trim()) {
                  translateText(segment.text, (translation) => {
                    setRecognizedSegments((prev) => {
                      const updated = [...prev];
                      const index = updated.findIndex((s) => s.start === segment.start && s.text === segment.text);
                      if (index !== -1) {
                        updated[index] = { ...updated[index], translation };
                      }
                      return updated;
                    });
                    // 注意：翻译结果暂不更新已写入的字幕文件，因为 SRT 格式不支持原地更新
                    // 如果需要翻译结果，可以在停止录音后重新生成完整的 SRT 文件
                  });
                }
              });
            }
          } else {
            // 原始模式：合并成一大段
            const newSegment: RecognizedSegment = {
              text: data.text,
              start: data.start,
              end: data.end
            };

            setRecognizedSegments((prev) => [...prev, newSegment]);

            // 流式写入字幕文件
            window.YUA.sherpa.appendSubtitle({ segment: newSegment }).catch((err) => {
              console.error('[ASR] 流式写入字幕失败:', err);
            });

            // 翻译完整片段
            if (enableTranslation && data.text.trim()) {
              translateText(data.text, (translation) => {
                setRecognizedSegments((prev) => {
                  const updated = [...prev];
                  const index = updated.findIndex((s) => s.start === data.start && s.end === data.end && s.text === data.text);
                  if (index !== -1) {
                    updated[index] = { ...updated[index], translation };
                  }
                  return updated;
                });
              });
            }
          }

          setProgressText('');
          setProgressStart(0);
          setProgressEnd(0);
        } else {
          // 非 endpoint，处理实时识别结果
          if (enableSmallSegments && resultWithPunctuation && resultWithPunctuation.length > 0) {
            // 如果有多个片段，把非最后一段放入 pendingSegments
            if (resultWithPunctuation.length > 1) {
              const pendingItems = resultWithPunctuation.slice(0, -1).map((seg, index) => ({
                text: seg.text + (seg.punctuation || ''),
                start: data.start + (index === 0 ? 0 : (resultWithPunctuation[index - 1].timestamps?.slice(-1)[0] || 0) * 1000),
                end: data.end,
                isPending: true as const
              }));
              setPendingSegments(pendingItems);
            } else {
              setPendingSegments([]);
            }

            // 最后一段作为 progressText 展示
            const lastSegment = resultWithPunctuation[resultWithPunctuation.length - 1];
            setProgressText(lastSegment.text);
          } else {
            // 没有 result_with_punctuation 或未启用分小段模式，使用原来的逻辑
            setPendingSegments([]);
            setProgressText(data.text);
          }
          setProgressStart(data.start);
          setProgressEnd(data.end);
        }
      }
    };

    window.YUA.handleMessage(handleASRMessage, 'sherpa:message');

    return () => {
      window.YUA.removeHandler('sherpa:message');
    };
  }, [enableTranslation, translateText, mode, cloudProviderId, cloudProviderPresetId, cloudModelId, enableSmallSegments]);

  // 自动开始录音
  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('[ASR] 自动开始录音，调用 startRecording');
      startRecording();
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [startRecording]);

  // 清理
  useEffect(() => {
    return () => {
      stopRecording();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopMicrophoneRecording();
    };
  }, [stopRecording, stopMicrophoneRecording]);

  // 计算录音时长（秒）
  const recordingDuration = totalSamples / SAMPLE_RATE;

  // 获取当前录音的资源ID
  const getRecordingResourceId = useCallback(() => {
    const id = recordingResourceIdRef.current;
    console.log('[ASR] getRecordingResourceId调用，ref值:', id);

    // 如果ref为空，尝试从localStorage恢复
    if (!id) {
      try {
        const savedRecording = localStorage.getItem('asr-current-recording');
        if (savedRecording) {
          const { resourceId } = JSON.parse(savedRecording);
          console.log('[ASR] 从localStorage恢复录音资源ID:', resourceId);
          recordingResourceIdRef.current = resourceId;
          return resourceId;
        }
      } catch (error) {
        console.error('[ASR] 从localStorage恢复录音资源ID失败:', error);
      }
    }

    return id;
  }, []);

  // 更新指定索引的 segment 的翻译
  const updateSegmentTranslation = useCallback((index: number, translation: string) => {
    setRecognizedSegments((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], translation };
      return updated;
    });
  }, []);

  return {
    isRecording,
    isASRRunning,
    setIsASRRunning,
    recognizedSegments,
    pendingSegments,
    progressText,
    progressStart,
    progressEnd,
    recordingDuration,
    startRecording,
    stopRecording,
    resumeRecording,
    wsRef,
    getRecordingResourceId,
    updateSegmentTranslation
  };
};
