import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbArrowBackUp, TbArrowsMaximize, TbArrowsMove, TbEyeOff, TbFlipHorizontal, TbRotate2, TbRotateClockwise2, TbScanEye, TbZoomIn, TbZoomOut } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { OcrOverlayAnnotation } from '../../utils/ocrAnnotations';

interface ImagePlayerProps {
  src: string;
  title?: string;
  className?: string;
  ocrAnnotations?: OcrOverlayAnnotation[];
}

export const ImagePlayer: React.FC<ImagePlayerProps> = ({ src, title, className, ocrAnnotations = [] }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);
  const [showOcrOverlay, setShowOcrOverlay] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const isPanningRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const visibleOcrAnnotations = useMemo(() => ocrAnnotations.filter((annotation) => annotation.width > 0 && annotation.height > 0 && annotation.x >= 0 && annotation.y >= 0), [ocrAnnotations]);
  const hasOcrAnnotations = visibleOcrAnnotations.length > 0;
  const ocrOverlayTooltip = hasOcrAnnotations ? (showOcrOverlay ? '隐藏 OCR 坐标标注' : '显示 OCR 坐标标注') : '当前图片没有 OCR 坐标，请重新执行 OCR 后查看标注';

  const resetView = useCallback(() => {
    setScale(1);
    setRotation(0);
    setFlipX(false);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = useCallback((event) => {
    event.preventDefault();
    const delta = -event.deltaY;
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    setScale((prev) => {
      const next = prev * zoomFactor;
      return Math.min(Math.max(next, 0.1), 10);
    });
  }, []);

  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = useCallback((event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('[data-ocr-text-layer="true"]')) return;
    event.preventDefault();
    isPanningRef.current = true;
    setIsPanning(true);
    lastPointRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = useCallback((event) => {
    if (!isPanningRef.current) return;
    event.preventDefault();
    const dx = event.clientX - lastPointRef.current.x;
    const dy = event.clientY - lastPointRef.current.y;
    lastPointRef.current = { x: event.clientX, y: event.clientY };
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleMouseUpOrLeave: React.MouseEventHandler<HTMLDivElement> = useCallback(() => {
    isPanningRef.current = false;
    setIsPanning(false);
  }, []);

  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev * 1.2, 10));
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev / 1.2, 0.1));
  }, []);

  const rotateLeft = useCallback(() => {
    setRotation((prev) => prev - 90);
  }, []);

  const rotateRight = useCallback(() => {
    setRotation((prev) => prev + 90);
  }, []);

  const toggleFlipX = useCallback(() => {
    setFlipX((prev) => !prev);
  }, []);

  const handleDoubleClick: React.MouseEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      event.preventDefault();
      resetView();
    },
    [resetView]
  );

  const handleImageLoad: React.ReactEventHandler<HTMLImageElement> = useCallback((event) => {
    const image = event.currentTarget;
    setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    setRenderedSize({ width: image.clientWidth, height: image.clientHeight });
  }, []);

  const syncRenderedSize = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    const next = { width: image.clientWidth, height: image.clientHeight };
    if (next.width <= 0 || next.height <= 0) return;
    setRenderedSize((prev) => (prev && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5 ? prev : next));
  }, []);

  useEffect(() => {
    syncRenderedSize();
    const image = imageRef.current;
    if (!image || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      syncRenderedSize();
    });
    observer.observe(image);
    return () => observer.disconnect();
  }, [syncRenderedSize, src]);

  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg) ${flipX ? 'scaleX(-1)' : ''}`;

  return (
    <div className={cn('relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background', className)}>
      {/* 画布区域 */}
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onDoubleClick={handleDoubleClick}
        style={{
          backgroundImage: 'conic-gradient(#2b3039 25%, #1d2129 0 50%, #2b3039 0 75%, #1d2129 0)',
          backgroundSize: '24px 24px',
          backgroundColor: '#1d2129'
        }}
      >
        <div className="pointer-events-none flex h-full w-full items-center justify-center">
          <div
            className="relative max-h-full max-w-full"
            style={{
              transform,
              transition: isPanning ? 'none' : 'transform 0.12s ease-out',
              transformOrigin: 'center center'
            }}
          >
            <img ref={imageRef} src={src} alt={title} className="pointer-events-none block select-none max-h-full max-w-full object-contain" onLoad={handleImageLoad} draggable={false} />
            {showOcrOverlay && hasOcrAnnotations && naturalSize && renderedSize && (
              <>
                <svg
                  className="pointer-events-none absolute left-0 top-0 overflow-visible"
                  viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  style={{
                    width: `${renderedSize.width}px`,
                    height: `${renderedSize.height}px`
                  }}
                >
                  {visibleOcrAnnotations.map((annotation) => (
                    <g key={annotation.id}>
                      <rect
                        x={annotation.x}
                        y={annotation.y}
                        width={annotation.width}
                        height={annotation.height}
                        rx={3}
                        ry={3}
                        fill="rgba(20, 184, 166, 0.12)"
                        stroke="rgba(20, 184, 166, 0.95)"
                        strokeWidth={Math.max(2, naturalSize.width / 900)}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  ))}
                </svg>
                <div
                  className="absolute left-0 top-0 select-text"
                  style={{
                    width: `${renderedSize.width}px`,
                    height: `${renderedSize.height}px`,
                    pointerEvents: 'none'
                  }}
                >
                  {visibleOcrAnnotations.map((annotation) => (
                    <div
                      key={`text:${annotation.id}`}
                      data-ocr-text-layer="true"
                      className="absolute select-text overflow-hidden whitespace-pre-wrap break-words"
                      title={annotation.text}
                      style={{
                        left: `${(annotation.x / naturalSize.width) * renderedSize.width}px`,
                        top: `${(annotation.y / naturalSize.height) * renderedSize.height}px`,
                        width: `${(annotation.width / naturalSize.width) * renderedSize.width}px`,
                        height: `${(annotation.height / naturalSize.height) * renderedSize.height}px`,
                        alignItems: 'center',
                        boxSizing: 'border-box',
                        color: 'transparent',
                        caretColor: 'transparent',
                        display: 'flex',
                        fontSize: `${Math.max(8, Math.min(16, annotation.height * 0.6))}px`,
                        justifyContent: 'center',
                        lineHeight: 1.05,
                        pointerEvents: 'auto',
                        textAlign: 'center',
                        userSelect: 'text',
                        WebkitUserSelect: 'text',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {annotation.text}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 控制栏 */}
      <div className="shrink-0 overflow-visible border-t bg-background/95 px-2 py-1 text-[11px]">
        <div className="flex min-h-10 items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={zoomOut}>
              <TbZoomOut />
            </Button>
            <span className="min-w-[46px] text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={zoomIn}>
              <TbZoomIn />
            </Button>

            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={resetView}>
              <TbArrowBackUp />
            </Button>
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={hasOcrAnnotations && showOcrOverlay ? 'secondary' : 'ghost'}
                    className={cn('h-8 w-8', !hasOcrAnnotations && 'cursor-not-allowed opacity-45')}
                    aria-disabled={!hasOcrAnnotations}
                    onClick={() => {
                      if (!hasOcrAnnotations) return;
                      setShowOcrOverlay((prev) => !prev);
                    }}
                  >
                    {showOcrOverlay ? <TbScanEye /> : <TbEyeOff />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{ocrOverlayTooltip}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex flex-1 items-center justify-center gap-1 text-muted-foreground">
            <TbArrowsMove className="h-3 w-3" />
            <span>鼠标拖拽平移，滚轮缩放，双击重置</span>
          </div>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={rotateLeft}>
              <TbRotate2 />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={rotateRight}>
              <TbRotateClockwise2 />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleFlipX}>
              <TbFlipHorizontal />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={resetView}>
              <TbArrowsMaximize />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
