import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  TbAlignBoxBottomCenter,
  TbAlignBoxBottomLeft,
  TbAlignBoxBottomRight,
  TbAlignBoxCenterMiddle,
  TbAlignBoxLeftMiddle,
  TbAlignBoxRightMiddle,
  TbAlignBoxTopCenter,
  TbAlignBoxTopLeft,
  TbAlignBoxTopRight,
  TbCheck,
  TbChevronDown,
  TbChevronRight,
  TbCopy,
  TbJson,
  TbPlayerPlay,
  TbPlayerStop,
  TbPlus,
  TbTrash,
  TbX
} from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type {
  WindowAnimationAnchor,
  WindowAnimationCoordinateSpace,
  WindowAnimationCurve,
  WindowAnimationDisplay,
  WindowAnimationEasing,
  WindowAnimationKeyframe,
  WindowAnimationPlacement,
  WindowAnimationTimeline
} from '../../../electron/preload/apis/window';

type EditableKeyframe = Required<Pick<WindowAnimationKeyframe, 'x' | 'y' | 'width' | 'height'>> &
  Pick<WindowAnimationKeyframe, 'duration' | 'easing' | 'curve' | 'control1' | 'control2' | 'opacity' | 'placement'>;

type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type DragOperation = { type: 'move'; index: number } | { type: 'resize'; index: number; corner: ResizeCorner };

const TARGET_WINDOWS = [
  { key: 'main', label: '主精灵窗口' },
  { key: 'spriteBubbleFixedTop', label: '顶部气泡窗口' },
  { key: 'spriteEffect', label: '精灵特效窗口' },
  { key: 'menu', label: '精灵菜单窗口' }
];

const EASING_OPTIONS: WindowAnimationEasing[] = ['linear', 'ease-in-out', 'ease-in', 'ease-out', 'ease-in-out-quad', 'ease-in-out-cubic'];
const CURVE_OPTIONS: WindowAnimationCurve[] = ['line', 'quadratic', 'cubic'];
const DISPLAY_OPTIONS: Array<{ value: WindowAnimationDisplay; label: string }> = [
  { value: 'current', label: '当前显示器' },
  { value: 'main', label: '主窗口显示器' },
  { value: 'primary', label: '主显示器' }
];
const ANCHOR_OPTIONS: Array<{ anchor: WindowAnimationAnchor; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { anchor: 'top-left', label: '左上角', icon: TbAlignBoxTopLeft },
  { anchor: 'top', label: '顶部居中', icon: TbAlignBoxTopCenter },
  { anchor: 'top-right', label: '右上角', icon: TbAlignBoxTopRight },
  { anchor: 'left', label: '左侧上下居中', icon: TbAlignBoxLeftMiddle },
  { anchor: 'center', label: '正中心', icon: TbAlignBoxCenterMiddle },
  { anchor: 'right', label: '右侧上下居中', icon: TbAlignBoxRightMiddle },
  { anchor: 'bottom-left', label: '左下角', icon: TbAlignBoxBottomLeft },
  { anchor: 'bottom', label: '底部居中', icon: TbAlignBoxBottomCenter },
  { anchor: 'bottom-right', label: '右下角', icon: TbAlignBoxBottomRight }
];
const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 420;
const WORK_AREA = { x: 0, y: 0, width: 1440, height: 900 };
const MIN_WINDOW_SIZE = 40;
const DEFAULT_POSITION_ANCHOR: WindowAnimationAnchor = 'center';

