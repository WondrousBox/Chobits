import type { SpriteMovementDirection } from './types';

export interface WindowControllerViewport {
  screenWidth: number;
  screenHeight: number;
  spriteWidth: number;
  spriteHeight: number;
  padding: number;
}

export interface WindowControllerPoint {
  x: number;
  y: number;
}

export interface WindowControllerClampBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface WindowControllerPathPoint extends WindowControllerPoint {
  d: number;
}

export interface WindowControllerWalkPath {
  startX: number;
  startY: number;
  points: WindowControllerPathPoint[];
  totalDist: number;
}

export const DEFAULT_WALK_SPEED = 60;
export const PATH_CURVE_FACTOR = 0.15;
export const STEP_GRID = 12;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const lerp = (left: number, right: number, ratio: number): number => left + (right - left) * ratio;
const bezierQ = (start: number, control: number, end: number, ratio: number): number => (1 - ratio) ** 2 * start + 2 * (1 - ratio) * ratio * control + ratio ** 2 * end;

export function getWindowClampBounds(viewport: WindowControllerViewport): WindowControllerClampBounds {
  return {
    minX: -viewport.padding,
    maxX: viewport.screenWidth - viewport.spriteWidth - viewport.padding,
    minY: -viewport.padding,
    maxY: viewport.screenHeight - viewport.spriteHeight - viewport.padding
  };
}

export function clampWindowPosition(position: WindowControllerPoint, viewport: WindowControllerViewport): WindowControllerPoint {
  const bounds = getWindowClampBounds(viewport);
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY)
  };
}

export function resolveDragWindowPosition(
  cursor: WindowControllerPoint,
  dragOffset: WindowControllerPoint,
  viewport: WindowControllerViewport
): WindowControllerPoint {
  return clampWindowPosition(
    {
      x: cursor.x - dragOffset.x,
      y: cursor.y - dragOffset.y
    },
    viewport
  );
}

export function directionToVelocity(direction: SpriteMovementDirection, speed: number): WindowControllerPoint {
  const diagonal = speed * Math.SQRT1_2;
  switch (direction) {
    case 'left':
      return { x: -speed, y: 0 };
    case 'right':
      return { x: speed, y: 0 };
    case 'up':
      return { x: 0, y: -speed };
    case 'down':
      return { x: 0, y: speed };
    case 'up-left':
      return { x: -diagonal, y: -diagonal };
    case 'up-right':
      return { x: diagonal, y: -diagonal };
    case 'down-left':
      return { x: -diagonal, y: diagonal };
    case 'down-right':
      return { x: diagonal, y: diagonal };
    default:
      return { x: 0, y: 0 };
  }
}

const RANDOM_MOVEMENT_DIRECTIONS: SpriteMovementDirection[] = ['left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right'];

export function resolveRandomMovementDirection(randomValue = Math.random()): SpriteMovementDirection {
  const normalized = clamp(Number.isFinite(randomValue) ? randomValue : 0, 0, 0.999999);
  return RANDOM_MOVEMENT_DIRECTIONS[Math.floor(normalized * RANDOM_MOVEMENT_DIRECTIONS.length)];
}

export function sampleWindowWalkPath(input: {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  curveMagnitudeRandom?: number;
  curveDirectionRandom?: number;
  curveFactor?: number;
  stepGrid?: number;
}): WindowControllerWalkPath {
  const dx = input.targetX - input.startX;
  const dy = input.targetY - input.startY;
  const totalDist = Math.hypot(dx, dy);

  if (totalDist < 1) {
    return {
      startX: input.startX,
      startY: input.startY,
      points: [],
      totalDist: 0
    };
  }

  const mx = (input.startX + input.targetX) / 2;
  const my = (input.startY + input.targetY) / 2;
  const nx = -dy / totalDist;
  const ny = dx / totalDist;
  const magnitudeRandom = clamp(input.curveMagnitudeRandom ?? Math.random(), 0, 1);
  const directionRandom = clamp(input.curveDirectionRandom ?? Math.random(), 0, 1);
  const curve = totalDist * (input.curveFactor ?? PATH_CURVE_FACTOR) * (magnitudeRandom * 0.6 + 0.4) * (directionRandom < 0.5 ? -1 : 1);
  const controlX = mx + nx * curve;
  const controlY = my + ny * curve;

  const samples = Math.max(20, Math.ceil(totalDist / (input.stepGrid ?? STEP_GRID)));
  const points: WindowControllerPathPoint[] = [];
  let last = { x: input.startX, y: input.startY };
  let accumulated = 0;

  for (let index = 1; index <= samples; index += 1) {
    const ratio = index / samples;
    const x = bezierQ(input.startX, controlX, input.targetX, ratio);
    const y = bezierQ(input.startY, controlY, input.targetY, ratio);
    accumulated += Math.hypot(x - last.x, y - last.y);
    points.push({ x, y, d: accumulated });
    last = { x, y };
  }

  return {
    startX: input.startX,
    startY: input.startY,
    points,
    totalDist: accumulated
  };
}

export function getWalkPathPosition(path: WindowControllerWalkPath, progressed: number): WindowControllerPoint {
  if (path.points.length === 0 || progressed <= 0) {
    return { x: path.startX, y: path.startY };
  }

  const clampedProgress = clamp(progressed, 0, path.totalDist);
  let index = 0;
  while (index < path.points.length && path.points[index].d < clampedProgress) {
    index += 1;
  }

  const prev = index === 0 ? { x: path.startX, y: path.startY, d: 0 } : path.points[index - 1];
  const current = path.points[Math.min(index, path.points.length - 1)];
  const segmentLength = Math.max(1e-6, current.d - prev.d);
  const segmentRatio = clamp((clampedProgress - prev.d) / segmentLength, 0, 1);

  return {
    x: lerp(prev.x, current.x, segmentRatio),
    y: lerp(prev.y, current.y, segmentRatio)
  };
}

export function computeAutoMoveStep(input: {
  position: WindowControllerPoint;
  velocity: WindowControllerPoint;
  elapsedMs: number;
  viewport: WindowControllerViewport;
}): WindowControllerPoint & { hitBoundary: boolean } {
  const nextPosition = clampWindowPosition(
    {
      x: input.position.x + (input.velocity.x * input.elapsedMs) / 1000,
      y: input.position.y + (input.velocity.y * input.elapsedMs) / 1000
    },
    input.viewport
  );
  const bounds = getWindowClampBounds(input.viewport);

  return {
    ...nextPosition,
    hitBoundary:
      (input.velocity.x < 0 && nextPosition.x <= bounds.minX) ||
      (input.velocity.x > 0 && nextPosition.x >= bounds.maxX) ||
      (input.velocity.y < 0 && nextPosition.y <= bounds.minY) ||
      (input.velocity.y > 0 && nextPosition.y >= bounds.maxY)
  };
}
