import { MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT, type MusicReactivitySpectrumFrame } from '@packages/audio-reactivity/types';
import { useEffect, useRef } from 'react';

const SMOOTHING = 0.78;
const DECAY_PER_FRAME = 0.04;
const PEAK_DECAY_PER_FRAME = 0.012;
const IDLE_TIMEOUT_MS = 600;

export function MusicSpectrumPage(): JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const smoothedRef = useRef<Float32Array>(new Float32Array(MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT));
    const peaksRef = useRef<Float32Array>(new Float32Array(MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT));
    const targetRef = useRef<Float32Array>(new Float32Array(MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT));
    const lastFrameAtRef = useRef<number>(0);
    const beatPulseRef = useRef<number>(0);

    useEffect(() => {
        const off = window.YUA.musicReactivity.onSpectrumFrame((frame: MusicReactivitySpectrumFrame) => {
            const target = targetRef.current;
            const count = Math.min(target.length, frame.bands.length);
            for (let i = 0; i < count; i += 1) {
                const value = Math.max(0, Math.min(1, frame.bands[i] ?? 0));
                target[i] = value;
            }
            lastFrameAtRef.current = Date.now();
            if (frame.beatTick) beatPulseRef.current = 1;
        });
        return off;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let rafId = 0;
        let running = true;

        const resize = (): void => {
            const dpr = window.devicePixelRatio || 1;
            const { clientWidth, clientHeight } = canvas;
            const targetW = Math.max(1, Math.floor(clientWidth * dpr));
            const targetH = Math.max(1, Math.floor(clientHeight * dpr));
            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
            }
        };

        const render = (): void => {
            if (!running) return;
            resize();
            const width = canvas.width;
            const height = canvas.height;
            const smoothed = smoothedRef.current;
            const peaks = peaksRef.current;
            const target = targetRef.current;
            const now = Date.now();
            const idle = now - lastFrameAtRef.current > IDLE_TIMEOUT_MS;

            for (let i = 0; i < smoothed.length; i += 1) {
                const goal = idle ? 0 : target[i];
                smoothed[i] = smoothed[i] * SMOOTHING + goal * (1 - SMOOTHING);
                if (smoothed[i] > peaks[i]) {
                    peaks[i] = smoothed[i];
                } else {
                    peaks[i] = Math.max(smoothed[i], peaks[i] - PEAK_DECAY_PER_FRAME);
                }
                if (idle) {
                    smoothed[i] = Math.max(0, smoothed[i] - DECAY_PER_FRAME);
                    peaks[i] = Math.max(0, peaks[i] - PEAK_DECAY_PER_FRAME);
                }
            }

            beatPulseRef.current = Math.max(0, beatPulseRef.current - 0.05);

            ctx.clearRect(0, 0, width, height);

            const count = smoothed.length;
            const gap = Math.max(2, Math.floor(width / (count * 6)));
            const barWidth = Math.max(2, Math.min(4 * (window.devicePixelRatio || 1), (width - gap * (count + 1)) / count));
            const totalContentWidth = barWidth * count + gap * (count - 1);
            const startX = (width - totalContentWidth) / 2;
            const baselineY = height * 0.96;
            const usableHeight = baselineY * 0.88;

            const glowAlpha = 0.12 + beatPulseRef.current * 0.25;
            const glow = ctx.createRadialGradient(width / 2, baselineY, 0, width / 2, baselineY, Math.max(width, height));
            glow.addColorStop(0, `rgba(120, 200, 255, ${glowAlpha})`);
            glow.addColorStop(1, 'rgba(120, 200, 255, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, width, height);

            for (let i = 0; i < count; i += 1) {
                const value = smoothed[i];
                const peak = peaks[i];
                const x = startX + i * (barWidth + gap);
                const barHeight = Math.max(2, value * usableHeight);
                const peakY = baselineY - peak * usableHeight;
                const topY = baselineY - barHeight;

                const grad = ctx.createLinearGradient(0, baselineY, 0, baselineY - usableHeight);
                grad.addColorStop(0, 'rgba(64, 132, 255, 0.95)');
                grad.addColorStop(0.55, 'rgba(124, 88, 255, 0.95)');
                grad.addColorStop(1, 'rgba(255, 96, 192, 0.95)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                const radius = Math.min(barWidth / 2, 2);
                roundRectPath(ctx, x, topY, barWidth, barHeight, radius);
                ctx.fill();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fillRect(x, peakY - 1, barWidth, 1);
            }

            rafId = requestAnimationFrame(render);
        };

        render();

        return () => {
            running = false;
            cancelAnimationFrame(rafId);
        };
    }, []);

    return (
        <div className="w-screen h-screen overflow-hidden select-none" style={{ background: 'transparent', WebkitAppRegion: 'drag' as never }}>
            <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
    );
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
}

export default MusicSpectrumPage;
