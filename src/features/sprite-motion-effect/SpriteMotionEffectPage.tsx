import { getSpriteMotionEffectFrame, getSpriteMotionEffectLocalPoint, getSpriteMotionEffectPoint } from '@packages/sprite-core/sprite-motion-effect';
import type { SpriteMotionEffectRun } from '@packages/sprite-core/types';
import { useEffect, useRef, useState } from 'react';

import { createSpriteMotionParticles, sampleSpriteMotionParticle, type SpriteMotionParticle } from './motion-effect-particles';

const PARTICLE_COLORS = ['rgba(248, 253, 255, 1)', 'rgba(47, 225, 255, 1)', 'rgba(91, 255, 187, 1)'] as const;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function drawLightTrail(context: CanvasRenderingContext2D, run: SpriteMotionEffectRun, travelProgress: number): void {
  if (travelProgress <= 0) return;
  const sampleCount = run.reducedMotion ? 8 : 38;
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.lineCap = 'round';
  context.shadowColor = 'rgba(47, 225, 255, 0.9)';
  context.shadowBlur = run.reducedMotion ? 8 : 20;

  for (let index = sampleCount; index > 0; index -= 1) {
    const headOffset = (index - 1) / sampleCount;
    const tailOffset = index / sampleCount;
    const headProgress = Math.max(0, travelProgress - headOffset * 0.42);
    const tailProgress = Math.max(0, travelProgress - tailOffset * 0.42);
    if (headProgress <= 0 && tailProgress <= 0) continue;
    const head = getSpriteMotionEffectLocalPoint(run, getSpriteMotionEffectPoint(run.path, headProgress));
    const tail = getSpriteMotionEffectLocalPoint(run, getSpriteMotionEffectPoint(run.path, tailProgress));
    const strength = Math.pow(1 - headOffset, 1.8);
    context.strokeStyle = `rgba(${index % 3 === 0 ? '91, 255, 187' : '47, 225, 255'}, ${0.72 * strength})`;
    context.lineWidth = 1.5 + strength * (run.reducedMotion ? 4 : 13);
    context.beginPath();
    context.moveTo(tail.x, tail.y);
    context.lineTo(head.x, head.y);
    context.stroke();
  }
  context.restore();
}

function drawLightCore(context: CanvasRenderingContext2D, run: SpriteMotionEffectRun, travelProgress: number): void {
  if (travelProgress <= 0 || travelProgress >= 1) return;
  const head = getSpriteMotionEffectLocalPoint(run, getSpriteMotionEffectPoint(run.path, travelProgress));
  const previous = getSpriteMotionEffectLocalPoint(run, getSpriteMotionEffectPoint(run.path, Math.max(0, travelProgress - 0.015)));
  const angle = Math.atan2(head.y - previous.y, head.x - previous.x);
  const radius = run.reducedMotion ? 24 : 54;
  const gradient = context.createRadialGradient(head.x, head.y, 0, head.x, head.y, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.13, 'rgba(180, 250, 255, 0.98)');
  gradient.addColorStop(0.42, 'rgba(47, 225, 255, 0.54)');
  gradient.addColorStop(1, 'rgba(47, 225, 255, 0)');

  context.save();
  context.globalCompositeOperation = 'lighter';
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(head.x, head.y, radius, 0, Math.PI * 2);
  context.fill();
  context.translate(head.x, head.y);
  context.rotate(angle);
  context.strokeStyle = 'rgba(245, 254, 255, 0.94)';
  context.lineWidth = run.reducedMotion ? 2 : 4;
  context.shadowColor = 'rgba(47, 225, 255, 1)';
  context.shadowBlur = 18;
  context.beginPath();
  context.moveTo(run.reducedMotion ? -26 : -58, 0);
  context.lineTo(run.reducedMotion ? 16 : 28, 0);
  context.stroke();
  context.restore();
}

