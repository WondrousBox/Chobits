import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { WebRecorder } from '@/lib/web-recorder';

type SpeechInputStatus = 'idle' | 'starting' | 'listening' | 'stopping';

interface SpeechInputASRConfig {
  backend: 'local' | 'cloud';
  cloud: {
    providerId: string;
    providerPresetId: string;
    modelId: string;
  };
}

interface UseSpeechInputOptions {
  onTranscriptFinal?: (text: string) => void;
}

interface UseSpeechInputResult {
  interimText: string;
  isBusy: boolean;
  isListening: boolean;
  start: () => Promise<void>;
  status: SpeechInputStatus;
  stop: () => Promise<void>;
  toggle: () => Promise<void>;
}

function float32ToWav(samples: Float32Array, sampleRate: number = 16000): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function shouldInsertSpace(left: string, right: string): boolean {
  return /[A-Za-z0-9)]$/.test(left) && /^[A-Za-z0-9(]/.test(right);
}

export function mergeTranscriptWithInput(existing: string, transcript: string): string {
  const trimmedExisting = existing || '';
  const trimmedTranscript = transcript.trim();
  const existingWithoutTrailingSpace = trimmedExisting.replace(/[ \t]+$/u, '');

  if (!trimmedTranscript) {
    return trimmedExisting;
  }

  if (!trimmedExisting.trim()) {
    return trimmedTranscript;
  }

  if (/^[,.;:!?，。！？；：]/.test(trimmedTranscript)) {
    return `${existingWithoutTrailingSpace}${trimmedTranscript}`;
  }

  if (/\s$/.test(trimmedExisting)) {
    return `${trimmedExisting}${trimmedTranscript}`;
  }

  if (shouldInsertSpace(trimmedExisting, trimmedTranscript)) {
    return `${trimmedExisting} ${trimmedTranscript}`;
  }

  return `${trimmedExisting}${trimmedTranscript}`;
}

