import React, { useCallback, useRef, useState } from 'react';
import { TbArrowBackUp, TbArrowsMaximize, TbArrowsMove, TbFlipHorizontal, TbRotate2, TbRotateClockwise2, TbZoomIn, TbZoomOut } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImagePlayerProps {
  src: string;
  title?: string;
  className?: string;
}

export const ImagePlayer: React.FC<ImagePlayerProps> = ({ src, title, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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
    event.preventDefault();
    isPanningRef.current = true;
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

  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg) ${flipX ? 'scaleX(-1)' : ''}`;

  return (
    <div className={cn('relative flex h-full w-full flex-col overflow-hidden bg-background', className)}>
      {/* 画布区域 */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onDoubleClick={handleDoubleClick}
        style={{
          backgroundImage:
            'linear-gradient(45deg, rgba(0,0,0,0.10) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.10) 75%),' +
            'linear-gradient(45deg, rgba(255,255,255,0.10) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.10) 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 8px 8px',
          backgroundColor: 'hsl(var(--background))'
        }}
      >
        <div className="pointer-events-none flex h-full w-full items-center justify-center">
          <img
            src={src}
            alt={title}
            className="pointer-events-none select-none max-h-full max-w-full object-contain"
            style={{
              transform,
              transition: isPanningRef.current ? 'none' : 'transform 0.12s ease-out',
              transformOrigin: 'center center'
            }}
            draggable={false}
          />
        </div>
      </div>

      {/* 控制栏 */}
      <div className="flex items-center justify-between gap-2 border-t bg-background/95 px-2 py-1 text-[11px]">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={zoomOut}>
            <TbZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[46px] text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={zoomIn}>
            <TbZoomIn className="h-4 w-4" />
          </Button>

          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={resetView}>
            <TbArrowBackUp className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center gap-1 text-muted-foreground">
          <TbArrowsMove className="h-3 w-3" />
          <span>鼠标拖拽平移，滚轮缩放，双击重置</span>
        </div>

        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={rotateLeft}>
            <TbRotate2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={rotateRight}>
            <TbRotateClockwise2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleFlipX}>
            <TbFlipHorizontal className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={resetView}>
            <TbArrowsMaximize className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