function drawBurst(context: CanvasRenderingContext2D, run: SpriteMotionEffectRun, center: { x: number; y: number }, progress: number, arrival: boolean): void {
  if (progress <= 0 || progress >= 1) return;
  const pulse = Math.sin(progress * Math.PI);
  const radius = 16 + progress * (run.reducedMotion ? 42 : arrival ? 130 : 95);
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.strokeStyle = `rgba(${arrival ? '248, 253, 255' : '47, 225, 255'}, ${pulse * 0.78})`;
  context.lineWidth = 1 + (1 - progress) * 3;
  context.shadowColor = arrival ? 'rgba(91, 255, 187, 0.95)' : 'rgba(47, 225, 255, 0.95)';
  context.shadowBlur = run.reducedMotion ? 8 : 22;
  context.beginPath();
  context.ellipse(center.x, center.y, radius, radius * 0.36, 0, 0, Math.PI * 2);
  context.stroke();

  const glow = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius * 0.9);
  glow.addColorStop(0, `rgba(245, 254, 255, ${pulse * (arrival ? 0.48 : 0.25)})`);
  glow.addColorStop(0.35, `rgba(47, 225, 255, ${pulse * 0.18})`);
  glow.addColorStop(1, 'rgba(47, 225, 255, 0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawParticles(context: CanvasRenderingContext2D, run: SpriteMotionEffectRun, particles: SpriteMotionParticle[], elapsedMs: number): void {
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (const particle of particles) {
    const sample = sampleSpriteMotionParticle(particle, elapsedMs);
    if (!sample || sample.opacity <= 0) continue;
    const local = getSpriteMotionEffectLocalPoint(run, sample);
    const color = PARTICLE_COLORS[particle.colorIndex];
    context.globalAlpha = sample.opacity * (run.reducedMotion ? 0.55 : 0.9);
    context.fillStyle = color;
    context.strokeStyle = color;
    context.shadowColor = color;
    context.shadowBlur = particle.kind === 'streak' ? 10 : 7;
    if (particle.kind === 'streak') {
      context.lineWidth = particle.size;
      context.beginPath();
      context.moveTo(local.x, local.y);
      context.lineTo(local.x - particle.velocityX * sample.stretch * 15, local.y - particle.velocityY * sample.stretch * 15);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(local.x, local.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

export function SpriteMotionEffectPage(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [run, setRun] = useState<SpriteMotionEffectRun | null>(null);

  useEffect(() => {
    const unsubscribeStart = window.YUA.sprite.onMotionEffectStart(setRun);
    const unsubscribeCancel = window.YUA.sprite.onMotionEffectCancel((payload) => {
      setRun((current) => (current?.runId === payload.runId ? null : current));
    });
    void window.YUA.sprite.motionEffectReady().catch(() => undefined);
    return () => {
      unsubscribeStart();
      unsubscribeCancel();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !run) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const width = run.overlayBounds.width;
    const height = run.overlayBounds.height;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const particles = createSpriteMotionParticles(run);
    const source = getSpriteMotionEffectLocalPoint(run, run.path.start);
    const destination = getSpriteMotionEffectLocalPoint(run, run.path.end);
    let animationFrameId = 0;
    let disposed = false;

    const render = (): void => {
      if (disposed) return;
      const frame = getSpriteMotionEffectFrame(run, Date.now());
      context.clearRect(0, 0, width, height);
      if (frame.elapsedMs >= 0) {
        const sourceBurstProgress = clamp(frame.elapsedMs / Math.max(1, run.timeline.dissolveEndMs));
        const arrivalDuration = Math.max(1, run.timeline.arriveEndMs - run.timeline.arriveStartMs);
        const arrivalBurstProgress = clamp((frame.elapsedMs - run.timeline.arriveStartMs) / arrivalDuration);
        drawBurst(context, run, source, sourceBurstProgress, false);
        drawLightTrail(context, run, frame.travelProgress);
        drawParticles(context, run, particles, frame.elapsedMs);
        drawLightCore(context, run, frame.travelProgress);
        drawBurst(context, run, destination, arrivalBurstProgress, true);
      }

      if (!frame.complete) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }
      context.clearRect(0, 0, width, height);
      void window.YUA.sprite.completeMotionEffect(run.runId).catch(() => undefined);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      context.clearRect(0, 0, width, height);
    };
  }, [run]);

  return <canvas ref={canvasRef} className="fixed left-0 top-0 pointer-events-none bg-transparent" aria-hidden="true" />;
}

export default SpriteMotionEffectPage;