const RESIZE_HANDLES: Array<{ corner: ResizeCorner; cursor: React.CSSProperties['cursor'] }> = [
  { corner: 'top-left', cursor: 'nwse-resize' },
  { corner: 'top-right', cursor: 'nesw-resize' },
  { corner: 'bottom-left', cursor: 'nesw-resize' },
  { corner: 'bottom-right', cursor: 'nwse-resize' }
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value: string, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function createDefaultFrames(): EditableKeyframe[] {
  return [
    { x: 530, y: 630, width: 220, height: 220, opacity: 1, duration: 0, easing: 'linear', curve: 'line' },
    { x: 780, y: 460, width: 260, height: 240, opacity: 1, duration: 700, easing: 'ease-in-out', curve: 'quadratic', control1: { x: 620, y: 360 } },
    { x: 1020, y: 620, width: 200, height: 200, opacity: 0.92, duration: 650, easing: 'ease-out', curve: 'cubic', control1: { x: 860, y: 280 }, control2: { x: 1110, y: 360 } }
  ];
}

function createAdaptiveCoordinateSpace(): WindowAnimationCoordinateSpace {
  return {
    type: 'design-area',
    designArea: { width: WORK_AREA.width, height: WORK_AREA.height },
    display: 'current',
    useWorkArea: true,
    fitMode: 'stretch',
    sizeMode: 'scale-with-area'
  };
}

function normalizeCoordinateSpace(enabled: boolean): WindowAnimationCoordinateSpace | undefined {
  return enabled ? createAdaptiveCoordinateSpace() : undefined;
}

function normalizeFrame(frame: EditableKeyframe): WindowAnimationKeyframe {
  const result: WindowAnimationKeyframe = {
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    width: Math.max(1, Math.round(frame.width)),
    height: Math.max(1, Math.round(frame.height)),
    opacity: clamp(frame.opacity ?? 1, 0, 1),
    duration: Math.max(0, Math.round(frame.duration ?? 300)),
    easing: frame.easing || 'ease-in-out',
    curve: frame.curve || 'line'
  };
  if (frame.placement) {
    result.placement = frame.placement;
  }
  if (result.curve === 'quadratic' || result.curve === 'cubic') {
    result.control1 = frame.control1;
  }
  if (result.curve === 'cubic') {
    result.control2 = frame.control2;
  }
  return result;
}

function getPositionAnchorOffset(anchor: WindowAnimationAnchor, frame: Pick<EditableKeyframe, 'width' | 'height'>): { x: number; y: number } {
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

function getFrameTopLeft(frame: EditableKeyframe, positionAnchor: WindowAnimationAnchor): { x: number; y: number } {
  const offset = getPositionAnchorOffset(positionAnchor, frame);
  return {
    x: frame.x - offset.x,
    y: frame.y - offset.y
  };
}

function getFrameFromTopLeft(frame: EditableKeyframe, topLeft: { x: number; y: number }, positionAnchor: WindowAnimationAnchor): Pick<EditableKeyframe, 'x' | 'y'> {
  const offset = getPositionAnchorOffset(positionAnchor, frame);
  return {
    x: Math.round(topLeft.x + offset.x),
    y: Math.round(topLeft.y + offset.y)
  };
}

function toCanvasPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: ((point.x - WORK_AREA.x) / WORK_AREA.width) * CANVAS_WIDTH,
    y: ((point.y - WORK_AREA.y) / WORK_AREA.height) * CANVAS_HEIGHT
  };
}

function toDesignAreaPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(WORK_AREA.x + (point.x / CANVAS_WIDTH) * WORK_AREA.width),
    y: Math.round(WORK_AREA.y + (point.y / CANVAS_HEIGHT) * WORK_AREA.height)
  };
}

function getCanvasPoint(svg: SVGSVGElement, event: React.PointerEvent<SVGSVGElement>): { x: number; y: number } {
  const matrix = svg.getScreenCTM();
  if (matrix) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return {
      x: clamp(transformed.x, 0, CANVAS_WIDTH),
      y: clamp(transformed.y, 0, CANVAS_HEIGHT)
    };
  }

  const rect = svg.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH, 0, CANVAS_WIDTH),
    y: clamp(((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT, 0, CANVAS_HEIGHT)
  };
}

