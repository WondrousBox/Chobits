import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbPlayerStop, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import type { ProgressPayload } from '@/lib/web-recorder';
import { WebRecorder } from '@/lib/web-recorder';

const WebRecorderWindow: React.FC = () => {
  const [recorder, setRecorder] = useState<WebRecorder | null>(null);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformData = useRef<number[]>(new Array(56).fill(0));

  // Draw waveform
  const drawWaveform = useCallback((vol: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Add new volume value
    waveformData.current.push(vol);
    if (waveformData.current.length > 56) {
      waveformData.current.shift();
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform bars
    const barWidth = width / 56;
    const barGap = 1;

    waveformData.current.forEach((v, i) => {
      const barHeight = (v / 100) * height * 0.9;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      // Gradient color based on volume
      const hue = 200 + (v / 100) * 60;
      ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
      ctx.fillRect(x, y, barWidth - barGap, barHeight);
    });
  }, []);

  // Create recorder instance
  useEffect(() => {
    const newRecorder = new WebRecorder({ sampleRate: 16000 });

    newRecorder.onprogress = (payload: ProgressPayload) => {
      setDuration(payload.duration);
      setVolume(payload.vol);
      drawWaveform(payload.vol);
    };

    setRecorder(newRecorder);

    return () => {
      newRecorder.destroy();
    };
  }, [drawWaveform]);

  // Auto start recording when window opens
  useEffect(() => {
    const startRecording = async () => {
      if (recorder) {
        try {
          await recorder.start();
        } catch (error) {
          console.error('Failed to start recording:', error);
        }
      }
    };

    const timer = setTimeout(startRecording, 100);
    return () => clearTimeout(timer);
  }, [recorder]);

  const handleStop = async () => {
    if (!recorder) return;

    try {
      recorder.stop();

      // Get WAV blob
      const blob = recorder.getWAVBlob();

      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);

      // Close window after saving
      window.YUA.window['window:close']('webRecorder');
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const handleClose = () => {
    if (recorder) {
      recorder.stop();
    }
    window.YUA.window['window:close']('webRecorder');
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center h-full w-full bg-background/95 backdrop-blur-sm rounded-lg border shadow-lg overflow-hidden px-2 gap-1.5">
      {/* Recording indicator */}
      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />

      {/* Waveform */}
      <canvas ref={canvasRef} width={140} height={24} className="w-[140px] h-6 shrink-0" />

      {/* Duration */}
      <div className="text-xs font-mono font-medium text-muted-foreground w-9 text-center shrink-0">{formatDuration(duration)}</div>

      {/* Stop button */}
      <Button onClick={handleStop} size="sm" variant="destructive" className="h-6 w-6 p-0 shrink-0">
        <TbPlayerStop className="h-3.5 w-3.5" />
      </Button>

      {/* Close button */}
      <Button variant="ghost" size="icon" className="h-5 w-5 p-0 shrink-0 opacity-60 hover:opacity-100" onClick={handleClose}>
        <TbX className="h-3 w-3" />
      </Button>

      {/* Drag region spacer */}
      <div className="flex-1 drag-region cursor-move" />
    </div>
  );
};

export default WebRecorderWindow;
