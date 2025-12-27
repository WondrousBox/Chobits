import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { WaveBar } from '../types';

// 波形高度系数，可在此处修改（范围：0-1，表示 canvas 高度的百分比）
const WAVE_HEIGHT_SCALE = 1.5;

// 波形移动速度，可在此处修改（值越小线条越密集，值越大线条越稀疏，建议范围：0.1-2）
const WAVE_MOVE_SPEED = 0.2;

// 波形线条宽度，可在此处修改（单位：像素，建议范围：0.5-3）
const WAVE_BAR_WIDTH = 0.6;

export interface WaveformRef {
  addBar: (level: number) => void;
  clear: () => void;
}

interface WaveformProps {
  isRecording: boolean;
}

export const Waveform = forwardRef<WaveformRef, WaveformProps>(({ isRecording }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const barsRef = useRef<WaveBar[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    addBar: (max: number) => {
      const canvas = canvasRef.current;
      if (canvas && isRecording) {
        const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
        const canvasHeight = canvas.height / (window.devicePixelRatio || 1);
        // 使用波形高度系数
        const maxHeight = canvasHeight * WAVE_HEIGHT_SCALE;
        const freq = Math.min(Math.floor(max * maxHeight), maxHeight);
        // 确保最小高度为 1，避免看不到
        const height = Math.max(freq, 1);
        barsRef.current.push({
          x: canvasWidth,
          y: canvasHeight / 2 - height / 2,
          height: height,
          width: WAVE_BAR_WIDTH
        });
      }
    },
    clear: () => {
      barsRef.current = [];
      if (ctxRef.current && canvasRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }));

  // 初始化 canvas 和绘制循环
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctxRef.current = ctx;

    // 设置 canvas 尺寸（考虑 devicePixelRatio）
    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    setupCanvas();

    // 绘制函数
    const draw = () => {
      if (!ctx || !canvas) return;

      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, width, height);

      for (let i = barsRef.current.length - 1; i >= 0; i--) {
        const bar = barsRef.current[i];
        ctx.fillStyle = 'hsl(var(--primary))';
        ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
        bar.x = bar.x - WAVE_MOVE_SPEED;

        if (bar.x < -bar.width) {
          barsRef.current.splice(i, 1);
        }
      }
    };

    // 绘制循环
    const loop = () => {
      if (isRecording) {
        draw();
        animationFrameIdRef.current = requestAnimationFrame(loop);
      }
    };

    if (isRecording) {
      barsRef.current = [];
      loop();
    } else {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    }

    // 监听窗口大小变化
    const handleResize = () => {
      setupCanvas();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isRecording]);

  return <canvas ref={canvasRef} className="h-8 w-full no-drag opacity-30" />;
});

Waveform.displayName = 'Waveform';
