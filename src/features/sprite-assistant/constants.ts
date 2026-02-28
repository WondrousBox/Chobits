/**
 * AIAssistant 常量集中定义
 * - 用途：尺寸、移动动画的默认参数与开关。
 * - 注意：padding 实际值由主进程配置决定（在 useAssistantInit 中获取）。
 */
export const ASSISTANT_WIDTH = 180;
export const ASSISTANT_HEIGHT = 240;

export const DEFAULT_WALK_SPEED = 60;
export const DEFAULT_FPS_LIMIT = 30;
export const FRAME_INTERVAL = 1000 / DEFAULT_FPS_LIMIT;
export const STEP_GRID = 12;
export const PATH_CURVE_FACTOR = 0.15;

// Padding is fetched dynamically at runtime from main process; this is only a safe default
export const DEFAULT_ASSISTANT_PADDING = 100;

// Debug overlay toggle for padding boundary
export const SHOW_PADDING_DEBUG = false;

// Renderer mode toggle: 'video' (current sprite videos) or 'three' (3D demo)
export type AssistantRendererMode = 'video' | 'three';
export const ASSISTANT_RENDERER_MODE: AssistantRendererMode = 'video';