function resizeFrameBounds(
  frame: EditableKeyframe,
  corner: ResizeCorner,
  point: { x: number; y: number },
  positionAnchor: WindowAnimationAnchor
): Pick<EditableKeyframe, 'x' | 'y' | 'width' | 'height'> {
  const topLeft = getFrameTopLeft(frame, positionAnchor);
  const left = topLeft.x;
  const top = topLeft.y;
  const right = left + frame.width;
  const bottom = top + frame.height;

  switch (corner) {
    case 'top-left': {
      const x = Math.min(point.x, right - MIN_WINDOW_SIZE);
      const y = Math.min(point.y, bottom - MIN_WINDOW_SIZE);
      const next = { ...frame, width: right - x, height: bottom - y };
      return { ...getFrameFromTopLeft(next, { x, y }, positionAnchor), width: next.width, height: next.height };
    }
    case 'top-right': {
      const y = Math.min(point.y, bottom - MIN_WINDOW_SIZE);
      const width = Math.max(MIN_WINDOW_SIZE, point.x - left);
      const next = { ...frame, width, height: bottom - y };
      return { ...getFrameFromTopLeft(next, { x: left, y }, positionAnchor), width: next.width, height: next.height };
    }
    case 'bottom-left': {
      const x = Math.min(point.x, right - MIN_WINDOW_SIZE);
      const height = Math.max(MIN_WINDOW_SIZE, point.y - top);
      const next = { ...frame, width: right - x, height };
      return { ...getFrameFromTopLeft(next, { x, y: top }, positionAnchor), width: next.width, height: next.height };
    }
    case 'bottom-right': {
      const next = {
        ...frame,
        width: Math.max(MIN_WINDOW_SIZE, point.x - left),
        height: Math.max(MIN_WINDOW_SIZE, point.y - top)
      };
      return { ...getFrameFromTopLeft(next, { x: left, y: top }, positionAnchor), width: next.width, height: next.height };
    }
  }
}

function getResizeHandlePosition(corner: ResizeCorner, rect: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  switch (corner) {
    case 'top-left':
      return { x: rect.x, y: rect.y };
    case 'top-right':
      return { x: rect.x + rect.width, y: rect.y };
    case 'bottom-left':
      return { x: rect.x, y: rect.y + rect.height };
    case 'bottom-right':
      return { x: rect.x + rect.width, y: rect.y + rect.height };
  }
}

function getUniformMargin(placement?: WindowAnimationPlacement): number {
  if (typeof placement?.margin === 'number' && Number.isFinite(placement.margin)) {
    return placement.margin;
  }
  return 0;
}

function resolvePlacementPreview(frame: EditableKeyframe, placement: WindowAnimationPlacement, positionAnchor: WindowAnimationAnchor): Pick<EditableKeyframe, 'x' | 'y'> {
  const margin = getUniformMargin(placement);
  const width = Math.max(1, Math.round(frame.width));
  const height = Math.max(1, Math.round(frame.height));
  const left = WORK_AREA.x + margin;
  const right = WORK_AREA.x + WORK_AREA.width - width - margin;
  const top = WORK_AREA.y + margin;
  const bottom = WORK_AREA.y + WORK_AREA.height - height - margin;
  const centerX = WORK_AREA.x + (WORK_AREA.width - width) / 2;
  const centerY = WORK_AREA.y + (WORK_AREA.height - height) / 2;

  switch (placement.anchor) {
    case 'top-left':
      return getFrameFromTopLeft(frame, { x: left, y: top }, positionAnchor);
    case 'top':
      return getFrameFromTopLeft(frame, { x: centerX, y: top }, positionAnchor);
    case 'top-right':
      return getFrameFromTopLeft(frame, { x: right, y: top }, positionAnchor);
    case 'left':
      return getFrameFromTopLeft(frame, { x: left, y: centerY }, positionAnchor);
    case 'center':
      return getFrameFromTopLeft(frame, { x: centerX, y: centerY }, positionAnchor);
    case 'right':
      return getFrameFromTopLeft(frame, { x: right, y: centerY }, positionAnchor);
    case 'bottom-left':
      return getFrameFromTopLeft(frame, { x: left, y: bottom }, positionAnchor);
    case 'bottom':
      return getFrameFromTopLeft(frame, { x: centerX, y: bottom }, positionAnchor);
    case 'bottom-right':
      return getFrameFromTopLeft(frame, { x: right, y: bottom }, positionAnchor);
  }
}

function getPlacementLabel(placement?: WindowAnimationPlacement): string {
  if (!placement) return '绝对坐标';
  return ANCHOR_OPTIONS.find((option) => option.anchor === placement.anchor)?.label || placement.anchor;
}

