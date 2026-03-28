import React, { useCallback } from 'react';
import { TbX } from 'react-icons/tb';

import DownloadBubble from './DownloadBubble';

/**
 * DownloadFloating — the root component for the floating download window.
 *
 * The entire window is draggable except interactive elements (stop button, close button).
 */
const DownloadFloating: React.FC = () => {
  const handleClose = useCallback(() => {
    window.YUA?.window?.['window:close']?.('downloadFloating');
  }, []);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Entire shell is draggable */}
      <div
        className="dl-floating-shell flex flex-col rounded-2xl overflow-hidden bg-card/95 backdrop-blur-xl border border-border/40 shadow-2xl shadow-black/10 relative"
        style={{ WebkitAppRegion: 'drag', cursor: 'grab' } as React.CSSProperties}
      >
        {/* Close button – top-right corner */}
        <button
          className="dl-floating-close absolute top-1.5 right-1.5 z-10 w-5 h-5 flex items-center justify-center rounded-full hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
          onClick={handleClose}
          title="关闭"
          style={{ WebkitAppRegion: 'no-drag', cursor: 'pointer' } as React.CSSProperties}
        >
          <TbX className="w-3 h-3" />
        </button>

        {/* Main content – the reusable DownloadBubble */}
        <DownloadBubble
          hookOptions={{
            autoCloseOnComplete: true,
            autoCloseDelay: 4000
          }}
          hideWhenEmpty={false}
          size={56}
        />
      </div>
    </div>
  );
};

export default DownloadFloating;
