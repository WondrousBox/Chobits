/**
 * useWalkAnimation
 * - 负责：窗口的行走动画（贝塞尔曲线路径 + 30fps IPC 节流），并暴露停止方法。
 * - 返回：{ animateMoveWindow(x,y), stopWalking(), isWalking }
 */
import { useCallback, useRef, useState } from 'react';

import { bezierQ, clamp, lerp } from '@/lib/helpers';

import { DEFAULT_WALK_SPEED, FRAME_INTERVAL, PATH_CURVE_FACTOR, STEP_GRID } from '../constants';

export function useWalkAnimation(): {
  animateMoveWindow: (targetX: number, targetY: number) => Promise<void>;
  stopWalking: () => void;
  isWalking: boolean;
  walkDirection: 'left' | 'right' | null;
} {
  const [isWalking, setIsWalking] = useState(false);
  const [walkDirection, setWalkDirection] = useState<'left' | 'right' | null>(null);
  const autoWalkRef = useRef(false);
  const animationFrameRef = useRef<number>();
  const cancelAnimRef = useRef({ cancelled: false });
  const lastIpcSendRef = useRef(0);

  const animateMoveWindow = useCallback(async (targetX: number, targetY: number) => {
    cancelAnimRef.current = { cancelled: false };
    setIsWalking(true);

    const [sx, sy] = await window.YUA.window['window:position:get']();
    const startX = sx,
      startY = sy;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const totalDist = Math.hypot(dx, dy);
    if (totalDist < 1) {
      setIsWalking(false);
      setWalkDirection(null);
      return;
    }

    // 判断移动方向：向右移动需要翻转动画
    const direction: 'left' | 'right' = dx > 0 ? 'right' : 'left';
    setWalkDirection(direction);

    const mx = (startX + targetX) / 2;
    const my = (startY + targetY) / 2;
    const nx = -dy / (totalDist || 1);
    const ny = dx / (totalDist || 1);
    const curve = totalDist * PATH_CURVE_FACTOR * (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? -1 : 1);
    const cx = mx + nx * curve;
    const cy = my + ny * curve;

    const samples = Math.max(20, Math.ceil(totalDist / STEP_GRID));
    const points: Array<{ x: number; y: number; d: number }> = [];
    let last = { x: startX, y: startY };
    let acc = 0;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const x = bezierQ(startX, cx, targetX, t);
      const y = bezierQ(startY, cy, targetY, t);
      const seg = Math.hypot(x - last.x, y - last.y);
      acc += seg;
      points.push({ x, y, d: acc });
      last = { x, y };
    }

    return new Promise<void>((resolve) => {
      let lastT = performance.now();
      let progressed = 0;
      lastIpcSendRef.current = 0;

      const step = (now: number): void => {
        if (cancelAnimRef.current.cancelled) {
          setIsWalking(false);
          resolve();
          return;
        }
        const dt = now - lastT;
        lastT = now;
        progressed = clamp(progressed + (DEFAULT_WALK_SPEED * dt) / 1000, 0, acc);

        let idx = 0;
        while (idx < points.length && points[idx].d < progressed) idx++;
        const prevD = idx === 0 ? 0 : points[idx - 1].d;
        const prevX = idx === 0 ? startX : points[idx - 1].x;
        const prevY = idx === 0 ? startY : points[idx - 1].y;
        const cur = points[Math.min(idx, points.length - 1)];
        const segLen = Math.max(1e-6, cur.d - prevD);
        const segT = clamp((progressed - prevD) / segLen, 0, 1);

        const x = lerp(prevX, cur.x, segT);
        const y = lerp(prevY, cur.y, segT);

        if (lastIpcSendRef.current === 0 || now - lastIpcSendRef.current >= FRAME_INTERVAL || progressed >= acc) {
          lastIpcSendRef.current = now;
          window.YUA.window['window:move']({ x: Math.round(x), y: Math.round(y) });
        }

        if (progressed < acc) {
          animationFrameRef.current = requestAnimationFrame(step);
        } else {
          setIsWalking(false);
          setWalkDirection(null);
          resolve();
        }
      };

      animationFrameRef.current = requestAnimationFrame(step);
    });
  }, []);

  const cancelAnimation = useCallback(() => {
    cancelAnimRef.current.cancelled = true;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  const stopWalking = useCallback(() => {
    autoWalkRef.current = false;
    cancelAnimation();
    setIsWalking(false);
    setWalkDirection(null);
  }, [cancelAnimation]);

  return { animateMoveWindow, stopWalking, isWalking, walkDirection };
}

export default useWalkAnimation;
