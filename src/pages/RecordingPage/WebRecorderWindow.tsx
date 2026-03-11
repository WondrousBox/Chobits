import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbAlertCircle, TbCheck, TbEar, TbPlayerStop, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProgressPayload } from '@/lib/web-recorder';
import { WebRecorder } from '@/lib/web-recorder';

interface AudioDevice {
  deviceId: string;
  label: string;
}

// Utility to draw waveform on canvas (for recording - flowing waveform)
function drawWaveformOnCanvas(canvas: HTMLCanvasElement | null, data: number[], barCount: number): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const barWidth = width / barCount;
  const barGap = Math.max(0.5, barWidth * 0.1); // 10% gap, minimum 0.5px

  data.forEach((v, i) => {
    const barHeight = (v / 100) * height * 0.8;
    const x = i * barWidth;
    const y = (height - barHeight) / 2;
    const hue = 150 + (v / 100) * 30;
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.fillRect(x, y, barWidth - barGap, barHeight);
  });
}

// Utility to draw volume level on canvas (for preview - vertical amplitude indicator)
function drawVolumeOnCanvas(canvas: HTMLCanvasElement | null, volume: number): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const size = canvas.width; // Square canvas
  const padding = 4;
  const barWidth = size - padding * 2;
  const barHeight = size - padding * 2;

  ctx.clearRect(0, 0, size, size);

  // Get ring color from CSS variable
  const ringColor = getComputedStyle(document.documentElement).getPropertyValue('--ring').trim();
  const borderColor = ringColor ? `hsl(${ringColor})` : 'hsl(0, 0%, 70%)';

  // Draw border (using ring color)
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(padding + 0.5, padding + 0.5, barWidth - 1, barHeight - 1, 4);
  ctx.stroke();

  // Draw volume level (from bottom to top)
  const volumeHeight = (volume / 100) * (barHeight - 4);

  if (volumeHeight > 0) {
    // Get primary color from CSS variable
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    ctx.fillStyle = primaryColor ? `hsl(${primaryColor})` : 'hsl(0, 0%, 50%)';
    ctx.beginPath();
    ctx.roundRect(padding + 2, padding + barHeight - 2 - volumeHeight, barWidth - 4, volumeHeight, 2);
    ctx.fill();
  }
}

// 窗口尺寸常量
const BASE_WIDTH = 280;
const BASE_HEIGHT = 48;
const ASR_HEIGHT = 120; // ASR 活跃时的高度

