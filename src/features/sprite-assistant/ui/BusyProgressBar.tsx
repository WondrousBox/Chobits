import React from 'react';

import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH } from '../constants';

interface BusyProgressBarProps {
  progress?: number; // 0-100
  message?: string;
}

export const BusyProgressBar: React.FC<BusyProgressBarProps> = ({ progress, message }) => {
  const showProgress = progress !== undefined;
  const progressValue = showProgress ? Math.max(0, Math.min(100, progress)) : 0;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{
        top: `-${ASSISTANT_HEIGHT * 0.15}px`,
        width: `${ASSISTANT_WIDTH * 1.2}px`
      }}
    >
      {/* 进度条容器 */}
      <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-indigo-200/50 p-2">
        {/* 消息文本 */}
        {message && <div className="text-xs text-gray-700 mb-1 text-center font-medium truncate">{message}</div>}

        {/* 进度条 */}
        {showProgress && (
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out rounded-full" style={{ width: `${progressValue}%` }} />
          </div>
        )}

        {/* 无进度时的加载指示器 */}
        {!showProgress && (
          <div className="flex items-center justify-center gap-1.5 h-2">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1s' }} />
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1s' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BusyProgressBar;
