import React from 'react';

import { Waveform, WaveformRef } from './Waveform';

interface ControlBarProps {
  isRecording: boolean;
  progressText: string;
  waveformRef: React.RefObject<WaveformRef>;
  isTransparent?: boolean;
}

export const ControlBar: React.FC<ControlBarProps> = ({ isRecording, progressText, waveformRef, isTransparent = false }) => {
  return (
    <div className={`border-t drag-region ${isTransparent ? 'bg-transparent border-transparent' : 'bg-background'}`}>
      <div className="flex items-center justify-center relative overflow-hidden h-12 group">
        {/* 左侧渐变遮罩 */}
        <div className={`absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r z-10 pointer-events-none ${isTransparent ? 'from-transparent to-transparent' : 'from-background to-transparent'}`} />
        {/* 右侧渐变遮罩 */}
        {/* <div className={`absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l z-10 pointer-events-none ${isTransparent ? 'from-transparent to-transparent' : 'from-background to-transparent'}`} /> */}
        {progressText && (
          <div className="absolute top-1/2 -translate-y-1/2 right-0 z-0">
            <div className={`font-bold text-xl whitespace-nowrap text-right overflow-hidden ${isTransparent ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]' : ''}`}>
              {progressText || '\u200b'}
            </div>
          </div>
        )}
        {/* 波形图 */}
        {isRecording && <Waveform ref={waveformRef} isRecording={isRecording} />}
      </div>
    </div>
  );
};