export function useSpeechInput({ onTranscriptFinal }: UseSpeechInputOptions = {}): UseSpeechInputResult {
  const [status, setStatus] = useState<SpeechInputStatus>('idle');
  const [interimText, setInterimText] = useState('');

  const recorderRef = useRef<WebRecorder | null>(null);
  const asrConfigRef = useRef<SpeechInputASRConfig | null>(null);
  const isActiveRef = useRef(false);
  const pendingCloudTasksRef = useRef(0);
  const recentTranscriptRef = useRef<string[]>([]);
  const handlerNameRef = useRef(`chat-speech:${Math.random().toString(36).slice(2)}`);

  const rememberTranscript = useCallback(
    (text: string): void => {
      const normalized = text.trim();
      if (!normalized) {
        return;
      }

      recentTranscriptRef.current = [...recentTranscriptRef.current, normalized].slice(-5);
      onTranscriptFinal?.(normalized);
    },
    [onTranscriptFinal]
  );

  const teardownRecorder = useCallback(async (): Promise<void> => {
    const recorder = recorderRef.current;
    recorderRef.current = null;

    if (!recorder) {
      return;
    }

    recorder.onFloat32Data = null;

    try {
      await recorder.destroy();
    } catch (error) {
      console.error('[SpeechInput] 释放录音器失败:', error);
    }
  }, []);

  const detachMessageHandler = useCallback((): void => {
    window.chobits.removeMessageHandler(handlerNameRef.current);
  }, []);

  const handleCloudSegment = useCallback(
    async (data: any): Promise<void> => {
      const asrConfig = asrConfigRef.current;
      if (!asrConfig || asrConfig.backend !== 'cloud') {
        return;
      }

      const { providerId, providerPresetId, modelId } = asrConfig.cloud;
      if (!providerId || !providerPresetId) {
        setInterimText('');
        return;
      }

      pendingCloudTasksRef.current += 1;
      setInterimText('正在识别...');

      try {
        const samples = new Float32Array(data.samples || []);
        if (samples.length === 0) {
          return;
        }

        const wavBuffer = await float32ToWav(samples).arrayBuffer();
        const result = await window.chobits.ai.transcribe({
          providerId,
          providerPresetId,
          file: wavBuffer,
          ...(modelId ? { model: modelId } : {}),
          prompt: recentTranscriptRef.current.join(' ').slice(-500)
        });

        if (isActiveRef.current && result?.text) {
          rememberTranscript(result.text);
        }
      } catch (error) {
        console.error('[SpeechInput] 云端语音识别失败:', error);
      } finally {
        pendingCloudTasksRef.current = Math.max(0, pendingCloudTasksRef.current - 1);
        if (pendingCloudTasksRef.current === 0) {
          setInterimText('');
        }
      }
    },
    [rememberTranscript]
  );

  const attachMessageHandler = useCallback((): void => {
    const handleASRMessage = (_event: any, payload: { type: string; data: any }): void => {
      if (!isActiveRef.current || payload.type !== 'sherpa:message') {
        return;
      }

      const asrConfig = asrConfigRef.current;
      const data = payload.data;
      if (!asrConfig || !data) {
        return;
      }

      if (asrConfig.backend === 'cloud' && data.samples) {
        void handleCloudSegment(data);
        return;
      }

      if (!data.text) {
        return;
      }

      if (data.isEndpoint) {
        setInterimText('');
        rememberTranscript(String(data.text));
        return;
      }

      setInterimText(String(data.text).trim());
    };

    window.chobits.handleMessage(handleASRMessage, handlerNameRef.current);
  }, [handleCloudSegment, rememberTranscript]);

  const buildRecorder = useCallback((deviceId?: string): WebRecorder => {
    const recorder = new WebRecorder({
      sampleRate: 16000,
      ...(deviceId ? { deviceId } : {})
    });

    recorder.onFloat32Data = (payload) => {
      if (!isActiveRef.current) {
        return;
      }

      window.chobits.sherpa
        .sendData({
          uuid: 'stream',
          data: payload.data,
          shouldSave: false
        })
        .catch((error) => {
          console.error('[SpeechInput] 发送音频到 ASR 失败:', error);
        });
    };

    return recorder;
  }, []);

  const start = useCallback(async (): Promise<void> => {
    if (status !== 'idle') {
      return;
    }

    setStatus('starting');
    setInterimText('');
    recentTranscriptRef.current = [];
    pendingCloudTasksRef.current = 0;

    try {
      const [asrStatus, asrConfig, deviceResult] = await Promise.all([window.chobits.sherpa.getStatus(), window.chobits.sherpa.getASRConfig(), window.chobits.preferences['preferences:get-web-recorder-device-id']()]);

      if (!asrStatus.running) {
        toast.error('请先启动语音识别服务');
        window.chobits.window['window:open']('asrConfig');
        setStatus('idle');
        return;
      }

      if (asrConfig.backend === 'cloud' && (!asrConfig.cloud?.providerId || !asrConfig.cloud?.providerPresetId)) {
        toast.error('云端语音识别配置不完整');
        window.chobits.window['window:open']('asrConfig');
        setStatus('idle');
        return;
      }

      asrConfigRef.current = asrConfig as SpeechInputASRConfig;
      isActiveRef.current = true;
      attachMessageHandler();

      const preferredDeviceId = deviceResult.ok ? deviceResult.deviceId : undefined;
      let recorder = buildRecorder(preferredDeviceId);

      try {
        await recorder.start();
      } catch (error: any) {
        await recorder.destroy();

        if (!preferredDeviceId || !['NotFoundError', 'OverconstrainedError'].includes(error?.name || '')) {
          throw error;
        }

        recorder = buildRecorder();
        await recorder.start();
      }

      recorderRef.current = recorder;
      setStatus('listening');
    } catch (error: any) {
      console.error('[SpeechInput] 启动语音输入失败:', error);
      isActiveRef.current = false;
      asrConfigRef.current = null;
      detachMessageHandler();
      await teardownRecorder();
      setInterimText('');
      setStatus('idle');

      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        toast.error('麦克风权限被拒绝，请先允许访问麦克风');
      } else if (error?.name === 'NotFoundError') {
        toast.error('未检测到麦克风设备');
      } else if (error?.name === 'NotReadableError') {
        toast.error('麦克风被其他程序占用');
      } else {
        toast.error('启动语音输入失败');
      }
    }
  }, [attachMessageHandler, buildRecorder, detachMessageHandler, status, teardownRecorder]);

  const stop = useCallback(async (): Promise<void> => {
    if (status === 'idle' || status === 'stopping') {
      return;
    }

    setStatus('stopping');
    isActiveRef.current = false;
    pendingCloudTasksRef.current = 0;
    setInterimText('');
    asrConfigRef.current = null;
    detachMessageHandler();
    await teardownRecorder();
    setStatus('idle');
  }, [detachMessageHandler, status, teardownRecorder]);

  const toggle = useCallback(async (): Promise<void> => {
    if (status === 'idle') {
      await start();
      return;
    }

    if (status === 'listening') {
      await stop();
    }
  }, [start, status, stop]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      pendingCloudTasksRef.current = 0;
      detachMessageHandler();
      void teardownRecorder();
    };
  }, [detachMessageHandler, teardownRecorder]);

  return {
    interimText,
    isBusy: status === 'starting' || status === 'stopping',
    isListening: status === 'listening',
    start,
    status,
    stop,
    toggle
  };
}