function buildPath(frames: EditableKeyframe[]): string {
  if (frames.length === 0) return '';
  const first = toCanvasPoint(frames[0]);
  const commands = [`M ${first.x} ${first.y}`];
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const point = toCanvasPoint(frame);
    if (frame.curve === 'quadratic' && frame.control1) {
      const c1 = toCanvasPoint(frame.control1);
      commands.push(`Q ${c1.x} ${c1.y} ${point.x} ${point.y}`);
    } else if (frame.curve === 'cubic' && frame.control1 && frame.control2) {
      const c1 = toCanvasPoint(frame.control1);
      const c2 = toCanvasPoint(frame.control2);
      commands.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${point.x} ${point.y}`);
    } else {
      commands.push(`L ${point.x} ${point.y}`);
    }
  }
  return commands.join(' ');
}

export default function WindowAnimationEditor(): JSX.Element {
  const [targetWindow, setTargetWindow] = useState('main');
  const [frames, setFrames] = useState<EditableKeyframe[]>(() => createDefaultFrames());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dragOperation, setDragOperation] = useState<DragOperation | null>(null);
  const [clampToWorkArea, setClampToWorkArea] = useState(false);
  const [coordinateSpaceEnabled, setCoordinateSpaceEnabled] = useState(true);
  const [positionAnchor, setPositionAnchor] = useState<WindowAnimationAnchor>(DEFAULT_POSITION_ANCHOR);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const selectedFrame = frames[selectedIndex] || frames[0];
  const totalDuration = useMemo(() => frames.reduce((sum, frame, index) => sum + (index === 0 ? 0 : Math.max(0, frame.duration ?? 0)), 0), [frames]);
  const normalizedCoordinateSpace = useMemo(() => normalizeCoordinateSpace(coordinateSpaceEnabled), [coordinateSpaceEnabled]);
  const timeline = useMemo<WindowAnimationTimeline>(
    () => ({
      id: `chobits-window-${targetWindow}`,
      keyframes: frames.map(normalizeFrame),
      coordinateSpace: normalizedCoordinateSpace,
      positionAnchor,
      createIfMissing: targetWindow !== 'main',
      showBeforePlay: true,
      clampToWorkArea,
      suspendFollowMainDuringPlay: true,
      refreshFollowerAfterPlay: false
    }),
    [clampToWorkArea, frames, normalizedCoordinateSpace, positionAnchor, targetWindow]
  );
  const timelineJson = useMemo(() => JSON.stringify(timeline, null, 2), [timeline]);

  const updateFrame = useCallback(
    (index: number, patch: Partial<EditableKeyframe>) => {
      setFrames((prev) =>
        prev.map((frame, frameIndex) => {
          if (frameIndex !== index) return frame;
          const next = { ...frame, ...patch };
          if (next.placement && (Object.prototype.hasOwnProperty.call(patch, 'width') || Object.prototype.hasOwnProperty.call(patch, 'height'))) {
            const preview = resolvePlacementPreview(next, next.placement, positionAnchor);
            next.x = Math.round(preview.x);
            next.y = Math.round(preview.y);
          }
          return next;
        })
      );
    },
    [positionAnchor]
  );

  const setFramePlacement = useCallback(
    (anchor: WindowAnimationAnchor) => {
      setFrames((prev) =>
        prev.map((frame, frameIndex) => {
          if (frameIndex !== selectedIndex) return frame;
          const placement: WindowAnimationPlacement = {
            anchor,
            display: frame.placement?.display || 'current',
            useWorkArea: frame.placement?.useWorkArea ?? true,
            margin: getUniformMargin(frame.placement)
          };
          const preview = resolvePlacementPreview(frame, placement, positionAnchor);
          return { ...frame, x: Math.round(preview.x), y: Math.round(preview.y), placement };
        })
      );
    },
    [positionAnchor, selectedIndex]
  );

  const updateFramePlacement = useCallback(
    (patch: Partial<WindowAnimationPlacement>) => {
      setFrames((prev) =>
        prev.map((frame, frameIndex) => {
          if (frameIndex !== selectedIndex || !frame.placement) return frame;
          const placement = { ...frame.placement, ...patch };
          const preview = resolvePlacementPreview(frame, placement, positionAnchor);
          return { ...frame, x: Math.round(preview.x), y: Math.round(preview.y), placement };
        })
      );
    },
    [positionAnchor, selectedIndex]
  );

  const clearFramePlacement = useCallback(() => {
    updateFrame(selectedIndex, { placement: undefined });
  }, [selectedIndex, updateFrame]);

  const addFrame = useCallback(() => {
    setFrames((prev) => {
      const last = prev[prev.length - 1] || createDefaultFrames()[0];
      const next: EditableKeyframe = {
        ...last,
        x: last.x + 140,
        y: last.y + 60,
        placement: undefined,
        duration: 600,
        curve: 'line'
      };
      setSelectedIndex(prev.length);
      return [...prev, next];
    });
  }, []);

  const removeFrame = useCallback(() => {
    if (frames.length <= 1) return;
    setFrames((prev) => prev.filter((_, index) => index !== selectedIndex));
    setSelectedIndex((index) => Math.max(0, Math.min(index, frames.length - 2)));
  }, [frames.length, selectedIndex]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!dragOperation || !svgRef.current) return;
      const canvasPoint = getCanvasPoint(svgRef.current, event);
      const designPoint = toDesignAreaPoint(canvasPoint);
      const frame = frames[dragOperation.index];
      if (!frame) return;

      if (dragOperation.type === 'move') {
        updateFrame(dragOperation.index, { ...designPoint, placement: undefined });
        return;
      }

      const bounds = resizeFrameBounds(frame, dragOperation.corner, designPoint, positionAnchor);
      if (frame.placement) {
        updateFrame(dragOperation.index, { width: bounds.width, height: bounds.height });
      } else {
        updateFrame(dragOperation.index, bounds);
      }
    },
    [dragOperation, frames, positionAnchor, updateFrame]
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragOperation(null);
  }, []);

  const play = useCallback(async () => {
    const result = await window.YUA.window['window:animation:play'](targetWindow, timeline);
    if (result.ok) {
      toast.success('窗口动画已开始播放');
    } else {
      toast.error('窗口动画播放失败', { description: result.error || 'unknown error' });
    }
  }, [targetWindow, timeline]);

  const stop = useCallback(async () => {
    await window.YUA.window['window:animation:stop'](targetWindow);
  }, [targetWindow]);

  const updateNumeric = useCallback(
    (key: keyof EditableKeyframe, value: string) => {
      if (!selectedFrame) return;
      const patch = { [key]: toNumber(value, Number(selectedFrame[key] ?? 0)) } as Partial<EditableKeyframe>;
      if (key === 'x' || key === 'y') {
        patch.placement = undefined;
      }
      updateFrame(selectedIndex, patch);
    },
    [selectedFrame, selectedIndex, updateFrame]
  );

  const copyTimelineJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(timelineJson);
      setJsonCopied(true);
      toast.success('JSON 已复制');
      window.setTimeout(() => setJsonCopied(false), 1800);
    } catch (error) {
      toast.error('复制失败', { description: error instanceof Error ? error.message : String(error) });
    }
  }, [timelineJson]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="min-w-0">
          <div className="text-sm font-semibold">窗口动画编辑器</div>
          <div className="text-xs text-muted-foreground">关键帧路径、尺寸和透明度时间轴</div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => window.YUA.window['window:close']('windowAnimationEditor' as any)}
        >
          <TbX />
        </Button>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4 p-4">
        <section className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={targetWindow} onValueChange={setTargetWindow}>
              <SelectTrigger className="h-8 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_WINDOWS.map((target) => (
                  <SelectItem key={target.key} value={target.key}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={play}>
              <TbPlayerPlay />
              播放
            </Button>
            <Button size="sm" variant="outline" onClick={stop}>
              <TbPlayerStop />
              停止
            </Button>
            <Button size="sm" variant="outline" onClick={() => setJsonDialogOpen(true)}>
              <TbJson />
              JSON
            </Button>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={clampToWorkArea} onChange={(event) => setClampToWorkArea(event.target.checked)} />
              限制在工作区内
            </label>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              className="h-full w-full touch-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <defs>
                <pattern id="window-editor-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                  <path d="M 36 0 L 0 0 0 36" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border" />
                </pattern>
              </defs>
              <rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#window-editor-grid)" />
              <rect x={1} y={1} width={CANVAS_WIDTH - 2} height={CANVAS_HEIGHT - 2} fill="none" stroke="currentColor" strokeWidth="1" className="text-border" />
              <path d={buildPath(frames)} fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {frames.map((frame, index) => {
                const point = toCanvasPoint(frame);
                const previewWidth = Math.max(20, (frame.width / WORK_AREA.width) * CANVAS_WIDTH);
                const previewHeight = Math.max(16, (frame.height / WORK_AREA.height) * CANVAS_HEIGHT);
                const anchorOffset = getPositionAnchorOffset(positionAnchor, frame);
                const previewAnchorOffsetX = (anchorOffset.x / WORK_AREA.width) * CANVAS_WIDTH;
                const previewAnchorOffsetY = (anchorOffset.y / WORK_AREA.height) * CANVAS_HEIGHT;
                const rectX = point.x - previewAnchorOffsetX;
                const rectY = point.y - previewAnchorOffsetY;
                const markerLabel = frame.placement ? getPlacementLabel(frame.placement) : String(index + 1);
                const isSelected = index === selectedIndex;
                const sizeLabel = `${Math.round(frame.width)} x ${Math.round(frame.height)}`;
                const sizeLabelWidth = Math.max(62, sizeLabel.length * 7 + 14);
                const sizeLabelX = clamp(rectX + previewWidth - sizeLabelWidth - 6, 6, CANVAS_WIDTH - sizeLabelWidth - 6);
                const sizeLabelY = clamp(rectY + previewHeight - 28, 6, CANVAS_HEIGHT - 28);
                return (
                  <g
                    key={index}
                    style={{ cursor: 'move' }}
                    onPointerDown={(event) => {
                      event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
                      setSelectedIndex(index);
                      setDragOperation({ type: 'move', index });
                    }}
                  >
                    <rect
                      x={rectX}
                      y={rectY}
                      width={previewWidth}
                      height={previewHeight}
                      rx="5"
                      fill={index === selectedIndex ? 'hsl(var(--primary) / 0.18)' : 'hsl(var(--background) / 0.88)'}
                      stroke={index === selectedIndex ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.7)'}
                      strokeWidth={index === selectedIndex ? 2 : 1}
                      strokeDasharray={frame.placement ? '6 4' : undefined}
                    />
                    <circle cx={point.x} cy={point.y} r={7} fill="hsl(var(--primary))" />
                    <text x={point.x + 12} y={point.y - 10} className="select-none fill-foreground text-[12px] font-medium">
                      {markerLabel}
                    </text>
                    {isSelected && (
                      <>
                        <g className="pointer-events-none">
                          <rect x={sizeLabelX} y={sizeLabelY} width={sizeLabelWidth} height={22} rx={5} fill="hsl(var(--background) / 0.92)" stroke="hsl(var(--primary) / 0.35)" />
                          <text x={sizeLabelX + 7} y={sizeLabelY + 15} className="select-none fill-foreground text-[11px] font-medium">
                            {sizeLabel}
                          </text>
                        </g>
                        {RESIZE_HANDLES.map((handle) => {
                          const handlePoint = getResizeHandlePosition(handle.corner, { x: rectX, y: rectY, width: previewWidth, height: previewHeight });
                          return (
                            <rect
                              key={handle.corner}
                              x={handlePoint.x - 5}
                              y={handlePoint.y - 5}
                              width={10}
                              height={10}
                              rx={2}
                              fill="hsl(var(--background))"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              style={{ cursor: handle.cursor }}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
                                setSelectedIndex(index);
                                setDragOperation({ type: 'resize', index, corner: handle.corner });
                              }}
                            />
                          );
                        })}
                      </>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <KeyframeTimeline frames={frames} selectedIndex={selectedIndex} onSelect={setSelectedIndex} onAdd={addFrame} onRemove={removeFrame} canRemove={frames.length > 1} />
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l pl-4">
          <div>
            <div className="text-sm font-semibold">关键帧 {selectedIndex + 1}</div>
            <div className="text-xs text-muted-foreground">总时长 {totalDuration} ms</div>
          </div>

          <CoordinateSpaceEditor enabled={coordinateSpaceEnabled} onEnabledChange={setCoordinateSpaceEnabled} />

          <PlacementEditor placement={selectedFrame.placement} onSelectAnchor={setFramePlacement} onChange={updateFramePlacement} onClear={clearFramePlacement} />

          <div className="space-y-2 border-t pt-2">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-xs font-medium transition-colors hover:bg-accent"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <span>高级参数</span>
              {advancedOpen ? <TbChevronDown className="h-4 w-4" /> : <TbChevronRight className="h-4 w-4" />}
            </button>

            {advancedOpen && (
              <div className="space-y-3 pb-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs text-muted-foreground">窗口锚点</label>
                    <Select
                      value={positionAnchor}
                      onValueChange={(value) => {
                        setPositionAnchor(value as WindowAnimationAnchor);
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ANCHOR_OPTIONS.map((option) => (
                          <SelectItem key={option.anchor} value={option.anchor}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Field label="锚点 X" value={selectedFrame.x} onChange={(value) => updateNumeric('x', value)} />
                  <Field label="锚点 Y" value={selectedFrame.y} onChange={(value) => updateNumeric('y', value)} />
                  <Field label="宽度" value={selectedFrame.width} onChange={(value) => updateNumeric('width', value)} />
                  <Field label="高度" value={selectedFrame.height} onChange={(value) => updateNumeric('height', value)} />
                  <Field label="透明度" value={selectedFrame.opacity ?? 1} step="0.05" onChange={(value) => updateNumeric('opacity', value)} />
                  <Field label="段时长 ms" value={selectedIndex === 0 ? 0 : (selectedFrame.duration ?? 600)} disabled={selectedIndex === 0} onChange={(value) => updateNumeric('duration', value)} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">曲线</label>
                    <Select
                      value={selectedFrame.curve || 'line'}
                      onValueChange={(value) => {
                        updateFrame(selectedIndex, { curve: value as WindowAnimationCurve });
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURVE_OPTIONS.map((curve) => (
                          <SelectItem key={curve} value={curve}>
                            {curve}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">缓动</label>
                    <Select
                      value={selectedFrame.easing || 'ease-in-out'}
                      onValueChange={(value) => {
                        updateFrame(selectedIndex, { easing: value as WindowAnimationEasing });
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EASING_OPTIONS.map((easing) => (
                          <SelectItem key={easing} value={easing}>
                            {easing}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <ControlPointEditor
                  title="控制点 1"
                  value={selectedFrame.control1}
                  disabled={selectedFrame.curve === 'line'}
                  fallback={{ x: selectedFrame.x - 80, y: selectedFrame.y - 80 }}
                  onChange={(control1) => {
                    updateFrame(selectedIndex, { control1 });
                  }}
                />
                <ControlPointEditor
                  title="控制点 2"
                  value={selectedFrame.control2}
                  disabled={selectedFrame.curve !== 'cubic'}
                  fallback={{ x: selectedFrame.x + 80, y: selectedFrame.y - 80 }}
                  onChange={(control2) => {
                    updateFrame(selectedIndex, { control2 });
                  }}
                />
              </div>
            )}
          </div>
        </aside>
      </main>

      <Dialog open={jsonDialogOpen} onOpenChange={setJsonDialogOpen}>
        <DialogContent className="flex max-h-[82vh] w-[min(920px,calc(100vw-48px))] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>窗口动画 JSON</DialogTitle>
            <DialogDescription>当前时间线数据，可复制用于调试或复用。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={copyTimelineJson}>
              {jsonCopied ? (
                <>
                  <TbCheck className="h-3.5 w-3.5" />
                  已复制
                </>
              ) : (
                <>
                  <TbCopy className="h-3.5 w-3.5" />
                  复制
                </>
              )}
            </Button>
          </div>
          <Textarea value={timelineJson} readOnly className="min-h-[420px] flex-1 resize-none bg-muted/50 font-mono text-xs" onClick={(event) => event.currentTarget.select()} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, step = '1', disabled, onChange }: { label: string; value: number; step?: string; disabled?: boolean; onChange: (value: string) => void }): JSX.Element {
  return (
    <label className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input type="number" step={step} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-8" />
    </label>
  );
}

function KeyframeTimeline({
  frames,
  selectedIndex,
  onSelect,
  onAdd,
  onRemove,
  canRemove
}: {
  frames: EditableKeyframe[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: () => void;
  canRemove: boolean;
}): JSX.Element {
  return (
    <div className="shrink-0 rounded-md border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium">窗口关键帧</div>
          <div className="text-xs text-muted-foreground">{frames.length} 帧</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onAdd}>
            <TbPlus />
            添加
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRemove} disabled={!canRemove}>
            <TbTrash />
            删除
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center">
          {frames.map((frame, index) => {
            const active = selectedIndex === index;
            const durationLabel = index === 0 ? '起点' : `${frame.duration ?? 0}ms`;
            return (
              <React.Fragment key={index}>
                <button
                  type="button"
                  onClick={() => onSelect(index)}
                  className={cn(
                    'flex h-20 w-40 shrink-0 flex-col justify-between rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-accent',
                    active && 'border-primary bg-primary/10 text-primary'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">#{index + 1}</span>
                    <span className={cn('text-[11px]', active ? 'text-primary' : 'text-muted-foreground')}>{durationLabel}</span>
                  </div>
                  <div className={cn('truncate', active ? 'text-primary' : 'text-foreground')}>
                    ({Math.round(frame.x)}, {Math.round(frame.y)})
                  </div>
                  <div className={cn('truncate', active ? 'text-primary/80' : 'text-muted-foreground')}>
                    {Math.round(frame.width)} x {Math.round(frame.height)}
                  </div>
                  {frame.placement && <div className="truncate text-[11px] text-primary">{getPlacementLabel(frame.placement)}</div>}
                </button>
                {index < frames.length - 1 && <div className="h-px w-8 shrink-0 bg-border" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CoordinateSpaceEditor({ enabled, onEnabledChange }: { enabled: boolean; onEnabledChange: (enabled: boolean) => void }): JSX.Element {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium">屏幕适配</div>
          <div className="text-xs text-muted-foreground">{enabled ? '适配不同屏幕' : '使用绝对桌面 px'}</div>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
          适配
        </label>
      </div>
    </div>
  );
}

function PlacementEditor({
  placement,
  onSelectAnchor,
  onChange,
  onClear
}: {
  placement?: WindowAnimationPlacement;
  onSelectAnchor: (anchor: WindowAnimationAnchor) => void;
  onChange: (patch: Partial<WindowAnimationPlacement>) => void;
  onClear: () => void;
}): JSX.Element {
  const activeAnchor = placement?.anchor;
  const margin = getUniformMargin(placement);
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium">吸附位置</div>
          <div className="text-xs text-muted-foreground">{getPlacementLabel(placement)}</div>
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClear} disabled={!placement}>
          绝对
        </Button>
      </div>

      <TooltipProvider delayDuration={120}>
        <div className="grid grid-cols-3 gap-1.5">
          {ANCHOR_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Tooltip key={option.anchor}>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon" variant={activeAnchor === option.anchor ? 'default' : 'outline'} className="h-9 w-full" onClick={() => onSelectAnchor(option.anchor)}>
                    <Icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">{option.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">显示器基准</label>
          <Select value={placement?.display || 'current'} disabled={!placement} onValueChange={(value) => onChange({ display: value as WindowAnimationDisplay })}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Field label="边距" value={margin} disabled={!placement} onChange={(value) => onChange({ margin: Math.max(0, Math.round(toNumber(value, margin))) })} />
      </div>

      <label className={cn('flex items-center gap-2 text-xs text-muted-foreground', !placement && 'opacity-50')}>
        <input type="checkbox" checked={placement?.useWorkArea ?? true} disabled={!placement} onChange={(event) => onChange({ useWorkArea: event.target.checked })} />
        使用工作区边界
      </label>
    </div>
  );
}

function ControlPointEditor({
  title,
  value,
  fallback,
  disabled,
  onChange
}: {
  title: string;
  value?: { x: number; y: number };
  fallback: { x: number; y: number };
  disabled?: boolean;
  onChange: (value: { x: number; y: number }) => void;
}): JSX.Element {
  const resolved = value || fallback;
  return (
    <div className={cn('rounded-md border p-3', disabled && 'opacity-50')}>
      <div className="mb-2 text-xs font-medium">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="X" value={resolved.x} disabled={disabled} onChange={(next) => onChange({ ...resolved, x: toNumber(next, resolved.x) })} />
        <Field label="Y" value={resolved.y} disabled={disabled} onChange={(next) => onChange({ ...resolved, y: toNumber(next, resolved.y) })} />
      </div>
    </div>
  );
}
