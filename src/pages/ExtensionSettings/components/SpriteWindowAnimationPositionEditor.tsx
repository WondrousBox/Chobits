import type {
  SpriteWindowAnimationAnchor,
  SpriteWindowAnimationCoordinateFitMode,
  SpriteWindowAnimationDisplay,
  SpriteWindowAnimationPlacement,
  SpriteWindowAnimationPlayPosition
} from '@packages/sprite-core/types';
import type { TFunction } from 'i18next';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TbAlignBoxBottomCenter,
  TbAlignBoxBottomLeft,
  TbAlignBoxBottomRight,
  TbAlignBoxCenterMiddle,
  TbAlignBoxLeftMiddle,
  TbAlignBoxRightMiddle,
  TbAlignBoxTopCenter,
  TbAlignBoxTopLeft,
  TbAlignBoxTopRight
} from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 225;
const DESIGN_AREA = { width: 1440, height: 900 };
const DEFAULT_POINT = { x: DESIGN_AREA.width / 2, y: DESIGN_AREA.height / 2 };

const ANCHOR_OPTIONS: Array<{ anchor: SpriteWindowAnimationAnchor; icon: React.ComponentType<{ className?: string }> }> = [
  { anchor: 'top-left', icon: TbAlignBoxTopLeft },
  { anchor: 'top', icon: TbAlignBoxTopCenter },
  { anchor: 'top-right', icon: TbAlignBoxTopRight },
  { anchor: 'left', icon: TbAlignBoxLeftMiddle },
  { anchor: 'center', icon: TbAlignBoxCenterMiddle },
  { anchor: 'right', icon: TbAlignBoxRightMiddle },
  { anchor: 'bottom-left', icon: TbAlignBoxBottomLeft },
  { anchor: 'bottom', icon: TbAlignBoxBottomCenter },
  { anchor: 'bottom-right', icon: TbAlignBoxBottomRight }
];

const DISPLAY_OPTIONS: Array<{ value: SpriteWindowAnimationDisplay }> = [{ value: 'current' }, { value: 'main' }, { value: 'primary' }];

const FIT_MODE_OPTIONS: Array<{ value: SpriteWindowAnimationCoordinateFitMode }> = [{ value: 'stretch' }, { value: 'contain' }, { value: 'cover' }];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value: string, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function getDefaultPlacementConfig(anchor: SpriteWindowAnimationAnchor = 'center'): SpriteWindowAnimationPlacement {
  return {
    anchor,
    display: 'current',
    useWorkArea: true,
    margin: 24
  };
}

function getDefaultPlacement(anchor: SpriteWindowAnimationAnchor = 'center'): SpriteWindowAnimationPlayPosition {
  return {
    mode: 'placement',
    placement: getDefaultPlacementConfig(anchor),
    positionAnchor: 'center'
  };
}

function getDefaultPointPosition(): SpriteWindowAnimationPlayPosition {
  return {
    mode: 'point',
    point: DEFAULT_POINT,
    positionAnchor: 'center',
    coordinateSpace: {
      type: 'design-area',
      designArea: DESIGN_AREA,
      display: 'current',
      useWorkArea: true,
      fitMode: 'stretch',
      sizeMode: 'scale-with-area'
    }
  };
}

function getUniformMargin(value?: SpriteWindowAnimationPlayPosition): number {
  const margin = value?.placement?.margin;
  if (typeof margin === 'number' && Number.isFinite(margin)) return margin;
  if (margin && typeof margin === 'object') return margin.x ?? margin.y ?? margin.top ?? margin.left ?? 0;
  return 0;
}

function getCanvasPoint(svg: SVGSVGElement, event: React.PointerEvent<SVGSVGElement>): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH, 0, CANVAS_WIDTH),
    y: clamp(((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT, 0, CANVAS_HEIGHT)
  };
}

function toCanvasPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (point.x / DESIGN_AREA.width) * CANVAS_WIDTH,
    y: (point.y / DESIGN_AREA.height) * CANVAS_HEIGHT
  };
}

function toDesignPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round((point.x / CANVAS_WIDTH) * DESIGN_AREA.width),
    y: Math.round((point.y / CANVAS_HEIGHT) * DESIGN_AREA.height)
  };
}

