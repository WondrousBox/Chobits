import { useEffect, useRef } from 'react';

import { initLive2DRuntime, destroyLive2DRuntime } from '../live2d/Live2DRuntime';

const CANVAS_ID = 'live2d-assistant-canvas';
const MODEL_BASE_URL = 'res://local/sprites/live2d/';
const MODEL_DIR = 'mao_pro/runtime';
const MODEL_FILE = 'mao_pro';

export default function Live2DSprite({ width, height, walkDirection }: { width?: number; height?: number; walkDirection?: 'left' | 'right' | null }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let mounted = true;

    const boot = async (): Promise<void> => {
      try {
        await initLive2DRuntime({
          canvasId: CANVAS_ID,
          model: {
            resourcesBaseUrl: MODEL_BASE_URL,
            modelDir: MODEL_DIR,
            modelFileName: MODEL_FILE
          }
        });
      } catch (error) {
        console.error('[Live2DSprite] init failed', error);
      }
    };

    void boot();

    return () => {
      mounted = false;
      destroyLive2DRuntime();
    };
  }, []);

  const w = width ?? 300;
  const h = height ?? 400;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: w,
        height: h,
        userSelect: 'none',
        transform: walkDirection === 'right' ? 'scaleX(-1)' : 'none',
        transformOrigin: 'center center'
      }}
    >
      <canvas
        id={CANVAS_ID}
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  );
}
