import type { WindowAnimationAnchor, WindowAnimationKeyframe, WindowAnimationPlacement } from '../../../electron/preload/apis/window';

export type WindowAnimationPresetFrame = Required<Pick<WindowAnimationKeyframe, 'x' | 'y' | 'width' | 'height'>> &
  Pick<WindowAnimationKeyframe, 'duration' | 'easing' | 'curve' | 'control1' | 'control2' | 'opacity' | 'placement'>;

export type WindowAnimationPresetCategory = 'entrance' | 'exit' | 'emphasis';

export const WINDOW_ANIMATION_PRESET_CATEGORIES: Array<{ category: WindowAnimationPresetCategory; label: string }> = [
  { category: 'entrance', label: '进入' },
  { category: 'exit', label: '退出' },
  { category: 'emphasis', label: '强调' }
];

export const WINDOW_ANIMATION_PRESETS = [
  { id: 'fly-in', label: '飞入', category: 'entrance', supportsDirection: true },
  { id: 'fade-in', label: '淡入', category: 'entrance', supportsDirection: false },
  { id: 'zoom-in', label: '缩放进入', category: 'entrance', supportsDirection: false },
  { id: 'fly-out', label: '飞出', category: 'exit', supportsDirection: true },
  { id: 'fade-out', label: '淡出', category: 'exit', supportsDirection: false },
  { id: 'zoom-out', label: '缩放退出', category: 'exit', supportsDirection: false },
  { id: 'pulse', label: '脉冲', category: 'emphasis', supportsDirection: false },
  { id: 'shake', label: '抖动', category: 'emphasis', supportsDirection: true }
] as const;

export type WindowAnimationPresetId = (typeof WINDOW_ANIMATION_PRESETS)[number]['id'];

export function isWindowAnimationPresetId(value: unknown): value is WindowAnimationPresetId {
  return typeof value === 'string' && WINDOW_ANIMATION_PRESETS.some((preset) => preset.id === value);
}

export const WINDOW_ANIMATION_PRESET_DIRECTIONS = [
  { value: 'left', label: '左侧' },
  { value: 'right', label: '右侧' },
  { value: 'top', label: '上侧' },
  { value: 'bottom', label: '下侧' }
] as const;

export type WindowAnimationPresetDirection = (typeof WINDOW_ANIMATION_PRESET_DIRECTIONS)[number]['value'];

export type WindowAnimationPresetWorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CreateWindowAnimationPresetFramesOptions = {
  presetId: WindowAnimationPresetId;
  baseFrame: WindowAnimationPresetFrame;
  positionAnchor: WindowAnimationAnchor;
  direction?: WindowAnimationPresetDirection;
  duration?: number;
  workArea: WindowAnimationPresetWorkArea;
};

type PresetFramePatch = Partial<Omit<WindowAnimationPresetFrame, 'placement'>> & {
  placement?: WindowAnimationPlacement | null;
};

const DEFAULT_PRESET_DURATION = 650;
const OFFSCREEN_MARGIN = 48;
const MIN_PRESET_SIZE = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeDuration(duration?: number): number {
  return Math.max(0, Math.round(Number.isFinite(duration) ? Number(duration) : DEFAULT_PRESET_DURATION));
}

function getPositionAnchorOffset(anchor: WindowAnimationAnchor, frame: Pick<WindowAnimationPresetFrame, 'width' | 'height'>): { x: number; y: number } {
  switch (anchor) {
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top':
      return { x: frame.width / 2, y: 0 };
    case 'top-right':
      return { x: frame.width, y: 0 };
    case 'left':
      return { x: 0, y: frame.height / 2 };
    case 'center':
      return { x: frame.width / 2, y: frame.height / 2 };
    case 'right':
      return { x: frame.width, y: frame.height / 2 };
    case 'bottom-left':
      return { x: 0, y: frame.height };
    case 'bottom':
      return { x: frame.width / 2, y: frame.height };
    case 'bottom-right':
      return { x: frame.width, y: frame.height };
  }
}

function getFrameTopLeft(frame: WindowAnimationPresetFrame, positionAnchor: WindowAnimationAnchor): { x: number; y: number } {
  const offset = getPositionAnchorOffset(positionAnchor, frame);
  return {
    x: frame.x - offset.x,
    y: frame.y - offset.y
  };
}

