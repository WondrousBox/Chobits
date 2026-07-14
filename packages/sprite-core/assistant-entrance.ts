import type { AssistantEntrancePreparePayload, AssistantEntranceRun } from './types';

export const ASSISTANT_ENTRANCE_START_DELAY_MS = 120;
export const ASSISTANT_ENTRANCE_EFFECT_READY_TIMEOUT_MS = 1500;
export const ASSISTANT_ENTRANCE_COMPLETION_GRACE_MS = 500;

export const ASSISTANT_ENTRANCE_TIMELINES = {
  standard: {
    durationMs: 1700,
    scanStartMs: 120,
    scanDurationMs: 1030
  },
  reduced: {
    durationMs: 320,
    scanStartMs: 20,
    scanDurationMs: 240
  }
} as const;

const MAX_SURFACE_DIMENSION = 8192;

export interface AssistantEntranceFrame {
  elapsedMs: number;
  overallProgress: number;
  scanProgress: number;
  scanY: number;
  complete: boolean;
}

export interface CreateAssistantEntranceRunOptions {
  runId: string;
  now: number;
  seed: number;
  startDelayMs?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function easeAssistantEntranceProgress(progress: number): number {
  const value = clamp(progress, 0, 1);
  if (value < 0.5) return 4 * value * value * value;
  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function normalizeAssistantEntrancePreparePayload(payload: AssistantEntrancePreparePayload | null | undefined): AssistantEntrancePreparePayload | null {
  if (!payload || !isFinitePositive(payload.surface?.width) || !isFinitePositive(payload.surface?.height)) return null;
  if (!Number.isFinite(payload.characterRect?.x) || !Number.isFinite(payload.characterRect?.y)) return null;
  if (!isFinitePositive(payload.characterRect?.width) || !isFinitePositive(payload.characterRect?.height)) return null;

  const surface = {
    width: Math.round(payload.surface.width),
    height: Math.round(payload.surface.height)
  };
  const characterRect = {
    x: Math.round(payload.characterRect.x),
    y: Math.round(payload.characterRect.y),
    width: Math.round(payload.characterRect.width),
    height: Math.round(payload.characterRect.height)
  };

  if (surface.width < 1 || surface.height < 1 || surface.width > MAX_SURFACE_DIMENSION || surface.height > MAX_SURFACE_DIMENSION) return null;
  if (characterRect.x < 0 || characterRect.y < 0 || characterRect.width < 1 || characterRect.height < 1) return null;
  if (characterRect.x + characterRect.width > surface.width || characterRect.y + characterRect.height > surface.height) return null;

  return {
    surface,
    characterRect,
    reducedMotion: payload.reducedMotion === true
  };
}

export function createAssistantEntranceRun(payload: AssistantEntrancePreparePayload, options: CreateAssistantEntranceRunOptions): AssistantEntranceRun {
  const timeline = payload.reducedMotion ? ASSISTANT_ENTRANCE_TIMELINES.reduced : ASSISTANT_ENTRANCE_TIMELINES.standard;
  return {
    ...payload,
    runId: options.runId,
    startsAt: Math.round(options.now + (options.startDelayMs ?? ASSISTANT_ENTRANCE_START_DELAY_MS)),
    durationMs: timeline.durationMs,
    scanStartMs: timeline.scanStartMs,
    scanDurationMs: timeline.scanDurationMs,
    seed: options.seed >>> 0
  };
}

export function getAssistantEntranceFrame(run: AssistantEntranceRun, now: number): AssistantEntranceFrame {
  const elapsedMs = now - run.startsAt;
  const durationMs = Math.max(1, run.durationMs);
  const scanDurationMs = Math.max(1, run.scanDurationMs);
  const overallProgress = clamp(elapsedMs / durationMs, 0, 1);
  const rawScanProgress = clamp((elapsedMs - run.scanStartMs) / scanDurationMs, 0, 1);
  const scanProgress = easeAssistantEntranceProgress(rawScanProgress);
  const characterBottom = run.characterRect.y + run.characterRect.height;
  const scanY = characterBottom - run.characterRect.height * scanProgress;

  return {
    elapsedMs,
    overallProgress,
    scanProgress,
    scanY,
    complete: elapsedMs >= durationMs
  };
}
