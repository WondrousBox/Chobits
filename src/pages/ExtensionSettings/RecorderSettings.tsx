import React, { useEffect, useRef, useState } from 'react';
import { TbActivity, TbLoader2, TbMicrophone, TbPlayerPlay, TbPlayerStop, TbPlugConnected, TbPlugX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/* ─── Hook ─── */
export function useRecorderSettings() {
  const [recorderConfig, setRecorderConfig] = useState<{ enabled?: boolean } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const applyingRef = useRef(false);

  const checkStatus = async (): Promise<void> => {
    try {
      const status = await window.YUA.recorder.getStatus();
      setIsRunning(status);
    } catch (error) {
      console.error('Failed to get recorder status:', error);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await window.YUA.recorder.getConfig();
        if (!cancelled) {
          applyingRef.current = true;
          setRecorderConfig(cfg);
          loadedRef.current = true;

          if (cfg.enabled) {
            const status = await window.YUA.recorder.getStatus();
            if (!status) {
              try {
                await window.YUA.recorder.start();
                await checkStatus();
              } catch (error) {
                console.error('Failed to auto-start recorder:', error);
                const updatedConfig = { ...cfg, enabled: false };
                setRecorderConfig(updatedConfig);
                await window.YUA.recorder.updateConfig(updatedConfig);
                await checkStatus();
              }
            } else {
              await checkStatus();
            }
          } else {
            await checkStatus();
          }
        }
      } catch (error) {
        console.warn('加载录音配置失败:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!recorderConfig) return;
    if (!loadedRef.current) return;
    if (applyingRef.current) {
      applyingRef.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        await window.YUA.recorder.updateConfig(recorderConfig);
      } catch (error) {
        console.error('自动保存录音配置失败:', error);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [recorderConfig]);

  const enabled = recorderConfig?.enabled !== false;

  const handleToggle = async (checked: boolean): Promise<void> => {
    setRecorderConfig((prev) => ({ ...prev, enabled: checked }));
    setLoading(true);

    try {
      if (checked) {
        await window.YUA.recorder.start();
        await checkStatus();
        const status = await window.YUA.recorder.getStatus();
        if (!status) {
          throw new Error('启动失败：状态检查未通过');
        }
      } else {
        await window.YUA.recorder.stop();
        await checkStatus();
      }
    } catch (error) {
      console.error('Failed to toggle recorder:', error);
      setRecorderConfig((prev) => ({ ...prev, enabled: false }));
      try {
        await window.YUA.recorder.updateConfig({ ...recorderConfig, enabled: false });
      } catch (saveError) {
        console.error('Failed to save config after error:', saveError);
      }
    } finally {
      setLoading(false);
    }
  };

  return { enabled, isRunning, loading, recorderConfig, handleToggle, checkStatus };
}

export type RecorderSettingsState = ReturnType<typeof useRecorderSettings>;

/* ─── Left-panel item ─── */
export const RecorderItem: React.FC<{
  state: RecorderSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors', state.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbMicrophone className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">录音服务</div>
      <div className="text-xs text-muted-foreground line-clamp-1">管理后台录音进程，开启后可使用语音功能。</div>
    </div>
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {state.loading && <TbLoader2 className="animate-spin h-4 w-4 text-muted-foreground" />}
      <Switch checked={state.enabled} onCheckedChange={state.handleToggle} disabled={state.loading || !state.recorderConfig} />
    </div>
  </div>
);

/* ─── Right-panel detail (WebSocket test UI lives here) ─── */
export const RecorderDetailContent: React.FC<{ state: RecorderSettingsState }> = ({ state }) => {
  const { enabled, isRunning } = state;

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFormat, setAudioFormat] = useState<string>('-');

  const wsRef = useRef<WebSocket | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Clean up WebSocket on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    };
  }, []);

  const addLog = (msg: string): void => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const disconnect = (): void => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
      addLog('手动断开WebSocket连接');
    }
    wsRef.current = null;
    setIsConnected(false);
    setIsRecording(false);
  };

  if (!enabled) {
    return <p className="text-sm text-muted-foreground py-4">请先在左侧开启录音服务。</p>;
  }

  if (!isRunning) {
    return <p className="text-sm text-muted-foreground py-4">录音服务正在启动中...</p>;
  }

  const handleAudioData = (blob: Blob): void => {
    if (isRecordingRef.current) {
      audioChunksRef.current.push(blob);
    }
  };

  const connect = (): void => {
    const port = 8765;
    const url = `ws://127.0.0.1:${port}`;
    addLog(`正在连接到 ${url}...`);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        addLog('WebSocket连接已建立');
        setIsConnected(true);
      };
      ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          handleAudioData(event.data);
        } else {
          addLog(`收到消息: ${event.data}`);
        }
      };
      ws.onclose = () => {
        addLog('WebSocket连接已关闭');
        setIsConnected(false);
        setIsRecording(false);
      };
      ws.onerror = (error) => {
        addLog('WebSocket错误');
        console.error(error);
        setIsConnected(false);
      };
    } catch (e) {
      addLog(`连接失败: ${e}`);
    }
  };

  const startRecording = (): void => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('WebSocket未连接');
      return;
    }
    audioChunksRef.current = [];
    setAudioUrl(null);
    setAudioFormat('-');
    wsRef.current.send('start');
    addLog('发送start消息');
    setIsRecording(true);
  };

  const float32ToWav = (float32Array: Float32Array, sampleRate: number): Blob => {
    const length = float32Array.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);
    const samples = new Int16Array(buffer, 44);
    const writeString = (offset: number, s: string): void => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
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
    view.setUint32(40, length * 2, true);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const mergeAndPlayAudio = async (): Promise<void> => {
    if (audioChunksRef.current.length === 0) {
      addLog('没有录制的音频数据');
      return;
    }
    addLog(`正在合并 ${audioChunksRef.current.length} 个音频数据块...`);
    const buffers = await Promise.all(
      audioChunksRef.current.map(
        (blob) =>
          new Promise<ArrayBuffer>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
            reader.readAsArrayBuffer(blob);
          })
      )
    );
    const totalBytes = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    addLog(`总字节数: ${totalBytes}`);
    const firstChunkBytes = buffers[0].byteLength;
    let float32Array: Float32Array;
    let formatName = '未知';
    if (firstChunkBytes % 4 === 0 && totalBytes % 4 === 0) {
      formatName = 'Float32 (32位浮点数)';
      const totalSamples = totalBytes / 4;
      float32Array = new Float32Array(totalSamples);
      let offset = 0;
      for (const buf of buffers) {
        const chunk = new Float32Array(buf);
        float32Array.set(chunk, offset);
        offset += chunk.length;
      }
    } else {
      formatName = 'Float32 (推测)';
      const totalSamples = Math.floor(totalBytes / 4);
      float32Array = new Float32Array(totalSamples);
      let offset = 0;
      for (const buf of buffers) {
        const chunk = new Float32Array(buf.slice(0, Math.floor(buf.byteLength / 4) * 4));
        float32Array.set(chunk, offset);
        offset += chunk.length;
      }
    }
    setAudioFormat(formatName);
    addLog(`检测到格式: ${formatName}`);
    const wavBlob = float32ToWav(float32Array, 16000);
    const url = URL.createObjectURL(wavBlob);
    setAudioUrl(url);
    addLog('音频已准备就绪');
  };

  const stopRecording = (): void => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addLog('WebSocket未连接');
      return;
    }
    wsRef.current.send('stop');
    addLog('发送stop消息');
    setIsRecording(false);
    mergeAndPlayAudio();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TbActivity className="text-muted-foreground" />
          <span className="text-sm font-medium">服务测试</span>
        </div>
        <div className={`rounded-full px-2 py-1 text-xs ${isConnected ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>{isConnected ? '已连接' : '未连接'}</div>
      </div>

      <div className="flex gap-2">
        {!isConnected ? (
          <Button size="sm" variant="outline" onClick={connect} className="gap-2">
            <TbPlugConnected /> 连接服务
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={disconnect} className="gap-2 text-red-500 hover:text-red-600">
            <TbPlugX /> 断开连接
          </Button>
        )}
        <Button size="sm" variant="default" disabled={!isConnected || isRecording} onClick={startRecording} className="gap-2">
          <TbPlayerPlay /> 开始录音
        </Button>
        <Button size="sm" variant="destructive" disabled={!isConnected || !isRecording} onClick={stopRecording} className="gap-2">
          <TbPlayerStop /> 停止录音
        </Button>
      </div>

      {audioUrl && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <div className="text-xs text-muted-foreground flex justify-between">
            <span>录音回放</span>
            <span>格式: {audioFormat}</span>
          </div>
          <audio src={audioUrl} controls className="w-full h-8" />
        </div>
      )}

      <div className="bg-muted rounded-lg p-3 h-32 overflow-y-auto text-xs font-mono space-y-1">
        {logs.length === 0 && <div className="text-muted-foreground/50 italic">暂无日志...</div>}
        {logs.map((log, i) => (
          <div key={i} className="break-all">
            {log}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

/* ─── Default: self-contained detail (for SkillDetailPanel) ─── */
const RecorderSettings: React.FC = () => {
  const state = useRecorderSettings();
  return <RecorderDetailContent state={state} />;
};

export default RecorderSettings;
