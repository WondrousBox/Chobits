/**
 * Padding 边界调试覆盖层
 * - 根据当前精灵动画定义显示内核矩形与外层 padding 范围。
 */
import React from 'react';

import { DEFAULT_ASSISTANT_PADDING, SHOW_PADDING_DEBUG } from '../constants';
import { useSpritePlayer } from '../context/SpritePlayerContext';

export const PaddingDebugOverlay: React.FC<{ padding: number }> = ({ padding }) => {
  const { current: currentSprite } = useSpritePlayer();

  // 从当前精灵动画定义中获取尺寸，如果没有则使用默认值
  const width = currentSprite?.width ?? 180;
  const height = currentSprite?.height ?? 240;
  const spritePadding = currentSprite?.padding ?? DEFAULT_ASSISTANT_PADDING;

  // 使用精灵动画定义的 padding，如果没有则使用传入的 padding
  const actualPadding = spritePadding ?? padding;

  return SHOW_PADDING_DEBUG ? (
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
