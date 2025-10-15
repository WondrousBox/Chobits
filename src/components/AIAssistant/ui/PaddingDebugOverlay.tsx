/**
 * Padding 边界调试覆盖层
 * - 输入：padding，显示内核矩形与外层 padding 范围。
 */
import React from 'react'
import { ASSISTANT_WIDTH, ASSISTANT_HEIGHT } from '../constants'

export const PaddingDebugOverlay: React.FC<{ padding: number }> = ({ padding }) => {
  return (
    <div style={{ position: 'absolute', left: -padding, top: -padding, width: ASSISTANT_WIDTH + padding * 2, height: ASSISTANT_HEIGHT + padding * 2, pointerEvents: 'none', boxSizing: 'border-box', border: '1px dashed rgba(0,255,120,0.45)', backdropFilter: 'none' }}>
      <div style={{ position: 'absolute', left: padding, top: padding, width: ASSISTANT_WIDTH, height: ASSISTANT_HEIGHT, border: '1px solid rgba(255,80,0,0.5)', boxSizing: 'border-box' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, fontSize: 10, background: 'rgba(0,0,0,0.55)', color: '#0f0', padding: '2px 4px', fontFamily: 'monospace' }}>
        padding={padding}
      </div>
    </div>
  )
}

export default PaddingDebugOverlay