function getFrameFromTopLeft(
  frame: Pick<WindowAnimationPresetFrame, 'width' | 'height'>,
  topLeft: { x: number; y: number },
  positionAnchor: WindowAnimationAnchor
): Pick<WindowAnimationPresetFrame, 'x' | 'y'> {
  const offset = getPositionAnchorOffset(positionAnchor, frame);
  return {
    x: Math.round(topLeft.x + offset.x),
    y: Math.round(topLeft.y + offset.y)
  };
}

function makeFrame(baseFrame: WindowAnimationPresetFrame, patch: PresetFramePatch = {}, preservePlacement = true): WindowAnimationPresetFrame {
  const placement = patch.placement === null ? undefined : patch.placement || (preservePlacement ? baseFrame.placement : undefined);
  const frame: WindowAnimationPresetFrame = {
    x: Math.round(patch.x ?? baseFrame.x),
    y: Math.round(patch.y ?? baseFrame.y),
    width: Math.max(MIN_PRESET_SIZE, Math.round(patch.width ?? baseFrame.width)),
    height: Math.max(MIN_PRESET_SIZE, Math.round(patch.height ?? baseFrame.height)),
    opacity: clamp(patch.opacity ?? baseFrame.opacity ?? 1, 0, 1),
    duration: normalizeDuration(patch.duration),
    easing: patch.easing || 'ease-in-out',
    curve: patch.curve || 'line'
  };
  if (placement) {
    frame.placement = placement;
  }
  return frame;
}

function makeInstantFrame(baseFrame: WindowAnimationPresetFrame, patch: PresetFramePatch = {}, preservePlacement = true): WindowAnimationPresetFrame {
  return makeFrame(baseFrame, { ...patch, duration: 0, easing: 'linear' }, preservePlacement);
}

function scaleFrame(baseFrame: WindowAnimationPresetFrame, scale: number): Pick<WindowAnimationPresetFrame, 'width' | 'height'> {
  return {
    width: Math.max(MIN_PRESET_SIZE, Math.round(baseFrame.width * scale)),
    height: Math.max(MIN_PRESET_SIZE, Math.round(baseFrame.height * scale))
  };
}

function getOffscreenPoint(
  baseFrame: WindowAnimationPresetFrame,
  positionAnchor: WindowAnimationAnchor,
  direction: WindowAnimationPresetDirection,
  workArea: WindowAnimationPresetWorkArea
): Pick<WindowAnimationPresetFrame, 'x' | 'y'> {
  const topLeft = getFrameTopLeft(baseFrame, positionAnchor);
  const nextTopLeft = { ...topLeft };
  if (direction === 'left') {
    nextTopLeft.x = workArea.x - baseFrame.width - OFFSCREEN_MARGIN;
  } else if (direction === 'right') {
    nextTopLeft.x = workArea.x + workArea.width + OFFSCREEN_MARGIN;
  } else if (direction === 'top') {
    nextTopLeft.y = workArea.y - baseFrame.height - OFFSCREEN_MARGIN;
  } else {
    nextTopLeft.y = workArea.y + workArea.height + OFFSCREEN_MARGIN;
  }
  return getFrameFromTopLeft(baseFrame, nextTopLeft, positionAnchor);
}

function getShakeOffset(direction: WindowAnimationPresetDirection, amount: number): Pick<WindowAnimationPresetFrame, 'x' | 'y'> {
  if (direction === 'left') return { x: -amount, y: 0 };
  if (direction === 'right') return { x: amount, y: 0 };
  if (direction === 'top') return { x: 0, y: -amount };
  return { x: 0, y: amount };
}

function createFlyInFrames(options: CreateWindowAnimationPresetFramesOptions, duration: number, direction: WindowAnimationPresetDirection): WindowAnimationPresetFrame[] {
  const start = getOffscreenPoint(options.baseFrame, options.positionAnchor, direction, options.workArea);
  return [
    makeInstantFrame(options.baseFrame, { ...start, opacity: 0, placement: null }, false),
    makeFrame(options.baseFrame, { opacity: options.baseFrame.opacity ?? 1, duration, easing: 'ease-out-cubic' })
  ];
}

function createFlyOutFrames(options: CreateWindowAnimationPresetFramesOptions, duration: number, direction: WindowAnimationPresetDirection): WindowAnimationPresetFrame[] {
  const end = getOffscreenPoint(options.baseFrame, options.positionAnchor, direction, options.workArea);
  return [
    makeInstantFrame(options.baseFrame, { opacity: options.baseFrame.opacity ?? 1 }),
    makeFrame(options.baseFrame, { ...end, opacity: 0, duration, easing: 'ease-in-cubic', placement: null }, false)
  ];
}

