import React from 'react';
import { TbLoader2, TbMicrophone, TbMicrophoneOff, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import { Waveform, WaveformRef } from './Waveform';

interface ControlBarProps {
  isRecording: boolean;
  isLoading: boolean;
  isASRRunning: boolean;
  progressText: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClose: () => void;
  waveformRef: React.RefObject<WaveformRef>;
}

export const ControlBar: React.FC<ControlBarProps> = ({ isRecording, isLoading, isASRRunning, progressText, onStartRecording, onStopRecording, onClose, waveformRef }) => {
  return (
    <div className="border-t bg-background drag-region">
      <div className="flex items-center justify-center relative overflow-hidden h-12 group">
        {progressText && (
          <div className="absolute top-1/2 -translate-y-1/2 right-0">
            <div className="font-bold whitespace-nowrap text-right text-primary overflow-hidden">{progressText || '\u200b'}</div>
          </div>
        )}

        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 no-drag z-10">
          {isRecording ? (
            <Button size="icon" variant="destructive" className="w-10 h-10 rounded-full no-drag" onClick={onStopRecording} disabled={isLoading}>
              <TbMicrophoneOff />
            </Button>
          ) : (
            <Button size="icon" className="w-10 h-10 rounded-full no-drag" onClick={onStartRecording} disabled={!isASRRunning || isLoading}>
              {isLoading ? <TbLoader2 className="animate-spin" /> : <TbMicrophone />}
            </Button>
          )}
          <Button size="icon" variant="outline" className="w-10 h-10 rounded-full no-drag" onClick={onClose} title="关闭">
            <TbX />
          </Button>
        </div>
        {/* 波形图 */}
        {isRecording && <Waveform ref={waveformRef} isRecording={isRecording} />}
      </div>
    </div>
  );
};
