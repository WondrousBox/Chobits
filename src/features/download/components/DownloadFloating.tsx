import React, { useCallback } from 'react';
import { TbGripVertical, TbX } from 'react-icons/tb';

import DownloadBubble from './DownloadBubble';

/**
 * DownloadFloating — the root component for the floating download window.
 *
 * It wraps the reusable <DownloadBubble /> inside a **draggable, frameless shell**
 * so the user can freely position the window on screen.
 *
 * The Electron window is frameless & transparent; dragging is handled by
 * -webkit-app-region: drag on the title bar strip.
 */
const DownloadFloating: React.FC = () => {
  const handleClose = useCallback(() => {
    window.YUA?.window?.['window:close']?.('downloadFloating');
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Draggable & transparent shell */}
      <div className="dl-floating-shell flex flex-col rounded-2xl overflow-hidden bg-card/95 backdrop-blur-xl border border-border/40 shadow-2xl shadow-black/10">
        {/* Title bar – draggable area */}
        <div className="dl-floating-titlebar flex items-center justify-between px-3 py-1.5 cursor-grab active:cursor-grabbing select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TbGripVertical className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium tracking-wide uppercase opacity-60">下载</span>
          </div>
          <button
            className="dl-floating-close w-5 h-5 flex items-center justify-center rounded-full hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
            onClick={handleClose}
            title="关闭"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <TbX className="w-3 h-3" />
          </button>
        </div>

        {/* Main content – the reusable DownloadBubble */}
        <div className="flex-1 min-h-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <DownloadBubble
            hookOptions={{
              autoCloseOnComplete: true,
              autoCloseDelay: 4000
            }}
            hideWhenEmpty={false}
          />
        </div>
      </div>
    </div>
  );
};

export default DownloadFloating;