function createZoomInFrames(options: CreateWindowAnimationPresetFramesOptions, duration: number): WindowAnimationPresetFrame[] {
  const startSize = scaleFrame(options.baseFrame, 0.35);
  return [makeInstantFrame(options.baseFrame, { ...startSize, opacity: 0 }), makeFrame(options.baseFrame, { opacity: options.baseFrame.opacity ?? 1, duration, easing: 'ease-out-cubic' })];
}

function createZoomOutFrames(options: CreateWindowAnimationPresetFramesOptions, duration: number): WindowAnimationPresetFrame[] {
  const endSize = scaleFrame(options.baseFrame, 0.35);
  return [makeInstantFrame(options.baseFrame, { opacity: options.baseFrame.opacity ?? 1 }), makeFrame(options.baseFrame, { ...endSize, opacity: 0, duration, easing: 'ease-in-cubic' })];
}

function createPulseFrames(options: CreateWindowAnimationPresetFramesOptions, duration: number): WindowAnimationPresetFrame[] {
  const half = Math.max(1, Math.round(duration / 2));
  const peakSize = scaleFrame(options.baseFrame, 1.12);
  return [
    makeInstantFrame(options.baseFrame, { opacity: options.baseFrame.opacity ?? 1 }),
    makeFrame(options.baseFrame, { ...peakSize, duration: half, easing: 'ease-out' }),
    makeFrame(options.baseFrame, { duration: Math.max(1, duration - half), easing: 'ease-in-out' })
  ];
}

function createShakeFrames(options: CreateWindowAnimationPresetFramesOptions, duration: number, direction: WindowAnimationPresetDirection): WindowAnimationPresetFrame[] {
  const stepDuration = Math.max(1, Math.round(duration / 5));
  const amount = Math.max(12, Math.round(Math.min(options.baseFrame.width, options.baseFrame.height) * 0.08));
  const forward = getShakeOffset(direction, amount);
  const backward = { x: -forward.x, y: -forward.y };
  const baseOpacity = options.baseFrame.opacity ?? 1;
  return [
    makeInstantFrame(options.baseFrame, { opacity: baseOpacity }),
    makeFrame(options.baseFrame, { x: options.baseFrame.x + forward.x, y: options.baseFrame.y + forward.y, opacity: baseOpacity, duration: stepDuration, easing: 'ease-out', placement: null }, false),
    makeFrame(
      options.baseFrame,
      { x: options.baseFrame.x + backward.x, y: options.baseFrame.y + backward.y, opacity: baseOpacity, duration: stepDuration, easing: 'ease-in-out', placement: null },
      false
    ),
    makeFrame(
      options.baseFrame,
      { x: options.baseFrame.x + forward.x * 0.65, y: options.baseFrame.y + forward.y * 0.65, opacity: baseOpacity, duration: stepDuration, easing: 'ease-in-out', placement: null },
      false
    ),
    makeFrame(
      options.baseFrame,
      { x: options.baseFrame.x + backward.x * 0.45, y: options.baseFrame.y + backward.y * 0.45, opacity: baseOpacity, duration: stepDuration, easing: 'ease-in-out', placement: null },
      false
    ),
    makeFrame(options.baseFrame, { opacity: baseOpacity, duration: Math.max(1, duration - stepDuration * 4), easing: 'ease-out' })
  ];
}

export function createWindowAnimationPresetFrames(options: CreateWindowAnimationPresetFramesOptions): WindowAnimationPresetFrame[] {
  const duration = normalizeDuration(options.duration);
  const direction = options.direction || 'left';
  switch (options.presetId) {
    case 'fly-in':
      return createFlyInFrames(options, duration, direction);
    case 'fade-in':
      return [makeInstantFrame(options.baseFrame, { opacity: 0 }), makeFrame(options.baseFrame, { opacity: options.baseFrame.opacity ?? 1, duration, easing: 'ease-out' })];
    case 'zoom-in':
      return createZoomInFrames(options, duration);
    case 'fly-out':
      return createFlyOutFrames(options, duration, direction);
    case 'fade-out':
      return [makeInstantFrame(options.baseFrame, { opacity: options.baseFrame.opacity ?? 1 }), makeFrame(options.baseFrame, { opacity: 0, duration, easing: 'ease-in' })];
    case 'zoom-out':
      return createZoomOutFrames(options, duration);
    case 'pulse':
      return createPulseFrames(options, duration);
    case 'shake':
      return createShakeFrames(options, duration, direction);
  }
}
