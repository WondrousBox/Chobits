import clsx from 'clsx';
import React, { useCallback } from 'react';
import { TbArrowsHorizontal, TbArrowsVertical, TbColorFilter, TbFlipHorizontal, TbFlipVertical, TbRefresh, TbX, TbZoomIn, TbZoomOut } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

import type { MediaSegment, MediaSource, MediaTransform } from '../../types';
import { DEFAULT_TRANSFORM } from '../../types';

interface MediaTransformPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Close callback */
  onClose: () => void;
  /** Current segment being edited */
  segment: MediaSegment | null;
  /** Media source */
  source?: MediaSource;
  /** Transform change callback */
  onTransformChange: (transform: Partial<MediaTransform>) => void;
  /** Custom class name */
  className?: string;
}

/**
 * MediaTransformPanel - 变换编辑面板
 *
 * 用于编辑媒体片段的变换参数：
 * - 位置 (X, Y)
 * - 缩放
 * - 旋转
 * - 不透明度
 * - 翻转
 */
export const MediaTransformPanel: React.FC<MediaTransformPanelProps> = ({ open, onClose, segment, source, onTransformChange, className }) => {
  const transform = segment?.transform ?? DEFAULT_TRANSFORM;

  // Reset to defaults
  const handleReset = useCallback(() => {
    onTransformChange(DEFAULT_TRANSFORM);
  }, [onTransformChange]);

  // Position handlers
  const handleXChange = useCallback(
    (values: number[]) => {
      onTransformChange({ x: values[0] });
    },
    [onTransformChange]
  );

  const handleYChange = useCallback(
    (values: number[]) => {
      onTransformChange({ y: values[0] });
    },
    [onTransformChange]
  );

  // Scale handler
  const handleScaleChange = useCallback(
    (values: number[]) => {
      onTransformChange({ scale: values[0] / 100 }); // Convert from percentage
    },
    [onTransformChange]
  );

  // Rotation handler
  const handleRotationChange = useCallback(
    (values: number[]) => {
      onTransformChange({ rotation: values[0] });
    },
    [onTransformChange]
  );

  // Opacity handler
  const handleOpacityChange = useCallback(
    (values: number[]) => {
      onTransformChange({ opacity: values[0] / 100 }); // Convert from percentage
    },
    [onTransformChange]
  );

  // Flip handlers
  const handleFlipX = useCallback(() => {
    onTransformChange({ flipX: !transform.flipX });
  }, [onTransformChange, transform.flipX]);

  const handleFlipY = useCallback(() => {
    onTransformChange({ flipY: !transform.flipY });
  }, [onTransformChange, transform.flipY]);

  // Quick rotation
  const handleRotate90 = useCallback(() => {
    onTransformChange({ rotation: (transform.rotation + 90) % 360 });
  }, [onTransformChange, transform.rotation]);

  const handleRotateMinus90 = useCallback(() => {
    onTransformChange({ rotation: (transform.rotation - 90 + 360) % 360 });
  }, [onTransformChange, transform.rotation]);

  // Fit to screen
  const handleFitToScreen = useCallback(() => {
    if (!source) return;
    // Calculate scale to fit container while maintaining aspect ratio
    const containerAspect = 16 / 9; // Assuming 16:9 container
    const sourceAspect = source.width / source.height;
    const scale = sourceAspect > containerAspect ? 100 / (source.width / source.width) : 100 / (source.height / source.height);
    onTransformChange({
      x: 50,
      y: 50,
      scale: Math.min(1, scale / 100)
    });
  }, [onTransformChange, source]);

  // Fill screen
  const handleFillScreen = useCallback(() => {
    if (!source) return;
    // Calculate scale to fill container while maintaining aspect ratio
    const containerAspect = 16 / 9;
    const sourceAspect = source.width / source.height;
    const scale = sourceAspect > containerAspect ? 100 / (source.height / source.height) : 100 / (source.width / source.width);
    onTransformChange({
      x: 50,
      y: 50,
      scale: Math.max(1, scale / 100)
    });
  }, [onTransformChange, source]);

  // Center
  const handleCenter = useCallback(() => {
    onTransformChange({ x: 50, y: 50 });
  }, [onTransformChange]);

  if (!open) return null;

  return (
    <div className={clsx('absolute right-0 top-0 bottom-0 w-64 bg-background border-l shadow-lg z-50 flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <h3 className="text-sm font-medium">变换设置</h3>
        <Button variant="ghost" size="sm" className="w-6 h-6 p-0" onClick={onClose}>
          <TbX className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Segment info */}
        {segment && source && (
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1 mb-1">
              {source.type === 'video' ? '🎬' : '🖼️'} {source.path.split('/').pop()}
            </div>
            <div className="flex gap-2">
              <span>
                {source.width}x{source.height}
              </span>
              {source.duration && <span>{source.duration.toFixed(1)}s</span>}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-foreground">快速操作</div>
          <div className="grid grid-cols-3 gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCenter} title="居中">
              <TbArrowsHorizontal className="w-3 h-3 mr-1" />
              居中
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleFitToScreen} title="适应屏幕">
              <TbZoomOut className="w-3 h-3 mr-1" />
              适应
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleFillScreen} title="填充屏幕">
              <TbZoomIn className="w-3 h-3 mr-1" />
              填充
            </Button>
          </div>
        </div>

        {/* Position X */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1">
              <TbArrowsHorizontal className="w-3 h-3" />
              水平位置 (X)
            </label>
            <span className="text-xs text-muted-foreground font-mono">{transform.x.toFixed(1)}%</span>
          </div>
          <Slider value={[transform.x]} onValueChange={handleXChange} min={0} max={100} step={0.1} className="w-full" />
        </div>

        {/* Position Y */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1">
              <TbArrowsVertical className="w-3 h-3" />
              垂直位置 (Y)
            </label>
            <span className="text-xs text-muted-foreground font-mono">{transform.y.toFixed(1)}%</span>
          </div>
          <Slider value={[transform.y]} onValueChange={handleYChange} min={0} max={100} step={0.1} className="w-full" />
        </div>

        {/* Scale */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1">
              <TbZoomIn className="w-3 h-3" />
              缩放
            </label>
            <span className="text-xs text-muted-foreground font-mono">{(transform.scale * 100).toFixed(0)}%</span>
          </div>
          <Slider value={[transform.scale * 100]} onValueChange={handleScaleChange} min={10} max={300} step={1} className="w-full" />
        </div>

        {/* Rotation */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1">
              <TbRefresh className="w-3 h-3" />
              旋转
            </label>
            <span className="text-xs text-muted-foreground font-mono">{transform.rotation.toFixed(0)}°</span>
          </div>
          <Slider value={[transform.rotation]} onValueChange={handleRotationChange} min={0} max={360} step={1} className="w-full" />
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-6 text-xs flex-1" onClick={handleRotateMinus90}>
              -90°
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-xs flex-1" onClick={handleRotate90}>
              +90°
            </Button>
          </div>
        </div>

        {/* Opacity */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground flex items-center gap-1">
              <TbColorFilter className="w-3 h-3" />
              不透明度
            </label>
            <span className="text-xs text-muted-foreground font-mono">{(transform.opacity * 100).toFixed(0)}%</span>
          </div>
          <Slider value={[transform.opacity * 100]} onValueChange={handleOpacityChange} min={0} max={100} step={1} className="w-full" />
        </div>

        {/* Flip */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-foreground">翻转</div>
          <div className="flex gap-2">
            <Button variant={transform.flipX ? 'secondary' : 'outline'} size="sm" className="h-8 flex-1 text-xs" onClick={handleFlipX}>
              <TbFlipHorizontal className="w-4 h-4 mr-1" />
              水平翻转
            </Button>
            <Button variant={transform.flipY ? 'secondary' : 'outline'} size="sm" className="h-8 flex-1 text-xs" onClick={handleFlipY}>
              <TbFlipVertical className="w-4 h-4 mr-1" />
              垂直翻转
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-2">
        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={handleReset}>
          重置为默认值
        </Button>
      </div>
    </div>
  );
};
