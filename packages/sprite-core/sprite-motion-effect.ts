import type { SpriteMotionEffectPath, SpriteMotionEffectPoint, SpriteMotionEffectRect, SpriteMotionEffectRun, SpriteMotionEffectTimeline, SpriteMotionEffectType } from './types';

export const SPRITE_MOTION_EFFECT_START_DELAY_MS = 100;
export const SPRITE_MOTION_EFFECT_READY_TIMEOUT_MS = 1500;
export const SPRITE_MOTION_EFFECT_COMPLETION_GRACE_MS = 350;

export const SPRITE_MOTION_EFFECT_TIMELINES = {
  standard: {
    durationMs: 1050,
    dissolveEndMs: 180,
    travelStartMs: 180,
    travelEndMs: 650,
    arriveStartMs: 600,
    arriveEndMs: 850
  },
  reduced: {
    durationMs: 260,
    dissolveEndMs: 70,
    travelStartMs: 70,
    travelEndMs: 150,
    arriveStartMs: 130,
    arriveEndMs: 230
  }
} as const;

const STANDARD_GLOW_PADDING = 180;
const REDUCED_GLOW_PADDING = 80;
const MAX_CURVE_OFFSET = 220;

export interface CreateSpriteMotionEffectRunInput {
  type: SpriteMotionEffectType;
  sourceBounds: SpriteMotionEffectRect;
  destinationBounds: SpriteMotionEffectRect;
  reducedMotion: boolean;
}

export interface CreateSpriteMotionEffectRunOptions {
  runId: string;
  now: number;
  seed: number;
  startDelayMs?: number;
}

