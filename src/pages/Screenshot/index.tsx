import React, { useEffect, useState } from 'react';

const Screenshot: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleCapture = (_: any, dataURL: string) => {
      setImageSrc(dataURL);
    };

    window.ipcRenderer.on('screenshot:captured', handleCapture);

    return () => {
      window.ipcRenderer.off('screenshot:captured', handleCapture);
    };
  }, []);

  useEffect(() => {
    const handleReset = () => {
      setSelection(null);
      setIsDragging(false);
      setStartPos(null);
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

  const handleMouseDown = (e: React.MouseEvent) => {
    // If clicking on the toolbar, don't start dragging
    if ((e.target as HTMLElement).closest('.screenshot-toolbar')) return;

    window.ipcRenderer.invoke('screenshot:reset-other-selections');

    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    setSelection({ x: e.clientX, y: e.clientY, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !startPos) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const w = Math.abs(currentX - startPos.x);
    const h = Math.abs(currentY - startPos.y);

    setSelection({ x, y, w, h });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSave = async () => {
    if (!selection || !imageSrc) return;

    const canvas = document.createElement('canvas');
    canvas.width = selection.w;
    canvas.height = selection.h;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.src = imageSrc;
    await new Promise((resolve) => (img.onload = resolve));

    const scaleX = img.naturalWidth / window.innerWidth;
    const scaleY = img.naturalHeight / window.innerHeight;

    ctx?.drawImage(img, selection.x * scaleX, selection.y * scaleY, selection.w * scaleX, selection.h * scaleY, 0, 0, selection.w, selection.h);

    const dataURL = canvas.toDataURL('image/png');
    window.ipcRenderer.invoke('screenshot:save', { dataURL });
  };

  const handleClose = () => {
    window.ipcRenderer.invoke('screenshot:close');
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
        cursor: 'crosshair',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {imageSrc && <img src={imageSrc} style={{ width: '100%', height: '100%', objectFit: 'fill' }} draggable={false} />}

      {/* Dimmed overlay using 4 divs */}
      {selection && (
        <>
          {/* Top */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: selection.y, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          {/* Bottom */}
          <div style={{ position: 'absolute', top: selection.y + selection.h, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          {/* Left */}
          <div style={{ position: 'absolute', top: selection.y, left: 0, width: selection.x, height: selection.h, backgroundColor: 'rgba(0,0,0,0.5)' }} />
          {/* Right */}
          <div style={{ position: 'absolute', top: selection.y, left: selection.x + selection.w, right: 0, height: selection.h, backgroundColor: 'rgba(0,0,0,0.5)' }} />
        </>
      )}
      {!selection && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' }} />}

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
        />
      )}

      {selection && !isDragging && selection.w > 0 && (
        <div
          className="screenshot-toolbar"
          style={{
            position: 'absolute',
            left: Math.min(Math.max(0, selection.x + selection.w - 120), window.innerWidth - 130),
            top: selection.y + selection.h + 10 > window.innerHeight - 40 ? selection.y - 40 : selection.y + selection.h + 10,
            display: 'flex',
            gap: '10px',
            pointerEvents: 'auto',
            zIndex: 100,
            backgroundColor: 'white',
            padding: '5px',
            borderRadius: '4px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}
        >
          <button onClick={handleSave} style={{ cursor: 'pointer', padding: '5px 10px' }}>
            Save
          </button>
          <button onClick={handleClose} style={{ cursor: 'pointer', padding: '5px 10px' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default Screenshot;
