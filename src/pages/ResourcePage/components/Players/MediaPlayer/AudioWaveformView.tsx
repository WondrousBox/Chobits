import { MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT, type MusicReactivitySpectrumFrame } from '@packages/audio-reactivity/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';

type WaveformData = {
  peaks: number[];
  duration: number;
};

interface AudioWaveformViewProps {
  waveformData?: WaveformData;
  spectrumFrame?: MusicReactivitySpectrumFrame | null;
  isLoading?: boolean;
  error?: string | null;
  currentTime: number;
  duration: number;
  title?: string;
  onSeek: (time: number) => void;
}

const SPECTRUM_SMOOTHING = 0.76;
const SPECTRUM_IDLE_TIMEOUT_MS = 650;
const SPECTRUM_DECAY_PER_FRAME = 0.035;
const SPECTRUM_PEAK_DECAY_PER_FRAME = 0.012;

function useElementSize<T extends HTMLElement>(): [React.RefObject<T>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const syncSize = (): void => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height))
      });
    };

    syncSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncSize);
      return () => window.removeEventListener('resize', syncSize);
    }

    const observer = new ResizeObserver(syncSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function rebuildCenteredValues(values: Float32Array): number[] {
  const source = Array.from(values);
  const half = Math.floor(source.length / 2);
  return source.slice().reverse().slice(half).concat(source.slice(0, half));
}

function getSideRatio(index: number, count: number): number {
  if (count <= 1) return 1;
  if (index <= count / 2) {
    return 1 - (count / 2 - 1 - index) / (count / 2);
  }
  return 1 - (index - count / 2) / (count / 2);
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

export const AudioWaveformView: React.FC<AudioWaveformViewProps> = ({ waveformData, spectrumFrame, isLoading = false, error = null, currentTime, duration, title, onSeek }) => {
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [spectrumWrapperRef, spectrumSize] = useElementSize<HTMLDivElement>();
  const [waveformWrapperRef, waveformSize] = useElementSize<HTMLDivElement>();
  const mouseDownPointRef = useRef<{ x: number; y: number } | null>(null);
  const spectrumTargetRef = useRef<Float32Array>(new Float32Array(MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT));
  const spectrumSmoothedRef = useRef<Float32Array>(new Float32Array(MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT));
  const spectrumPeaksRef = useRef<Float32Array>(new Float32Array(MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT));
  const spectrumLastFrameAtRef = useRef(0);

  useEffect(() => {
    if (!spectrumFrame) return;
    const target = spectrumTargetRef.current;
    const count = Math.min(target.length, spectrumFrame.bands.length);
    for (let i = 0; i < count; i++) {
      target[i] = Math.max(0, Math.min(1, spectrumFrame.bands[i] ?? 0));
    }
    for (let i = count; i < target.length; i++) {
      target[i] = 0;
    }
    spectrumLastFrameAtRef.current = Date.now();
  }, [spectrumFrame]);

  useEffect(() => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas || spectrumSize.width <= 0 || spectrumSize.height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frameId = 0;
    let running = true;

    const render = (): void => {
      if (!running) return;

      const dpr = window.devicePixelRatio || 1;
      const width = spectrumSize.width;
      const height = spectrumSize.height;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const target = spectrumTargetRef.current;
      const smoothed = spectrumSmoothedRef.current;
      const peaks = spectrumPeaksRef.current;
      const idle = Date.now() - spectrumLastFrameAtRef.current > SPECTRUM_IDLE_TIMEOUT_MS;

      for (let i = 0; i < smoothed.length; i++) {
        const goal = idle ? 0 : target[i];
        smoothed[i] = smoothed[i] * SPECTRUM_SMOOTHING + goal * (1 - SPECTRUM_SMOOTHING);
        if (smoothed[i] > peaks[i]) {
          peaks[i] = smoothed[i];
        } else {
          peaks[i] = Math.max(smoothed[i], peaks[i] - SPECTRUM_PEAK_DECAY_PER_FRAME);
        }
        if (idle) {
          smoothed[i] = Math.max(0, smoothed[i] - SPECTRUM_DECAY_PER_FRAME);
          peaks[i] = Math.max(0, peaks[i] - SPECTRUM_PEAK_DECAY_PER_FRAME);
        }
      }

      const values = rebuildCenteredValues(smoothed);
      const peakValues = rebuildCenteredValues(peaks);
      const count = values.length;
      const gap = Math.max(2, Math.min(8, width / (count * 4.4)));
      const barWidth = Math.max(2, (width - gap * (count - 1)) / count);
      const totalWidth = barWidth * count + gap * (count - 1);
      const startX = (width - totalWidth) / 2;
      const baselineY = height * 0.92;
      const usableHeight = height * 0.76;
      const gradient = ctx.createLinearGradient(0, baselineY, 0, baselineY - usableHeight);
      gradient.addColorStop(0, 'rgba(45, 212, 191, 0.94)');
      gradient.addColorStop(0.58, 'rgba(96, 165, 250, 0.94)');
      gradient.addColorStop(1, 'rgba(248, 113, 113, 0.94)');

      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(45, 212, 191, 0.35)';

      for (let i = 0; i < count; i++) {
        const sideRatio = Math.max(0.12, getSideRatio(i, count));
        const barHeight = Math.max(2, values[i] * usableHeight * sideRatio);
        const peakHeight = peakValues[i] * usableHeight * sideRatio;
        const x = startX + i * (barWidth + gap);
        const topY = baselineY - barHeight;
        const peakY = baselineY - peakHeight;

        ctx.globalAlpha = sideRatio;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        roundedRectPath(ctx, x, topY, barWidth, barHeight, Math.min(3, barWidth / 2));
        ctx.fill();

        ctx.globalAlpha = Math.min(0.86, sideRatio + 0.16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
        ctx.fillRect(x, peakY - 1, barWidth, 1);
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      frameId = requestAnimationFrame(render);
    };

    render();
    return () => {
      running = false;
      cancelAnimationFrame(frameId);
    };
  }, [spectrumSize.height, spectrumSize.width]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformData?.peaks?.length || waveformSize.width <= 0 || waveformSize.height <= 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = waveformSize.width;
    const height = waveformSize.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const peaks = waveformData.peaks;
    const audioDuration = waveformData.duration > 0 ? waveformData.duration : duration;
    const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
    const centerY = height / 2;
    const maxAmplitude = height * 0.38;
    const barWidth = width >= 900 ? 2 : 1.5;
    const barGap = width >= 900 ? 2 : 1.5;
    const step = barWidth + barGap;
    const barsCount = Math.max(1, Math.floor(width / step));
    const timePerBar = audioDuration > 0 ? audioDuration / barsCount : 0;
    const peakDuration = audioDuration > 0 ? audioDuration / peaks.length : 0;

    const drawBar = (x: number, y: number, barHeight: number, color: string): void => {
      ctx.fillStyle = color;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, Math.min(barWidth, 2));
        ctx.fill();
        return;
      }
      ctx.fillRect(x, y, barWidth, barHeight);
    };

    for (let i = 0; i < barsCount; i++) {
      const barStartTime = i * timePerBar;
      const barEndTime = barStartTime + timePerBar;
      const startPeakIndex = peakDuration > 0 ? Math.floor(barStartTime / peakDuration) : Math.floor((i / barsCount) * peaks.length);
      const endPeakIndex = peakDuration > 0 ? Math.ceil(barEndTime / peakDuration) : Math.ceil(((i + 1) / barsCount) * peaks.length);

      let maxPeak = 0;
      let sumPeak = 0;
      let count = 0;
      for (let peakIndex = Math.max(0, startPeakIndex); peakIndex <= Math.min(peaks.length - 1, endPeakIndex); peakIndex++) {
        const peak = Math.min(1, Math.max(0, peaks[peakIndex] || 0));
        maxPeak = Math.max(maxPeak, peak);
        sumPeak += peak;
        count++;
      }

      const avgPeak = count > 0 ? sumPeak / count : 0;
      const displayPeak = maxPeak * 0.75 + avgPeak * 0.25;
      const barHeight = Math.max(2, displayPeak * maxAmplitude * 2);
      const x = i * step;
      const y = centerY - barHeight / 2;
      const isPlayed = x / width <= progressRatio;
      drawBar(x, y, barHeight, isPlayed ? 'rgba(45, 212, 191, 0.95)' : 'rgba(148, 163, 184, 0.32)');
    }

    const progressX = progressRatio * width;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(progressX, 4);
    ctx.lineTo(progressX, height - 4);
    ctx.stroke();
  }, [currentTime, duration, waveformData, waveformSize.height, waveformSize.width]);

  const seekFromEvent = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = waveformCanvasRef.current;
      if (!canvas || duration <= 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
      onSeek((x / rect.width) * duration);
    },
    [duration, onSeek]
  );

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    mouseDownPointRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleMouseUp = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const startPoint = mouseDownPointRef.current;
      mouseDownPointRef.current = null;
      if (!startPoint) return;
      if (Math.abs(event.clientX - startPoint.x) > 3 || Math.abs(event.clientY - startPoint.y) > 3) return;
      seekFromEvent(event);
    },
    [seekFromEvent]
  );

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <div className="absolute left-5 right-5 top-5 z-10 flex items-center justify-between gap-4 text-white/70">
        <div className="truncate text-xs font-medium tracking-wide">{title || '音频预览'}</div>
        <div className="text-[11px] tabular-nums">
          {duration > 0
            ? `${Math.floor(currentTime / 60)}:${Math.floor(currentTime % 60)
                .toString()
                .padStart(2, '0')}`
            : '--:--'}
        </div>
      </div>

      <div className="absolute inset-x-5 bottom-20 top-12 flex min-h-0 flex-col gap-2">
        <div ref={spectrumWrapperRef} className="relative min-h-0 flex-1">
          <canvas ref={spectrumCanvasRef} className="block h-full w-full" />
        </div>

        <div
          ref={waveformWrapperRef}
          className="relative h-[clamp(30px,18%,58px)] shrink-0 overflow-hidden border-t border-white/10 bg-white/[0.03]"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <canvas ref={waveformCanvasRef} className="block h-full w-full cursor-pointer" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} />
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/25 text-xs text-white/70">正在生成波形...</div>}
          {error && !isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/25 px-6 text-center text-xs text-white/65">波形加载失败</div>}
          {!isLoading && !error && !waveformData?.peaks?.length && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 px-6 text-center text-xs text-white/55">暂无波形数据</div>
          )}
        </div>
      </div>
    </div>
  );
};
