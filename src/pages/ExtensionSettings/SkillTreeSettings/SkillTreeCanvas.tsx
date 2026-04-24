/**
 * SkillTreeCanvas — 全 Canvas 径向星座技能树组件
 *
 * 承载一个全屏 <canvas>, 通过 SkillTreeRenderer 绘制所有内容,
 * 处理鼠标拖拽 / 缩放 / 悬浮 / 点击等交互.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

import { type Camera, type RenderData, SkillTreeRenderer } from './SkillTreeCanvasRenderer';
import { type SkillStatus } from './skillTreeData';

interface SkillTreeCanvasProps {
  skillStatuses: Record<string, SkillStatus>;
  selectedSkill: string | null;
  onSelectSkill: (skillId: string) => void;
}

const SkillTreeCanvas: React.FC<SkillTreeCanvasProps> = ({ skillStatuses, selectedSkill, onSelectSkill }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SkillTreeRenderer | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Mutable state refs (avoid re-mount animation on every state change)
  const stateRef = useRef<RenderData>({ skillStatuses, selectedSkill, hoveredSkill: null });

  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);
  const dragDistRef = useRef(0);

  // Keep stateRef in sync via effect
  useEffect(() => {
    stateRef.current.skillStatuses = skillStatuses;
    stateRef.current.selectedSkill = selectedSkill;
    stateRef.current.hoveredSkill = hoveredSkill;
  }, [skillStatuses, selectedSkill, hoveredSkill]);

  // --- Initialize renderer & canvas ---
  useEffect(() => {
    rendererRef.current = new SkillTreeRenderer();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    rendererRef.current.init(rect.width, rect.height);
    cameraRef.current.zoom = Math.min(1.5, Math.min(rect.width, rect.height) / 800);

    // Resize handling
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const d = window.devicePixelRatio || 1;
        canvas.width = width * d;
        canvas.height = height * d;
        rendererRef.current?.init(width, height);
      }
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, []);

  // --- Animation loop (mount once) ---
  useEffect(() => {
    const animate = (now: number): void => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      const dt = lastTimeRef.current ? Math.min((now - lastTimeRef.current) / 1000, 0.05) : 0.016;
      lastTimeRef.current = now;

      ctx.save();
      ctx.scale(dpr, dpr);
      renderer.draw(ctx, W, H, cameraRef.current, stateRef.current, dt);
      ctx.restore();

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // --- Camera helpers ---
  const screenToWorld = useCallback((sx: number, sy: number): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const cam = cameraRef.current;
    return {
      x: (sx - W / 2) / cam.zoom + cam.x,
      y: (sy - H / 2) / cam.zoom + cam.y
    };
  }, []);

  // --- Mouse handlers ---
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setIsDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, cx: cameraRef.current.x, cy: cameraRef.current.y };
    dragDistRef.current = 0;
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.sx;
        const dy = e.clientY - dragRef.current.sy;
        dragDistRef.current = Math.max(dragDistRef.current, Math.abs(dx) + Math.abs(dy));
        const cam = cameraRef.current;
        cam.x = dragRef.current.cx - dx / cam.zoom;
        cam.y = dragRef.current.cy - dy / cam.zoom;
        return;
      }

      // Hover detection
      const world = screenToWorld(mx, my);
      const hit = rendererRef.current?.hitTest(world.x, world.y) ?? null;
      setHoveredSkill(hit);
    },
    [screenToWorld]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const wasDrag = dragDistRef.current > 5;
      setIsDragging(false);
      dragRef.current = null;

      if (!wasDrag) {
        // Click
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const world = screenToWorld(mx, my);
        const hit = rendererRef.current?.hitTest(world.x, world.y) ?? null;
        if (hit) onSelectSkill(hit);
      }
    },
    [screenToWorld, onSelectSkill]
  );

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    dragRef.current = null;
    setHoveredSkill(null);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    const W = (canvasRef.current?.width ?? 0) / dpr;
    const H = (canvasRef.current?.height ?? 0) / dpr;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cam = cameraRef.current;

    // World position under cursor before zoom
    const wx = (mx - W / 2) / cam.zoom + cam.x;
    const wy = (my - H / 2) / cam.zoom + cam.y;

    const factor = e.ctrlKey || e.metaKey ? 0.005 : 0.0015;
    const newZoom = Math.max(0.25, Math.min(3, cam.zoom * (1 - e.deltaY * factor)));

    // Adjust camera so world position stays under cursor
    cam.x = wx - (mx - W / 2) / newZoom;
    cam.y = wy - (my - H / 2) / newZoom;
    cam.zoom = newZoom;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ cursor: isDragging ? 'grabbing' : hoveredSkill ? 'pointer' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
    />
  );
};

export default SkillTreeCanvas;
