/**
 * SubtitleTimeline 时间轴组件类型定义
 *
 * 设计目标：
 * 1. 高性能 - 虚拟化渲染，只渲染可视区域
 * 2. 多轨道 - 支持多个字幕轨道并排显示
 * 3. 交互友好 - 支持缩放、平移、点击、选中等操作
 */

/**
 * 时间片段 - 时间轴上的基本单元
 */
export interface TimelineSegment {
  /** 唯一标识 */
  id: string;
  /** 开始时间（秒） */
  startTime: number;
  /** 结束时间（秒） */
  endTime: number;
  /** 显示文本 */
  text: string;
  /** 是否被删除/禁用 */
  deleted?: boolean;
  /** 自定义数据 */
  data?: Record<string, unknown>;
}

/**
 * 轨道定义
 */
export interface TimelineTrack {
  /** 轨道唯一标识 */
  id: string;
  /** 轨道名称（显示在左侧） */
  label: string;
  /** 该轨道的片段列表 */
  segments: TimelineSegment[];
  /** 轨道颜色 */
  color?: string;
  /** 是否锁定（禁止编辑） */
  locked?: boolean;
  /** 是否隐藏 */
  hidden?: boolean;
  /** 轨道高度（像素） */
  height?: number;
}

/**
 * 视口状态 - 控制可视区域
 */
export interface ViewportState {
  /** 可视区域起始时间（秒） */
  startTime: number;
  /** 可视区域结束时间（秒） */
  endTime: number;
  /** 每秒对应的像素数（缩放级别） */
  pixelsPerSecond: number;
}

/**
 * 选中状态
 */
export interface SelectionState {
  /** 选中的片段 ID 列表 */
  selectedIds: Set<string>;
  /** 主选中（最后一个选中的） */
  primaryId?: string;
}

/**
 * 时间轴事件回调
 */
export interface TimelineCallbacks {
  /** 点击片段 */
  onSegmentClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 双击片段（进入编辑模式） */
  onSegmentDoubleClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 片段文本变更（编辑完成后） */
  onSegmentTextChange?: (segment: TimelineSegment, trackId: string, newText: string) => void;
  /** 片段时间变更（拖拽移动或调整边缘） */
  onSegmentTimeChange?: (segment: TimelineSegment, trackId: string, newStartTime: number, newEndTime: number) => void;
  /** 往前合并（统一回调签名） */
  onMergePrev?: (payload: { trackId: string; segmentIndex: number }) => void;
  /** 选中状态变化 */
  onSelectionChange?: (selection: SelectionState) => void;
  /** 时间跳转（点击时间轴空白处） */
  onSeek?: (time: number) => void;
  /** 视口变化（缩放、平移） */
  onViewportChange?: (viewport: ViewportState) => void;
}

/**
 * 时间轴主组件 Props
 */
export interface SubtitleTimelineProps extends TimelineCallbacks {
  /** 轨道列表 */
  tracks: TimelineTrack[];
  /** 总时长（秒）- 如不提供则自动计算 */
  duration?: number;
  /** 当前播放时间（秒） */
  currentTime?: number;
  /** 是否跟随当前时间自动调整可见区域 */
  followCurrentTime?: boolean;
  /** 初始视口状态 */
  initialViewport?: Partial<ViewportState>;
  /** 是否显示时间刻度 */
  showRuler?: boolean;
  /** 是否显示轨道标签 */
  showTrackLabels?: boolean;
  /** 轨道标签宽度 */
  trackLabelWidth?: number;
  /** 最小缩放（每秒像素数） */
  minPixelsPerSecond?: number;
  /** 最大缩放（每秒像素数） */
  maxPixelsPerSecond?: number;
  /** 禁用交互 */
  disabled?: boolean;
  /** 高亮的片段 ID 列表 */
  highlightIds?: Set<string> | string[];
  /** 自定义类名 */
  className?: string;
  /** 音频文件路径（用于显示波形轨道） */
  audioPath?: string;
  /** 是否显示波形轨道 */
  showWaveform?: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  /** 默认轨道高度 */
  TRACK_HEIGHT: 40,
  /** 轨道间距 */
  TRACK_GAP: 4,
  /** 时间刻度高度 */
  RULER_HEIGHT: 28,
  /** 轨道标签宽度 */
  TRACK_LABEL_WIDTH: 80,
  /** 默认每秒像素数 */
  DEFAULT_PIXELS_PER_SECOND: 100,
  /** 最小每秒像素数 */
  MIN_PIXELS_PER_SECOND: 20,
  /** 最大每秒像素数 */
  MAX_PIXELS_PER_SECOND: 500,
  /** 片段最小宽度（像素） */
  SEGMENT_MIN_WIDTH: 4,
  /** 片段圆角 */
  SEGMENT_BORDER_RADIUS: 4,
  /** 缩放步进 */
  ZOOM_STEP: 1.2
} as const;

/**
 * 轨道颜色预设
 */
export const TRACK_COLORS = [
  'hsl(210, 80%, 60%)', // 蓝色
  'hsl(150, 70%, 50%)', // 绿色
  'hsl(280, 70%, 60%)', // 紫色
  'hsl(30, 80%, 55%)', // 橙色
  'hsl(340, 75%, 55%)', // 粉色
  'hsl(180, 60%, 50%)' // 青色
] as const;