function getAnchorCanvasPoint(anchor: SpriteWindowAnimationAnchor): { x: number; y: number } {
  switch (anchor) {
    case 'top-left':
      return { x: 24, y: 24 };
    case 'top':
      return { x: CANVAS_WIDTH / 2, y: 24 };
    case 'top-right':
      return { x: CANVAS_WIDTH - 24, y: 24 };
    case 'left':
      return { x: 24, y: CANVAS_HEIGHT / 2 };
    case 'right':
      return { x: CANVAS_WIDTH - 24, y: CANVAS_HEIGHT / 2 };
    case 'bottom-left':
      return { x: 24, y: CANVAS_HEIGHT - 24 };
    case 'bottom':
      return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT - 24 };
    case 'bottom-right':
      return { x: CANVAS_WIDTH - 24, y: CANVAS_HEIGHT - 24 };
    case 'center':
    default:
      return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  }
}

function getPlacementLabel(t: TFunction, value?: SpriteWindowAnimationPlayPosition): string {
  if (!value) return t('sprite:positionEditor.placementLabels.keepCurrent');
  if (value.mode === 'point') return t('sprite:positionEditor.placementLabels.manual');
  const anchor = value.placement?.anchor;
  return ANCHOR_OPTIONS.some((option) => option.anchor === anchor) ? t(`sprite:positionEditor.anchors.${anchor}`) : t('sprite:positionEditor.placementLabels.quick');
}

