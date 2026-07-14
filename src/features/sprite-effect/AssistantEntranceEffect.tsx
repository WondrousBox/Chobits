import { getAssistantEntranceFrame } from '@packages/sprite-core/assistant-entrance';
import type { AssistantEntranceRun } from '@packages/sprite-core/types';
import { useEffect, useRef, useState } from 'react';

import { createAssistantEntranceParticles, sampleAssistantEntranceParticle } from './assistant-entrance-particles';

const PARTICLE_COLORS = ['rgba(245, 252, 255, 1)', 'rgba(60, 220, 255, 1)', 'rgba(80, 255, 210, 1)'] as const;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function drawBaseGlow(context: CanvasRenderingContext2D, run: AssistantEntranceRun, elapsedMs: number): void {
  const alpha = clamp(1 - elapsedMs / (run.reducedMotion ? 260 : 720));
  if (alpha <= 0) return;

  const centerX = run.characterRect.x + run.characterRect.width / 2;
  const centerY = run.characterRect.y + run.characterRect.height;
  const radiusX = run.characterRect.width * 0.46;
  const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radiusX);
  gradient.addColorStop(0, `rgba(245, 252, 255, ${0.34 * alpha})`);
  gradient.addColorStop(0.34, `rgba(60, 220, 255, ${0.22 * alpha})`);
  gradient.addColorStop(1, 'rgba(60, 220, 255, 0)');

  context.save();
  context.translate(centerX, centerY);
  context.scale(1, 0.18);
  context.translate(-centerX, -centerY);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(centerX, centerY, radiusX, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawScanBeam(context: CanvasRenderingContext2D, run: AssistantEntranceRun, elapsedMs: number, scanY: number): void {
  const relativeMs = elapsedMs - run.scanStartMs;
  const beamAlpha = clamp(relativeMs / 80) * clamp((run.scanDurationMs + 180 - relativeMs) / 180);
  if (beamAlpha <= 0) return;

  const left = run.characterRect.x - 16;
  const right = run.characterRect.x + run.characterRect.width + 16;
  const haloHeight = run.reducedMotion ? 10 : 27;
  const verticalGradient = context.createLinearGradient(0, scanY - haloHeight, 0, scanY + haloHeight);
  verticalGradient.addColorStop(0, 'rgba(60, 220, 255, 0)');
  verticalGradient.addColorStop(0.5, `rgba(60, 220, 255, ${0.2 * beamAlpha})`);
  verticalGradient.addColorStop(1, 'rgba(60, 220, 255, 0)');
  context.fillStyle = verticalGradient;
  context.fillRect(left, scanY - haloHeight, right - left, haloHeight * 2);

  const horizontalGradient = context.createLinearGradient(left, 0, right, 0);
  horizontalGradient.addColorStop(0, 'rgba(60, 220, 255, 0)');
  horizontalGradient.addColorStop(0.16, `rgba(80, 255, 210, ${0.55 * beamAlpha})`);
  horizontalGradient.addColorStop(0.5, `rgba(245, 252, 255, ${beamAlpha})`);
  horizontalGradient.addColorStop(0.84, `rgba(60, 220, 255, ${0.55 * beamAlpha})`);
  horizontalGradient.addColorStop(1, 'rgba(60, 220, 255, 0)');

  context.save();
  context.strokeStyle = horizontalGradient;
  context.lineWidth = run.reducedMotion ? 1 : 1.5;
  context.shadowColor = 'rgba(60, 220, 255, 0.95)';
  context.shadowBlur = run.reducedMotion ? 6 : 14;
  context.beginPath();
  context.moveTo(left, scanY);
  context.lineTo(right, scanY);
  context.stroke();
  context.restore();
}

function drawTopFlash(context: CanvasRenderingContext2D, run: AssistantEntranceRun, elapsedMs: number): void {
  if (run.reducedMotion) return;
  const flashStartMs = run.scanStartMs + run.scanDurationMs - 40;
  const progress = (elapsedMs - flashStartMs) / 260;
  if (progress < 0 || progress > 1) return;

  const centerX = run.characterRect.x + run.characterRect.width / 2;
  const centerY = run.characterRect.y;
  const alpha = Math.sin(progress * Math.PI) * 0.8;
  const radius = 8 + progress * run.characterRect.width * 0.38;
  context.save();
  context.strokeStyle = `rgba(255, 220, 120, ${alpha})`;
  context.lineWidth = 1.2;
  context.shadowColor = 'rgba(245, 252, 255, 0.9)';
  context.shadowBlur = 16;
  context.beginPath();
  context.ellipse(centerX, centerY, radius, radius * 0.18, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawParticles(context: CanvasRenderingContext2D, run: AssistantEntranceRun, particles: ReturnType<typeof createAssistantEntranceParticles>, elapsedMs: number): void {
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (const particle of particles) {
    const sample = sampleAssistantEntranceParticle(particle, elapsedMs);
    if (!sample || sample.opacity <= 0) continue;

    const color = PARTICLE_COLORS[particle.colorIndex];
    context.globalAlpha = sample.opacity * (run.reducedMotion ? 0.55 : 0.9);
    context.fillStyle = color;
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = particle.kind === 'streak' ? 8 : 6;
    if (particle.kind === 'streak') {
      context.lineWidth = particle.size;
      context.beginPath();
      context.moveTo(sample.x, sample.y);
      context.lineTo(sample.x - particle.velocityX * sample.stretch * 20, sample.y - particle.velocityY * sample.stretch * 20);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(sample.x, sample.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

export default function AssistantEntranceEffect(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [run, setRun] = useState<AssistantEntranceRun | null>(null);

  useEffect(() => {
    const unsubscribe = window.YUA.sprite.onEntranceStart((nextRun) => {
      setRun(nextRun);
    });
    void window.YUA.sprite.effectEntranceReady().catch(() => undefined);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !run) return;

    const context = canvas.getContext('2d');
    if (!context) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.ceil(run.surface.width * dpr);
    canvas.height = Math.ceil(run.surface.height * dpr);
    canvas.style.width = `${run.surface.width}px`;
    canvas.style.height = `${run.surface.height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const particles = createAssistantEntranceParticles(run);
    let animationFrameId = 0;
    let disposed = false;

    const render = (): void => {
      if (disposed) return;
      const frame = getAssistantEntranceFrame(run, Date.now());
      context.clearRect(0, 0, run.surface.width, run.surface.height);
      if (frame.elapsedMs >= 0) {
        context.save();
        context.globalCompositeOperation = 'lighter';
        drawBaseGlow(context, run, frame.elapsedMs);
        drawScanBeam(context, run, frame.elapsedMs, frame.scanY);
        drawParticles(context, run, particles, frame.elapsedMs);
        drawTopFlash(context, run, frame.elapsedMs);
        context.restore();
      }

      if (!frame.complete) {
        animationFrameId = requestAnimationFrame(render);
      } else {
        context.clearRect(0, 0, run.surface.width, run.surface.height);
      }
    };

    animationFrameId = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      context.clearRect(0, 0, run.surface.width, run.surface.height);
    };
  }, [run]);

  return <canvas ref={canvasRef} className="fixed left-0 top-0 pointer-events-none bg-transparent" aria-hidden="true" />;
}
