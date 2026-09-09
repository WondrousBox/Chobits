import type { SpritePresentationConfig } from '@packages/sprite-core/types';
import { createElement, useEffect, useRef } from 'react';

import type { SpriteRendererProps } from '.';
import { useRegisteredLive2DRenderer } from './live2d-renderer-registry';

type Live2DPresentation = Extract<SpritePresentationConfig, { renderer: 'live2d' }>;

let missingRendererLogged = false;

export function Live2DRendererSlot({ onFirstFrame, ...props }: SpriteRendererProps & { presentation: Live2DPresentation }): JSX.Element {
  const RendererComponent = useRegisteredLive2DRenderer();
  const firstFrameReportedRef = useRef(false);

  useEffect(() => {
    if (RendererComponent) return;
    if (!missingRendererLogged) {
      missingRendererLogged = true;
      console.warn('[SpriteLive2D] No Live2D renderer is registered');
    }
    if (!firstFrameReportedRef.current) {
      firstFrameReportedRef.current = true;
      onFirstFrame?.();
    }
  }, [RendererComponent, onFirstFrame]);

  if (RendererComponent) {
    return createElement(RendererComponent, { ...props, onFirstFrame });
  }

  return <div data-sprite-renderer="live2d" data-renderer-status="unregistered" style={{ width: props.width ?? 180, height: props.height ?? 240, background: 'transparent', pointerEvents: 'none' }} />;
}
