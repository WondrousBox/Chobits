import React, { useEffect, useRef, useState } from 'react';
import { TbArrowUpRight, TbCheck, TbCircle, TbDownload, TbPencil, TbSquare, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

type Tool = 'select' | 'rect' | 'circle' | 'arrow' | 'brush' | 'text';

interface Annotation {
  type: Tool;
  x: number;
  y: number;
  w?: number;
  h?: number;
  points?: { x: number; y: number }[];
  color: string;
  text?: string;
}

const Screenshot: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);

  // Tools
  const [tool, setTool] = useState<Tool>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [color, setColor] = useState('#ff0000');

  // The scale factor of the display this screenshot window is on
  const [displayScaleFactor, setDisplayScaleFactor] = useState<number>(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Capture the screen using getUserMedia at native physical resolution.
    // This avoids the macOS DPI scaling issue with desktopCapturer thumbnails
    // on mixed-DPI multi-monitor setups.
    const handleCaptureSource = async (_: any, info: { sourceId: string; scaleFactor: number; width: number; height: number }) => {
      const { sourceId, scaleFactor, width, height } = info;
      if (scaleFactor > 0) {
        setDisplayScaleFactor(scaleFactor);
      }

      const physicalWidth = width * scaleFactor;
      const physicalHeight = height * scaleFactor;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: physicalWidth,
              maxWidth: physicalWidth,
              minHeight: physicalHeight,
              maxHeight: physicalHeight
            }
          } as any
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();

        // Wait for the video to have actual frame data
        await new Promise<void>((resolve) => {
          const check = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          check();
        });

        // Draw the video frame to an offscreen canvas at full physical resolution
        const offscreen = document.createElement('canvas');
        offscreen.width = video.videoWidth;
        offscreen.height = video.videoHeight;
        const offCtx = offscreen.getContext('2d');
        if (offCtx) {
          offCtx.drawImage(video, 0, 0);
        }

        // Stop the stream immediately
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;

        const dataURL = offscreen.toDataURL('image/png');
        setImageSrc(dataURL);
        setImgSize({ w: offscreen.width, h: offscreen.height });

        // Signal main process that capture is done — it will now show the window
        window.ipcRenderer.invoke('screenshot:ready');
      } catch (err) {
        console.error('[screenshot] getUserMedia capture failed:', err);
      }
    };

    window.ipcRenderer.on('screenshot:capture-source', handleCaptureSource);

    return () => {
      window.ipcRenderer.off('screenshot:capture-source', handleCaptureSource);
    };
  }, []);

  useEffect(() => {
    const handleReset = () => {
      setSelection(null);
      setIsDragging(false);
      setStartPos(null);
      setAnnotations([]);
      setTool('select');
    };
    window.ipcRenderer.on('screenshot:reset-selection', handleReset);
    return () => {
      window.ipcRenderer.off('screenshot:reset-selection', handleReset);
    };
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.ipcRenderer.invoke('screenshot:close');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Draw annotations
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;

    const drawItem = (ann: Annotation) => {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.beginPath();

      if (ann.type === 'rect') {
        ctx.strokeRect(ann.x, ann.y, ann.w || 0, ann.h || 0);
      } else if (ann.type === 'circle') {
        const w = ann.w || 0;
        const h = ann.h || 0;
        ctx.ellipse(ann.x + w / 2, ann.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (ann.type === 'arrow') {
        // Simple arrow
        const startX = ann.x;
        const startY = ann.y;
        const endX = ann.x + (ann.w || 0);
        const endY = ann.y + (ann.h || 0);

        const headlen = 15;
        const dx = endX - startX;
        const dy = endY - startY;
        const angle = Math.atan2(dy, dx);

        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (ann.type === 'brush' && ann.points) {
        if (ann.points.length > 0) {
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
        }
      }
    };

    annotations.forEach(drawItem);
    if (currentAnnotation) drawItem(currentAnnotation);
  }, [annotations, currentAnnotation, window.innerWidth, window.innerHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.screenshot-toolbar')) return;

    const cx = e.clientX;
    const cy = e.clientY;

    // If we have a selection
    if (selection) {
      // Check if inside selection
      const inside = cx >= selection.x && cx <= selection.x + selection.w && cy >= selection.y && cy <= selection.y + selection.h;

      if (tool !== 'select') {
        // Start drawing
        if (inside) {
          setIsDragging(true);
          setStartPos({ x: cx, y: cy });
          if (tool === 'brush') {
            setCurrentAnnotation({ type: 'brush', x: 0, y: 0, points: [{ x: cx, y: cy }], color });
          } else {
            setCurrentAnnotation({ type: tool, x: cx, y: cy, w: 0, h: 0, color });
          }
        }
        return;
      }

      if (inside) {
        // Move selection
        setIsMoving(true);
        setDragOffset({ x: cx - selection.x, y: cy - selection.y });
      }
      // If outside, do nothing (disable new selection)
      return;
    }

    // Start new selection
    window.ipcRenderer.invoke('screenshot:reset-other-selections');
    setIsDragging(true);
    setStartPos({ x: cx, y: cy });
    setSelection({ x: cx, y: cy, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const cx = e.clientX;
    const cy = e.clientY;
    setMousePos({ x: cx, y: cy });

    if (isMoving && selection && dragOffset) {
      let newX = cx - dragOffset.x;
      let newY = cy - dragOffset.y;

      // Constrain to screen
      newX = Math.max(0, Math.min(newX, window.innerWidth - selection.w));
      newY = Math.max(0, Math.min(newY, window.innerHeight - selection.h));

      setSelection({ ...selection, x: newX, y: newY });
      return;
    }

    if (!isDragging || !startPos) return;

    if (tool !== 'select' && currentAnnotation) {
      // Update drawing
      if (tool === 'brush') {
        setCurrentAnnotation({
          ...currentAnnotation,
          points: [...(currentAnnotation.points || []), { x: cx, y: cy }]
        });
      } else {
        setCurrentAnnotation({
          ...currentAnnotation,
          w: cx - startPos.x,
          h: cy - startPos.y
        });
      }
      return;
    }

    // Creating selection
    if (!selection) return; // Should not happen if logic is correct

    const x = Math.min(startPos.x, cx);
    const y = Math.min(startPos.y, cy);
    const w = Math.abs(cx - startPos.x);
    const h = Math.abs(cy - startPos.y);

    setSelection({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (currentAnnotation) {
      // Normalize rect/circle/arrow
      const finalAnn = { ...currentAnnotation };
      if (finalAnn.type !== 'brush') {
        if ((finalAnn.w || 0) < 0) {
          finalAnn.x += finalAnn.w || 0;
          finalAnn.w = Math.abs(finalAnn.w || 0);
        }
        if ((finalAnn.h || 0) < 0) {
          finalAnn.y += finalAnn.h || 0;
          finalAnn.h = Math.abs(finalAnn.h || 0);
        }
      }
      setAnnotations([...annotations, finalAnn]);
      setCurrentAnnotation(null);
    }

    setIsDragging(false);
    setIsMoving(false);
    setDragOffset(null);
  };

  const handleSave = async () => {
    if (!selection || !imageSrc) return;
    await processSave('save');
  };

  const handleConfirm = async () => {
    if (!selection || !imageSrc) return;
    await processSave('copy');
  };

  const processSave = async (action: 'save' | 'copy') => {
    if (!selection || !imageSrc) return;

    // Use the display's scale factor so the output image is at physical pixel resolution.
    // This ensures crisp output on all displays regardless of DPI.
    const dpr = displayScaleFactor;

    const canvas = document.createElement('canvas');
    canvas.width = selection.w * dpr;
    canvas.height = selection.h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    await new Promise((resolve) => (img.onload = resolve));

    const scaleX = img.naturalWidth / window.innerWidth;
    const scaleY = img.naturalHeight / window.innerHeight;

    // Draw background image cropped at full physical resolution
    ctx.drawImage(img, selection.x * scaleX, selection.y * scaleY, selection.w * scaleX, selection.h * scaleY, 0, 0, selection.w * dpr, selection.h * dpr);

    // Draw annotations cropped
    // The annotations are in CSS/screen coordinates.
    // Scale the context to match the physical pixel output, then translate for selection offset.
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(-selection.x, -selection.y);

    // Re-draw annotations on this new canvas
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;

    annotations.forEach((ann) => {
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.beginPath();

      if (ann.type === 'rect') {
        ctx.strokeRect(ann.x, ann.y, ann.w || 0, ann.h || 0);
      } else if (ann.type === 'circle') {
        const w = ann.w || 0;
        const h = ann.h || 0;
        ctx.ellipse(ann.x + w / 2, ann.y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (ann.type === 'arrow') {
        const startX = ann.x;
        const startY = ann.y;
        const endX = ann.x + (ann.w || 0);
        const endY = ann.y + (ann.h || 0);

        const headlen = 15;
        const dx = endX - startX;
        const dy = endY - startY;
        const angle = Math.atan2(dy, dx);

        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle - Math.PI / 6), endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headlen * Math.cos(angle + Math.PI / 6), endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (ann.type === 'brush' && ann.points) {
        if (ann.points.length > 0) {
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
        }
      }
    });
    ctx.restore();

    const dataURL = canvas.toDataURL('image/png');

    if (action === 'save') {
      window.ipcRenderer.invoke('screenshot:save', { dataURL });
    } else {
      // Copy to clipboard
      const item = new ClipboardItem({ 'image/png': await (await fetch(dataURL)).blob() });
      await navigator.clipboard.write([item]);
      window.ipcRenderer.invoke('screenshot:close');
    }
  };

  const handleClose = () => {
    window.ipcRenderer.invoke('screenshot:close');
  };

  const renderMagnifier = () => {
    if (!mousePos || !imageSrc || !imgSize) return null;
    if (selection && !isDragging && !isMoving) return null; // Hide when selection is done and not moving
    if (isMoving) return null; // Hide when moving selection

    const ZOOM = 3;
    const SIZE = 120;
    const HALF = SIZE / 2;

    const scaleX = imgSize.w / window.innerWidth;
    const scaleY = imgSize.h / window.innerHeight;

    const imgX = mousePos.x * scaleX;
    const imgY = mousePos.y * scaleY;

    const bgPosX = HALF - imgX * ZOOM;
    const bgPosY = HALF - imgY * ZOOM;

    const bgSizeW = imgSize.w * ZOOM;
    const bgSizeH = imgSize.h * ZOOM;

    let top = mousePos.y + 20;
    let left = mousePos.x + 20;

    if (left + SIZE > window.innerWidth) left = mousePos.x - SIZE - 20;
    if (top + SIZE + 60 > window.innerHeight) top = mousePos.y - SIZE - 60;

    return (
      <div
        style={{
          position: 'absolute',
          top,
          left,
          width: SIZE,
          zIndex: 9999,
          pointerEvents: 'none',
          border: '1px solid rgba(255,255,255,0.5)',
          boxShadow: '0 0 4px rgba(0,0,0,0.3)',
          backgroundColor: 'black',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '4px',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: SIZE,
            height: SIZE,
            position: 'relative',
            overflow: 'hidden',
            backgroundImage: `url(${imageSrc})`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: `${bgPosX}px ${bgPosY}px`,
            backgroundSize: `${bgSizeW}px ${bgSizeH}px`,
            imageRendering: 'pixelated'
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: HALF - 1, bottom: 0, width: 2, backgroundColor: 'rgba(0, 255, 255, 0.5)' }} />
          <div style={{ position: 'absolute', left: 0, top: HALF - 1, right: 0, height: 2, backgroundColor: 'rgba(0, 255, 255, 0.5)' }} />
        </div>
        <div style={{ padding: '4px 8px', color: 'white', fontSize: '10px', fontFamily: 'sans-serif', backgroundColor: 'rgba(0,0,0,0.7)', lineHeight: '1.4' }}>
          <div>
            X: {mousePos.x} Y: {mousePos.y}
          </div>
          <div style={{ color: '#aaa' }}>{isDragging ? 'Release to finish' : 'Drag to select'}</div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="screenshot-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        width: '100vw',
        height: '100vh',
        cursor: selection ? (tool === 'select' ? (isMoving ? 'move' : 'default') : 'crosshair') : 'crosshair',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {imageSrc && <img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'fill' }} draggable={false} />}

      {/* Annotation Canvas */}
      <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 50 }} />

      {renderMagnifier()}

      {/* Dimmed overlay */}
      {selection && (
        <>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: selection.y, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: selection.y + selection.h, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: selection.y, left: 0, width: selection.x, height: selection.h, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: selection.y, left: selection.x + selection.w, right: 0, height: selection.h, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        </>
      )}
      {!selection && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' }} />}

      {/* Selection Border */}
      {selection && (
        <div
          style={{
            position: 'absolute',
            left: selection.x,
            top: selection.y,
            width: selection.w,
            height: selection.h,
            border: '2px solid #00bfff',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)',
            pointerEvents: 'none'
          }}
        >
          {/* Size Indicator */}
          <div
            style={{
              position: 'absolute',
              top: -25,
              left: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '12px',
              whiteSpace: 'nowrap'
            }}
          >
            {Math.round(selection.w * displayScaleFactor)} × {Math.round(selection.h * displayScaleFactor)}
          </div>
        </div>
      )}

      {/* Toolbar */}
      {selection && !isDragging && !isMoving && selection.w > 0 && (
        <div
          className="screenshot-toolbar bg-background"
          style={{
            position: 'absolute',
            left: Math.min(Math.max(0, selection.x + selection.w - 280), window.innerWidth - 300),
            top: selection.y + selection.h + 10 > window.innerHeight - 50 ? selection.y - 50 : selection.y + selection.h + 10,
            display: 'flex',
            gap: '8px',
            pointerEvents: 'auto',
            zIndex: 100,
            padding: '8px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            alignItems: 'center'
          }}
        >
          <Button size="icon" variant={'ghost'} onClick={() => setTool('rect')} className={`p-2 rounded w-8 h-8 ${tool === 'rect' ? 'bg-blue-100 text-blue-600' : ''}`} title="Rectangle">
            <TbSquare size={18} />
          </Button>
          <Button size="icon" variant={'ghost'} onClick={() => setTool('circle')} className={`p-2 rounded w-8 h-8 ${tool === 'circle' ? 'bg-blue-100 text-blue-600' : ''}`} title="Circle">
            <TbCircle size={18} />
          </Button>
          <Button size="icon" variant={'ghost'} onClick={() => setTool('arrow')} className={`p-2 rounded w-8 h-8 ${tool === 'arrow' ? 'bg-blue-100 text-blue-600' : ''}`} title="Arrow">
            <TbArrowUpRight size={18} />
          </Button>
          <Button size="icon" variant={'ghost'} onClick={() => setTool('brush')} className={`p-2 rounded w-8 h-8 ${tool === 'brush' ? 'bg-blue-100 text-blue-600' : ''}`} title="Brush">
            <TbPencil size={18} />
          </Button>
          <Button size="icon" variant={'ghost'} onClick={handleClose} className="p-2 rounded text-red-600 w-8 h-8" title="Cancel">
            <TbX size={18} />
          </Button>
          <Button size="icon" variant={'ghost'} onClick={handleSave} className="p-2 rounded w-8 h-8" title="Save to File">
            <TbDownload size={18} />
          </Button>
          <Button size="icon" variant={'ghost'} onClick={handleConfirm} className="p-2 rounded w-8 h-8" title="Copy & Close">
            <TbCheck size={18} />
          </Button>
        </div>
      )}
    </div>
  );
};

export default Screenshot;
