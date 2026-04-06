/**
 * Padding 边界调试覆盖层
 * - 根据当前精灵动画定义显示内核矩形与外层 padding 范围。
 * - 通过 spriteConfig.showDebugOverlay 运行时控制显隐。
 */
import React from 'react';

import { SHOW_PADDING_DEBUG } from '../constants';
import { useSpriteState } from '../context/SpriteStateContext';

export const PaddingDebugOverlay: React.FC<{ padding: number }> = ({ padding }) => {
  const { spriteConfig } = useSpriteState();

  const width = spriteConfig.width;
  const height = spriteConfig.height;
  const actualPadding = spriteConfig.padding ?? padding;
  const show = spriteConfig.showDebugOverlay ?? SHOW_PADDING_DEBUG;

  return show ? (
    <div
      style={{
        position: 'absolute',
        left: -actualPadding,
        top: -actualPadding,
        width: width + actualPadding * 2,
        height: height + actualPadding * 2,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        border: '1px dashed rgba(0,255,120,0.45)',
        backdropFilter: 'none'
      }}
    >
      <div style={{ position: 'absolute', left: actualPadding, top: actualPadding, width: width, height: height, border: '1px solid rgba(255,80,0,0.5)', boxSizing: 'border-box' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, fontSize: 10, background: 'rgba(0,0,0,0.55)', color: '#0f0', padding: '2px 4px', fontFamily: 'monospace' }}>
        padding={actualPadding} | {width}×{height}
      </div>
    </div>
  ) : null;
};

export default PaddingDebugOverlay;
