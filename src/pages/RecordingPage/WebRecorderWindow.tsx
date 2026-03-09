import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbAlertCircle, TbMicrophone, TbPlayerRecord, TbPlayerStop, TbPlugConnected, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ProgressPayload } from '@/lib/web-recorder';
import { WebRecorder } from '@/lib/web-recorder';

interface AudioDevice {
  deviceId: string;
  label: string;
}

// Utility to draw waveform on canvas
function drawWaveformOnCanvas(canvas: HTMLCanvasElement | null, data: number[], barCount: number): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  const barWidth = width / barCount;
  const barGap = 1;

  data.forEach((v, i) => {
    const barHeight = (v / 100) * height * 0.8;
    const x = i * barWidth;
    const y = (height - barHeight) / 2;
    const hue = 150 + (v / 100) * 30;
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.fillRect(x, y, barWidth - barGap, barHeight);
  });
}

const WebRecorderWindow: React.FC = () => {
  // State
  const [recorder, setRecorder] = useState<WebRecorder | null>(null);
  const [duration, setDuration] = useState(0);
  const [previewVolume, setPreviewVolume] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isWaitingForDevice, setIsWaitingForDevice] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformDataRef = useRef<number[]>(new Array(56).fill(0));
  const previewWaveformDataRef = useRef<number[]>(new Array(28).fill(0));
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewAnalyserRef = useRef<AnalyserNode | null>(null);
  const previewAnimationIdRef = useRef<number | null>(null);
  const previewLoopFnRef = useRef<(() => void) | null>(null);

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
    return () => newRecorder.destroy();
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
        setSelectedDeviceId((prev) => prev || audioInputs[0].deviceId);
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

  // Initial device enumeration
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

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
      setPreviewVolume(vol);

      previewWaveformDataRef.current.push(vol);
      if (previewWaveformDataRef.current.length > 28) {
        previewWaveformDataRef.current.shift();
      }
      drawWaveformOnCanvas(previewCanvasRef.current, previewWaveformDataRef.current, 28);

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
      console.error('Preview error:', err);
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
    setPreviewVolume(0);
    previewWaveformDataRef.current = new Array(28).fill(0);
  }, []);

  // Handle device selection change
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

  // Start recording
  const handleStartRecording = async () => {
    if (!recorder || !selectedDeviceId) return;
    try {
      stopPreview();
      await recorder.start({ deviceId: selectedDeviceId });
      setIsRecording(true);
      setError(null);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') setError('麦克风权限被拒绝');
      else if (err.name === 'NotFoundError') setError('未检测到麦克风设备');
      else if (err.name === 'NotReadableError') setError('麦克风被其他程序占用');
      else setError(`无法启动录音: ${err.message || '未知错误'}`);
    }
  };

  // Stop recording and save
  const handleStop = async () => {
    if (!recorder) return;
    try {
      recorder.stop();
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
    if (recorder) recorder.stop();
    window.YUA.window['window:close']('webRecorder');
  };

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, '0')}:${Math.floor(s % 60)
        .toString()
        .padStart(2, '0')}`;

  // Error UI
  if (error && !isWaitingForDevice) {
    return (
      <div className="flex items-center h-full w-full bg-destructive/10 backdrop-blur-sm rounded-lg border border-destructive/30 shadow-lg overflow-hidden px-3 gap-2">
        <TbAlertCircle className="w-4 h-4 text-destructive shrink-0" />
        <div className="flex-1 text-xs text-destructive truncate">{error}</div>
        <Button variant="ghost" size="icon" className="h-5 w-5 p-0 shrink-0 opacity-60 hover:opacity-100" onClick={handleClose}>
          <TbX className="h-3 w-3" />
        </Button>
        <div className="flex-1 drag-region cursor-move" />
      </div>
    );
  }

  // Waiting for device UI
  if (isWaitingForDevice || devices.length === 0) {
    return (
      <div className="flex items-center h-full w-full bg-muted/50 backdrop-blur-sm rounded-lg border shadow-lg overflow-hidden px-3 gap-2">
        <TbPlugConnected className="w-4 h-4 text-muted-foreground shrink-0 animate-pulse" />
        <div className="flex-1 text-xs text-muted-foreground">请插入麦克风设备...</div>
        <Button variant="ghost" size="icon" className="h-5 w-5 p-0 shrink-0 opacity-60 hover:opacity-100" onClick={handleClose}>
          <TbX className="h-3 w-3" />
        </Button>
        <div className="flex-1 drag-region cursor-move" />
      </div>
    );
  }

  // Recording UI
  if (isRecording) {
    return (
      <div className="flex items-center h-full w-full bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg overflow-hidden px-2 gap-1.5">
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
    );
  }

  // Device selection + preview UI
  return (
    <div className="flex items-center h-full w-full bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg overflow-hidden px-2 gap-2">
      <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
        <SelectTrigger className="h-6 w-[120px] text-xs border-0 bg-muted/50">
          <TbMicrophone className="w-3 h-3 mr-1 shrink-0" />
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

      <div className="flex items-center gap-1">
        <canvas ref={previewCanvasRef} width={70} height={20} className="w-[70px] h-5 shrink-0" />
        <Progress value={previewVolume} className="w-8 h-1.5 shrink-0" />
      </div>

      <Button onClick={handleStartRecording} size="sm" className="h-6 w-6 p-0 shrink-0 bg-red-500 hover:bg-red-600">
        <TbPlayerRecord className="h-3.5 w-3.5" />
      </Button>

      <Button variant="ghost" size="icon" className="h-5 w-5 p-0 shrink-0 opacity-60 hover:opacity-100" onClick={handleClose}>
        <TbX className="h-3 w-3" />
      </Button>

      <div className="flex-1 drag-region cursor-move" />
    </div>
  );
};

export default WebRecorderWindow;
