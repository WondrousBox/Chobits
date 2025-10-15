/**
 * 拖拽准备进度指示组件
 * - 输入：progress (0~1)，0/1 之外显示动画圈。
 */
import React from 'react'

export const DragProgressIndicator: React.FC<{ progress: number }> = ({ progress }) => {
  if (progress <= 0 || progress >= 1) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 flex items-center justify-center">
        <div
          className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"
          style={{
            animationDuration: '2s',
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite'
          }}
        />
      </div>
    </div>
  )
}

export default DragProgressIndicator