export default function SpriteWindowAnimationPositionEditor({
  value,
  onChange
}: {
  value?: SpriteWindowAnimationPlayPosition;
  onChange: (value: SpriteWindowAnimationPlayPosition | undefined) => void;
}): JSX.Element {
  const { t } = useTranslation('sprite');
  const enabled = Boolean(value);
  const mode = value?.mode ?? 'placement';
  const margin = getUniformMargin(value);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const point = value?.mode === 'point' ? (value.point ?? DEFAULT_POINT) : DEFAULT_POINT;
  const canvasPoint = useMemo(() => toCanvasPoint(point), [point]);
  const placementAnchor = value?.mode === 'placement' ? (value.placement?.anchor ?? 'center') : 'center';
  const placementPoint = useMemo(() => getAnchorCanvasPoint(placementAnchor), [placementAnchor]);

  const updatePlacement = (patch: Partial<NonNullable<SpriteWindowAnimationPlayPosition['placement']>>): void => {
    const placement = {
      ...getDefaultPlacementConfig(),
      ...(value?.mode === 'placement' ? value.placement : undefined),
      ...patch
    };
    onChange({
      mode: 'placement',
      placement,
      positionAnchor: 'center'
    });
  };

  const updatePoint = (patch: Partial<SpriteWindowAnimationPlayPosition>): void => {
    onChange({
      mode: 'point',
      coordinateSpace: {
        ...getDefaultPointPosition().coordinateSpace,
        ...(value?.mode === 'point' ? value.coordinateSpace : undefined),
        ...(patch.coordinateSpace ?? {})
      },
      point: patch.point ?? (value?.mode === 'point' ? value.point : DEFAULT_POINT),
      positionAnchor: patch.positionAnchor ?? value?.positionAnchor ?? 'center'
    });
  };

  return (
    <div className="space-y-2 rounded-md border px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium">{t('sprite:positionEditor.title')}</div>
          <div className="text-[11px] text-muted-foreground">{getPlacementLabel(t, value)}</div>
        </div>
        <Switch checked={enabled} onCheckedChange={(checked) => onChange(checked ? getDefaultPlacement('center') : undefined)} />
      </div>

      {enabled && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={mode} onValueChange={(nextMode) => onChange(nextMode === 'point' ? getDefaultPointPosition() : getDefaultPlacement(value?.placement?.anchor ?? 'center'))}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placement">{t('sprite:positionEditor.modes.placement')}</SelectItem>
                  <SelectItem value="point">{t('sprite:positionEditor.modes.point')}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={(mode === 'point' ? value?.coordinateSpace?.display : value?.placement?.display) ?? 'current'}
                onValueChange={(display) =>
                  mode === 'point' ? updatePoint({ coordinateSpace: { display: display as SpriteWindowAnimationDisplay } }) : updatePlacement({ display: display as SpriteWindowAnimationDisplay })
                }
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPLAY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`sprite:displays.${option.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'point' && (
                <Select
                  value={value?.coordinateSpace?.fitMode ?? 'stretch'}
                  onValueChange={(fitMode) => updatePoint({ coordinateSpace: { fitMode: fitMode as SpriteWindowAnimationCoordinateFitMode } })}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIT_MODE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {t(`sprite:positionEditor.fitModes.${option.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              className={cn('h-[160px] w-full rounded-md border bg-muted/20', mode === 'point' && 'cursor-crosshair')}
              onPointerDown={(event) => {
                if (mode !== 'point' || !svgRef.current) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                updatePoint({ point: toDesignPoint(getCanvasPoint(svgRef.current, event)) });
              }}
              onPointerMove={(event) => {
                if (mode !== 'point' || !svgRef.current || event.buttons !== 1) return;
                updatePoint({ point: toDesignPoint(getCanvasPoint(svgRef.current, event)) });
              }}
            >
              <rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} rx={8} fill="transparent" />
              <g stroke="currentColor" className="text-border" strokeWidth={1}>
                <line x1={CANVAS_WIDTH / 3} y1={0} x2={CANVAS_WIDTH / 3} y2={CANVAS_HEIGHT} />
                <line x1={(CANVAS_WIDTH / 3) * 2} y1={0} x2={(CANVAS_WIDTH / 3) * 2} y2={CANVAS_HEIGHT} />
                <line x1={0} y1={CANVAS_HEIGHT / 3} x2={CANVAS_WIDTH} y2={CANVAS_HEIGHT / 3} />
                <line x1={0} y1={(CANVAS_HEIGHT / 3) * 2} x2={CANVAS_WIDTH} y2={(CANVAS_HEIGHT / 3) * 2} />
              </g>
              {mode === 'point' ? (
                <g>
                  <line x1={canvasPoint.x} y1={0} x2={canvasPoint.x} y2={CANVAS_HEIGHT} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                  <line x1={0} y1={canvasPoint.y} x2={CANVAS_WIDTH} y2={canvasPoint.y} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                  <circle cx={canvasPoint.x} cy={canvasPoint.y} r={7} fill="hsl(var(--primary))" />
                  <circle cx={canvasPoint.x} cy={canvasPoint.y} r={12} fill="transparent" stroke="hsl(var(--primary))" />
                </g>
              ) : (
                <g>
                  <line x1={placementPoint.x} y1={0} x2={placementPoint.x} y2={CANVAS_HEIGHT} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                  <line x1={0} y1={placementPoint.y} x2={CANVAS_WIDTH} y2={placementPoint.y} stroke="hsl(var(--primary))" strokeDasharray="4 4" />
                  <circle cx={placementPoint.x} cy={placementPoint.y} r={7} fill="hsl(var(--primary))" />
                  <text x={CANVAS_WIDTH / 2} y={CANVAS_HEIGHT - 12} textAnchor="middle" className="fill-muted-foreground text-[12px]">
                    {getPlacementLabel(t, value)}
                  </text>
                </g>
              )}
            </svg>

            {mode === 'point' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1">
                  <Label className="text-[11px] text-muted-foreground">X</Label>
                  <Input className="h-8 text-xs" value={Math.round(point.x)} onChange={(event) => updatePoint({ point: { ...point, x: toNumber(event.target.value, point.x) } })} />
                </div>
                <div className="flex items-center gap-1">
                  <Label className="text-[11px] text-muted-foreground">Y</Label>
                  <Input className="h-8 text-xs" value={Math.round(point.y)} onChange={(event) => updatePoint({ point: { ...point, y: toNumber(event.target.value, point.y) } })} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <TooltipProvider delayDuration={120}>
              <div className="grid grid-cols-3 gap-1.5">
                {ANCHOR_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = mode === 'placement' ? value?.placement?.anchor === option.anchor : value?.positionAnchor === option.anchor;
                  const anchorLabel = t(`sprite:positionEditor.anchors.${option.anchor}`);
                  return (
                    <Tooltip key={option.anchor}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant={active ? 'default' : 'outline'}
                          className="h-8 w-full"
                          onClick={() => (mode === 'placement' ? updatePlacement({ anchor: option.anchor }) : updatePoint({ positionAnchor: option.anchor }))}
                        >
                          <Icon />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">{mode === 'placement' ? anchorLabel : t('sprite:positionEditor.windowAnchorTooltip', { label: anchorLabel })}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>

            {mode === 'placement' && (
              <div className="flex items-center gap-2">
                <Label className="text-[11px] text-muted-foreground">{t('sprite:positionEditor.margin')}</Label>
                <Input className="h-8 text-xs" value={margin} onChange={(event) => updatePlacement({ margin: Math.max(0, Math.round(toNumber(event.target.value, margin))) })} />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={mode === 'point' ? (value?.coordinateSpace?.useWorkArea ?? true) : (value?.placement?.useWorkArea ?? true)}
                onChange={(event) => (mode === 'point' ? updatePoint({ coordinateSpace: { useWorkArea: event.target.checked } }) : updatePlacement({ useWorkArea: event.target.checked }))}
              />
              {t('sprite:positionEditor.useWorkArea')}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
