/**
 * 状态指示器（右上角表情）
 * - 输入：isDragging / isWalking
 */
import React from 'react'

export const StatusIndicator: React.FC<{ isDragging: boolean; isWalking: boolean }> = ({ isDragging, isWalking }) => {
  return (
    <div className="absolute top-0 right-[10px] w-[30px] h-[30px] bg-white/90 border-2 border-indigo-500 rounded-full flex items-center justify-center text-sm shadow-[0_2px_10px_rgba(0,0,0,0.1)]">
      {isDragging ? '🫴' : isWalking ? '🚶‍♀️' : '😊'}
    </div>
  )
}

export default StatusIndicator