export interface SpriteMotionEffectFrame {
  elapsedMs: number;
  overallProgress: number;
  dissolveProgress: number;
  travelProgress: number;
  arriveProgress: number;
  head: SpriteMotionEffectPoint;
  complete: boolean;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(progress: number): number {
  const value = clamp(progress);
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function isFiniteRect(rect: SpriteMotionEffectRect): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

function getRectCenter(rect: SpriteMotionEffectRect): SpriteMotionEffectPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function getQuadraticAxisExtrema(start: number, control: number, end: number): number[] {
  const denominator = start - 2 * control + end;
  if (Math.abs(denominator) < 0.000001) return [];
  const ratio = (start - control) / denominator;
  if (ratio <= 0 || ratio >= 1) return [];
  const inverse = 1 - ratio;
  return [inverse * inverse * start + 2 * inverse * ratio * control + ratio * ratio * end];
}

function getPathBounds(path: SpriteMotionEffectPath): SpriteMotionEffectRect {
  const xValues = [path.start.x, path.end.x, ...getQuadraticAxisExtrema(path.start.x, path.control1.x, path.end.x)];
  const yValues = [path.start.y, path.end.y, ...getQuadraticAxisExtrema(path.start.y, path.control1.y, path.end.y)];
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function unionRects(rects: SpriteMotionEffectRect[]): SpriteMotionEffectRect {
  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function getSpriteMotionEffectPoint(path: SpriteMotionEffectPath, progress: number): SpriteMotionEffectPoint {
  const ratio = clamp(progress);
  const inverse = 1 - ratio;
  return {
    x: inverse * inverse * path.start.x + 2 * inverse * ratio * path.control1.x + ratio * ratio * path.end.x,
    y: inverse * inverse * path.start.y + 2 * inverse * ratio * path.control1.y + ratio * ratio * path.end.y
  };
}

export function getSpriteMotionEffectLocalPoint(run: SpriteMotionEffectRun, point: SpriteMotionEffectPoint): SpriteMotionEffectPoint {
  return {
    x: point.x - run.overlayBounds.x,
    y: point.y - run.overlayBounds.y
  };
}

export function createSpriteMotionEffectPath(sourceBounds: SpriteMotionEffectRect, destinationBounds: SpriteMotionEffectRect, seed: number): SpriteMotionEffectPath {
  if (!isFiniteRect(sourceBounds) || !isFiniteRect(destinationBounds)) {
    throw new Error('Invalid sprite motion effect bounds');
  }

  const start = getRectCenter(sourceBounds);
  const end = getRectCenter(destinationBounds);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const normalX = distance > 0 ? -dy / distance : 0;
  const normalY = distance > 0 ? dx / distance : -1;
  const direction = (seed >>> 0) % 2 === 0 ? 1 : -1;
  const curveOffset = Math.min(MAX_CURVE_OFFSET, distance * 0.18) * direction;

  return {
    type: 'quadratic',
    start,
    control1: {
      x: (start.x + end.x) / 2 + normalX * curveOffset,
      y: (start.y + end.y) / 2 + normalY * curveOffset
    },
    end
  };
}

export function createSpriteMotionEffectOverlayBounds(
  path: SpriteMotionEffectPath,
  sourceBounds: SpriteMotionEffectRect,
  destinationBounds: SpriteMotionEffectRect,
  reducedMotion: boolean
): SpriteMotionEffectRect {
  const padding = reducedMotion ? REDUCED_GLOW_PADDING : STANDARD_GLOW_PADDING;
  const bounds = unionRects([getPathBounds(path), sourceBounds, destinationBounds]);
  const left = Math.floor(bounds.x - padding);
  const top = Math.floor(bounds.y - padding);
  const right = Math.ceil(bounds.x + bounds.width + padding);
  const bottom = Math.ceil(bounds.y + bounds.height + padding);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function createSpriteMotionEffectRun(input: CreateSpriteMotionEffectRunInput, options: CreateSpriteMotionEffectRunOptions): SpriteMotionEffectRun {
  if (input.type !== 'warp' && input.type !== 'dash-trail') {
    throw new Error('Invalid sprite motion effect type');
  }
  if (!isFiniteRect(input.sourceBounds) || !isFiniteRect(input.destinationBounds)) {
    throw new Error('Invalid sprite motion effect bounds');
  }

  const sourceBounds = { ...input.sourceBounds };
  const destinationBounds = { ...input.destinationBounds };
  const path = createSpriteMotionEffectPath(sourceBounds, destinationBounds, options.seed);
  const values = input.reducedMotion ? SPRITE_MOTION_EFFECT_TIMELINES.reduced : SPRITE_MOTION_EFFECT_TIMELINES.standard;
  const timeline: SpriteMotionEffectTimeline = {
    dissolveEndMs: values.dissolveEndMs,
    travelStartMs: values.travelStartMs,
    travelEndMs: values.travelEndMs,
    arriveStartMs: values.arriveStartMs,
    arriveEndMs: values.arriveEndMs
  };

  return {
    runId: options.runId,
    type: input.type,
    startsAt: Math.round(options.now + (options.startDelayMs ?? SPRITE_MOTION_EFFECT_START_DELAY_MS)),
    durationMs: values.durationMs,
    sourceBounds,
    destinationBounds,
    overlayBounds: createSpriteMotionEffectOverlayBounds(path, sourceBounds, destinationBounds, input.reducedMotion),
    path,
    timeline,
    seed: options.seed >>> 0,
    reducedMotion: input.reducedMotion
  };
}

export function getSpriteMotionEffectFrame(run: SpriteMotionEffectRun, now: number): SpriteMotionEffectFrame {
  const elapsedMs = now - run.startsAt;
  const dissolveProgress = easeInOutCubic(elapsedMs / Math.max(1, run.timeline.dissolveEndMs));
  const travelProgress = easeInOutCubic((elapsedMs - run.timeline.travelStartMs) / Math.max(1, run.timeline.travelEndMs - run.timeline.travelStartMs));
  const arriveProgress = easeInOutCubic((elapsedMs - run.timeline.arriveStartMs) / Math.max(1, run.timeline.arriveEndMs - run.timeline.arriveStartMs));
  return {
    elapsedMs,
    overallProgress: clamp(elapsedMs / Math.max(1, run.durationMs)),
    dissolveProgress,
    travelProgress,
    arriveProgress,
    head: getSpriteMotionEffectPoint(run.path, travelProgress),
    complete: elapsedMs >= run.durationMs
  };
}
