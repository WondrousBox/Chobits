import type { SpriteMovementDirection } from './types';

export interface WindowControllerViewport {
  screenWidth: number;
  screenHeight: number;
  spriteWidth: number;
  spriteHeight: number;
  padding: number;
  avoidRegions?: WindowControllerAvoidRegion[];
}

export interface WindowControllerPoint {
  x: number;
  y: number;
}

export interface WindowControllerAvoidRegion {
  x: number;
  y: number;
  width: number;
  height: number;
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
const EPSILON = 0.001;

interface WindowControllerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function getWindowClampBounds(viewport: WindowControllerViewport): WindowControllerClampBounds {
  return {
    minX: -viewport.padding,
    maxX: viewport.screenWidth - viewport.spriteWidth - viewport.padding,
    minY: -viewport.padding,
    maxY: viewport.screenHeight - viewport.spriteHeight - viewport.padding
  };
}

function clampToBounds(position: WindowControllerPoint, bounds: WindowControllerClampBounds): WindowControllerPoint {
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    y: clamp(position.y, bounds.minY, bounds.maxY)
  };
}

function getSpriteContentRect(position: WindowControllerPoint, viewport: WindowControllerViewport): WindowControllerRect {
  return {
    x: position.x + viewport.padding,
    y: position.y + viewport.padding,
    width: viewport.spriteWidth,
    height: viewport.spriteHeight
  };
}

function rectsIntersect(left: WindowControllerRect, right: WindowControllerRect): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

function getAvoidRegions(viewport: WindowControllerViewport): WindowControllerAvoidRegion[] {
  return (viewport.avoidRegions ?? []).filter(
    (region) => Number.isFinite(region.x) && Number.isFinite(region.y) && Number.isFinite(region.width) && Number.isFinite(region.height) && region.width > 0 && region.height > 0
  );
}

function getDistanceSquared(left: WindowControllerPoint, right: WindowControllerPoint): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function resolveAvoidRegion(
  position: WindowControllerPoint,
  region: WindowControllerAvoidRegion,
  regions: WindowControllerAvoidRegion[],
  viewport: WindowControllerViewport,
  bounds: WindowControllerClampBounds
): WindowControllerPoint {
  const candidates = [
    { x: region.x - viewport.spriteWidth - viewport.padding, y: position.y },
    { x: region.x + region.width - viewport.padding, y: position.y },
    { x: position.x, y: region.y - viewport.spriteHeight - viewport.padding },
    { x: position.x, y: region.y + region.height - viewport.padding }
  ].map((candidate) => clampToBounds(candidate, bounds));

  const safeCandidates = candidates.filter((candidate) => !rectsIntersect(getSpriteContentRect(candidate, viewport), region));
  const globallySafeCandidates = safeCandidates.filter((candidate) => {
    const rect = getSpriteContentRect(candidate, viewport);
    return regions.every((avoidRegion) => !rectsIntersect(rect, avoidRegion));
  });
  const pool = globallySafeCandidates.length > 0 ? globallySafeCandidates : safeCandidates;

  if (pool.length === 0) {
    return position;
  }

  return pool.reduce((best, candidate) => (getDistanceSquared(position, candidate) < getDistanceSquared(position, best) ? candidate : best), pool[0]);
}

export function clampWindowPosition(position: WindowControllerPoint, viewport: WindowControllerViewport): WindowControllerPoint {
  const bounds = getWindowClampBounds(viewport);
  let nextPosition = clampToBounds(position, bounds);
  const avoidRegions = getAvoidRegions(viewport);

  if (avoidRegions.length === 0) {
    return nextPosition;
  }

  for (let pass = 0; pass < Math.max(1, avoidRegions.length * 2); pass += 1) {
    let moved = false;

    for (const region of avoidRegions) {
      if (!rectsIntersect(getSpriteContentRect(nextPosition, viewport), region)) {
        continue;
      }

      const resolved = resolveAvoidRegion(nextPosition, region, avoidRegions, viewport, bounds);
      if (Math.abs(resolved.x - nextPosition.x) > EPSILON || Math.abs(resolved.y - nextPosition.y) > EPSILON) {
        nextPosition = resolved;
        moved = true;
      }
    }

    if (!moved) {
      break;
    }
  }

  return clampToBounds(nextPosition, bounds);
}

export function resolveDragWindowPosition(cursor: WindowControllerPoint, dragOffset: WindowControllerPoint, viewport: WindowControllerViewport): WindowControllerPoint {
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
  const rawPosition = {
    x: input.position.x + (input.velocity.x * input.elapsedMs) / 1000,
    y: input.position.y + (input.velocity.y * input.elapsedMs) / 1000
  };
  const nextPosition = clampWindowPosition(rawPosition, input.viewport);
  const bounds = getWindowClampBounds(input.viewport);
  const hitClamp = Math.abs(nextPosition.x - rawPosition.x) > EPSILON || Math.abs(nextPosition.y - rawPosition.y) > EPSILON;

  return {
    ...nextPosition,
    hitBoundary:
      hitClamp ||
      (input.velocity.x < 0 && nextPosition.x <= bounds.minX) ||
      (input.velocity.x > 0 && nextPosition.x >= bounds.maxX) ||
      (input.velocity.y < 0 && nextPosition.y <= bounds.minY) ||
      (input.velocity.y > 0 && nextPosition.y >= bounds.maxY)
  };
}