const WebRecorderWindow: React.FC = () => {
  // State
  const [recorder, setRecorder] = useState<WebRecorder | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [savedDeviceId, setSavedDeviceId] = useState<string | null>(null);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWaitingForDevice, setIsWaitingForDevice] = useState(false);

  // ASR 相关状态
  const [asrActive, setAsrActive] = useState(false);
  const [recognizedTexts, setRecognizedTexts] = useState<string[]>([]); // 已确认的文本片段
  const [progressText, setProgressText] = useState(''); // 实时中间结果
  const textContainerRef = useRef<HTMLDivElement>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformDataRef = useRef<number[]>(new Array(56).fill(0));
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewAnalyserRef = useRef<AnalyserNode | null>(null);
  const previewAnimationIdRef = useRef<number | null>(null);
  const previewLoopFnRef = useRef<(() => void) | null>(null);
  const savedDeviceIdRef = useRef<string | null>(null);
  const saveDeviceSelectionAndRecordRef = useRef<((deviceId: string) => Promise<void>) | null>(null);

  // 检测 ASR 服务状态
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const status = await window.YUA.sherpa.getStatus();
        if (mounted) setAsrActive(status.running);
      } catch {
        // ASR 不可用，保持纯录制模式
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 动态调整窗口大小
  useEffect(() => {
    const targetHeight = asrActive ? ASR_HEIGHT : BASE_HEIGHT;
    window.YUA.window['window:size:set']('webRecorder', BASE_WIDTH, targetHeight).catch(() => { });
  }, [asrActive]);

  // Initialize recorder once
  useEffect(() => {
    const newRecorder = new WebRecorder({ sampleRate: 16000 });
    newRecorder.onprogress = (payload: ProgressPayload) => {
      setDuration(payload.duration);
      // Update waveform data
      waveformDataRef.current.push(payload.vol);
      if (waveformDataRef.current.length > 56) {
        waveformDataRef.current.shift();
      }
      drawWaveformOnCanvas(canvasRef.current, waveformDataRef.current, 56);
    };
    setRecorder(newRecorder);
    return () => {
      newRecorder.destroy();
    };
  }, []);

  // Load saved device ID from preferences
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await window.YUA.preferences['preferences:getWebRecorderDeviceId']();
        if (mounted && result.ok && result.deviceId) {
          savedDeviceIdRef.current = result.deviceId;
          setSavedDeviceId(result.deviceId);
        }
      } catch (err) {
        console.error('Failed to load saved device ID:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Enumerate devices
  const enumerateDevices = useCallback(async () => {
    try {
      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('mediaDevices API not available');
        setError('浏览器不支持媒体设备访问');
        return;
      }

      // Request permission first
      console.log('Requesting microphone permission...');
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone permission granted');
      tempStream.getTracks().forEach((t) => t.stop());

      const deviceList = await navigator.mediaDevices.enumerateDevices();
      console.log('Enumerated devices:', deviceList);

      const audioInputs = deviceList.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label || `麦克风 ${d.deviceId.slice(0, 5)}` }));

      console.log('Audio input devices:', audioInputs);

      setDevices(audioInputs);
      setError(null);

      if (audioInputs.length === 0) {
        setIsWaitingForDevice(true);
      } else {
        setIsWaitingForDevice(false);
        // Check if saved device exists in the list using ref for latest value
        const savedId = savedDeviceIdRef.current;
        const deviceExists = savedId && audioInputs.some((d) => d.deviceId === savedId);
        if (deviceExists) {
          // Saved device found, start recording directly
          setSelectedDeviceId(savedId!);
          // Start recording immediately with saved device (use ref to avoid circular dependency)
          saveDeviceSelectionAndRecordRef.current?.(savedId!);
        } else {
          // No saved device or device not found, show selector
          setSelectedDeviceId(audioInputs[0].deviceId);
          // Start preview for device selector
          setShowDeviceSelector(true);
        }
      }
    } catch (err: any) {
      console.error('enumerateDevices error:', err);
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('麦克风权限被拒绝，请在系统设置中允许访问');
        setIsWaitingForDevice(false);
      } else if (err.name === 'NotFoundError') {
        // 没有找到麦克风设备，设置等待状态而不是错误
        setIsWaitingForDevice(true);
        setError(null);
        setDevices([]);
      } else if (err.name === 'NotReadableError') {
        setError('麦克风被其他程序占用');
        setIsWaitingForDevice(false);
      } else if (err.name === 'OverconstrainedError') {
        setError('不满足麦克风约束条件');
        setIsWaitingForDevice(false);
      } else if (err.name === 'SecurityError') {
        setError('安全限制：无法访问麦克风');
        setIsWaitingForDevice(false);
      } else if (err.name === 'TypeError') {
        setError('媒体设备 API 不可用');
        setIsWaitingForDevice(false);
      } else {
        setError(`无法获取麦克风列表: ${err.message || err.name || '未知错误'}`);
        setIsWaitingForDevice(false);
      }
    }
  }, []);

  // Initial device enumeration (wait for preferences to load)
  useEffect(() => {
    if (!isLoading) {
      enumerateDevices();
    }
  }, [isLoading, enumerateDevices]);

  // Listen for device changes
  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', enumerateDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateDevices);
  }, [enumerateDevices]);

  // Preview animation loop - store in ref to avoid circular dependency
  useEffect(() => {
    previewLoopFnRef.current = () => {
      const analyser = previewAnalyserRef.current;
      if (!analyser) return;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const vol = Math.min(100, (avg / 128) * 100);

      // Draw volume indicator for device selector
      drawVolumeOnCanvas(previewCanvasRef.current, vol);

      previewAnimationIdRef.current = requestAnimationFrame(() => previewLoopFnRef.current?.());
    };
  }, []);

  // Start preview
  const startPreview = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedDeviceId } }
      });
      previewStreamRef.current = stream;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      previewAnalyserRef.current = analyser;

      previewLoopFnRef.current?.();
    } catch (err) {
      console.error('[WebRecorder] Preview error:', err);
    }
  }, [selectedDeviceId]);

  // Stop preview
  const stopPreview = useCallback(() => {
    if (previewAnimationIdRef.current) {
      cancelAnimationFrame(previewAnimationIdRef.current);
      previewAnimationIdRef.current = null;
    }
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
    }
    previewAnalyserRef.current = null;
  }, []);

  // Handle device selection change - start preview when device is selected
  useEffect(() => {
    if (selectedDeviceId && !isRecording) {
      stopPreview();
      startPreview();
    }
  }, [selectedDeviceId, isRecording, startPreview, stopPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPreview();
  }, [stopPreview]);

  // 监听 ASR 识别结果
  useEffect(() => {
    if (!asrActive) return;

    const handleASRMessage = (_event: any, d: { type: string; data: any }): void => {
      if (d.type !== 'sherpa:message') return;
      const data = d.data;
      if (!data.text) return;

      if (data.isEndpoint) {
        // 最终结果：添加到已识别列表
        setRecognizedTexts((prev) => [...prev, data.text]);
        setProgressText('');
      } else {
        // 实时中间结果
        setProgressText(data.text);
      }
    };

    window.YUA.handleMessage(handleASRMessage, 'webRecorder:sherpa:message');
    return () => {
      window.YUA.removeHandler('webRecorder:sherpa:message');
    };
  }, [asrActive]);

  // 自动滚动到最新文本
  useEffect(() => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = textContainerRef.current.scrollHeight;
    }
  }, [recognizedTexts, progressText]);

  // Save device selection and start recording immediately
  const saveDeviceSelectionAndRecord = useCallback(
    async (deviceId: string) => {
      if (!recorder) return;
      try {
        // Save device selection
        await window.YUA.preferences['preferences:setWebRecorderDeviceId']({ deviceId });
        savedDeviceIdRef.current = deviceId;
        setSavedDeviceId(deviceId);

        // Stop preview and start recording immediately
        stopPreview();

        // 如果 ASR 活跃，注册 onFloat32Data 回调发送数据到 sherpa
        if (asrActive) {
          recorder.onFloat32Data = (payload) => {
            window.YUA.sherpa
              .sendData({
                uuid: 'stream',
                data: payload.data,
                save: false
              })
              .catch((err) => {
                console.error('[WebRecorder] 发送音频到 ASR 失败:', err);
              });
          };
          setRecognizedTexts([]);
          setProgressText('');
        }

        await recorder.start();
        setIsRecording(true);
        setError(null);
      } catch (err: any) {
        if (err.name === 'NotAllowedError') setError('麦克风权限被拒绝');
        else if (err.name === 'NotFoundError') setError('未检测到麦克风设备');
        else if (err.name === 'NotReadableError') setError('麦克风被其他程序占用');
        else setError(`无法启动录音: ${err.message || '未知错误'}`);
      }
    },
    [recorder, asrActive, stopPreview]
  );

  // Keep ref updated
  useEffect(() => {
    saveDeviceSelectionAndRecordRef.current = saveDeviceSelectionAndRecord;
  }, [saveDeviceSelectionAndRecord]);

  // Stop recording and save
  const handleStop = async () => {
    if (!recorder) return;
    try {
      recorder.stop();
      // 清理 onFloat32Data 回调
      recorder.onFloat32Data = null;
      const blob = recorder.getWAVBlob();
      const arrayBuffer = await blob.arrayBuffer();
      const result = await window.YUA.resource['resource:saveAudioRecording']({
        data: arrayBuffer,
        title: '录音'
      });
      if (result.success) {
        console.log('Recording saved:', result.data);
      } else {
        console.error('Save failed:', result.error);
      }
      window.YUA.window['window:close']('webRecorder');
    } catch (err) {
      console.error('Stop error:', err);
    }
  };

  // Close window
  const handleClose = () => {
    stopPreview();
    if (recorder) {
      recorder.onFloat32Data = null;
      recorder.stop();
    }
    window.YUA.window['window:close']('webRecorder');
  };

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(s % 60)
        .toString()
        .padStart(2, '0')}`;

  // ASR 文本显示组件
  const asrTextPanel = asrActive ? (
    <div ref={textContainerRef} className="flex-1 min-h-0 overflow-y-auto px-2 py-1 border-t border-border/30">
      {recognizedTexts.length === 0 && !progressText ? (
        <div className="flex items-center gap-1 h-full">
          <TbEar className="w-3 h-3 text-muted-foreground/50 shrink-0" />
          <span className="text-[10px] text-muted-foreground/50">{isRecording ? '正在识别...' : '语音识别已就绪'}</span>
        </div>
      ) : (
        <p className="text-[10px] leading-[14px] text-foreground/80 break-all">
          {recognizedTexts.join('')}
          {progressText && <span className="text-primary/60">{progressText}</span>}
        </p>
      )}
    </div>
  ) : null;

  // Error UI
  if (error && !isWaitingForDevice) {
    return (
      <div className="flex flex-col h-full w-full bg-destructive/10 backdrop-blur-sm rounded-lg border border-destructive/30 shadow-lg overflow-hidden">
        <div className="flex items-center h-12 shrink-0 px-3 gap-2">
          <TbAlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <div className="flex-1 text-xs text-destructive truncate">{error}</div>
          <Button variant="ghost" size="icon" className="h-5 w-5 p-0 shrink-0 opacity-60 hover:opacity-100" onClick={handleClose}>
            <TbX className="h-3 w-3" />
          </Button>
          <div className="flex-1 drag-region cursor-move" />
        </div>
        {asrTextPanel}
      </div>
    );
  }

  // Waiting for device UI
  if (isWaitingForDevice || devices.length === 0) {
    return (
      <div className="flex items-center justify-center drag-region px-2 box-border h-full w-full bg-background rounded-lg overflow-hidden">
        <div className="text-xs text-muted-foreground flex-1">请插入麦克风设备...</div>
        <Button variant="ghost" size="icon" className="shrink-0 no-drag" onClick={handleClose}>
          <TbX />
        </Button>
      </div>
    );
  }

  // Loading UI
  if (isLoading) {
    return (
      <div className="flex items-center justify-center drag-region px-2 box-border h-full w-full bg-background rounded-lg overflow-hidden">
        <div className="text-xs text-muted-foreground flex-1">加载中...</div>
        <Button variant="ghost" size="icon" className="shrink-0 no-drag" onClick={handleClose}>
          <TbX />
        </Button>
      </div>
    );
  }

  // Recording UI
  if (isRecording) {
    return (
      <div className="flex flex-col h-full w-full bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg overflow-hidden">
        <div className="flex items-center h-12 shrink-0 px-2 gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <canvas ref={canvasRef} width={140} height={24} className="w-[140px] h-6 shrink-0" />
          <div className="text-xs font-mono font-medium text-muted-foreground w-9 text-center shrink-0">{formatDuration(duration)}</div>
          <Button onClick={handleStop} size="sm" variant="destructive" className="h-6 w-6 p-0 shrink-0">
            <TbPlayerStop className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5 p-0 shrink-0 opacity-60 hover:opacity-100" onClick={handleClose}>
            <TbX className="h-3 w-3" />
          </Button>
          <div className="flex-1 drag-region cursor-move" />
        </div>
        {asrTextPanel}
      </div>
    );
  }

  // Device selection UI (first time or device not found)
  if (showDeviceSelector) {
    return (
      <div className="flex flex-col drag-region h-full w-full bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg overflow-hidden">
        <div className="flex items-center h-12 shrink-0 px-2 gap-1">
          <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
            <SelectTrigger className="h-6 w-6 flex-1 text-xs no-drag">
              <SelectValue placeholder="选择设备" />
            </SelectTrigger>
            <SelectContent>
              {devices.map((d) => (
                <SelectItem key={d.deviceId} value={d.deviceId} className="text-xs">
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <canvas ref={previewCanvasRef} width={32} height={32} className="w-8 h-8 shrink-0" />

          <Button className="no-drag shrink-0" onClick={() => saveDeviceSelectionAndRecord(selectedDeviceId)} variant="ghost" size="icon">
            <TbCheck />
          </Button>

          <Button variant="ghost" size="icon" className="no-drag shrink-0" onClick={handleClose}>
            <TbX />
          </Button>
        </div>
        {asrTextPanel}
      </div>
    );
  }

  // This should never be reached - if saved device exists, recording starts immediately
  return null;
};

export default WebRecorderWindow;
