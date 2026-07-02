import React, { useCallback, useState } from 'react';
import { TbPlayerPlay } from 'react-icons/tb';

interface CenterPlayButtonProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  className?: string;
}

export const CenterPlayButton: React.FC<CenterPlayButtonProps> = ({ isPlaying, onTogglePlay, className = '' }) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (isPlaying) return; // 如果正在播放，不显示按钮

      // 开始动画
      setIsAnimating(true);

      // 延迟触发播放，让动画有时间执行
      setTimeout(() => {
        onTogglePlay();
      }, 150); // 在动画进行到一半时触发播放

      // 动画完成后重置状态
      setTimeout(() => {
        setIsAnimating(false);
      }, 300);
    },
    [isPlaying, onTogglePlay]
  );

  // 只在暂停时显示按钮
  if (isPlaying) return null;

  return (
    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${className}`} onClick={handleClick} onDoubleClick={(event) => event.stopPropagation()}>
      <div
        className={`
          pointer-events-auto cursor-pointer transition-all duration-300 ease-out
          ${isAnimating ? 'scale-150 opacity-0' : 'scale-100 opacity-100 hover:scale-110'}
        `}
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          borderRadius: '50%',
          padding: '20px',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}
      >
        <TbPlayerPlay size={48} className="text-white ml-1" style={{ fill: 'white' }} />
      </div>
    </div>
  );
};
