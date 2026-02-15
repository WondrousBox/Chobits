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
  /** 在轨道空白处新增字幕片段（trackId, startTime, endTime, text） */
  onAddSegment?: (trackId: string, startTime: number, endTime: number, text: string) => void;
  /** 删除选中的字幕片段（快捷键或按钮） */
  onDeleteSegment?: (segment: TimelineSegment, trackId: string) => void;
  /** 选中状态变化 */
  onSelectionChange?: (selection: SelectionState) => void;
  /** 时间跳转（点击时间轴空白处） */
  onSeek?: (time: number) => void;
  /** 视口变化（缩放、平移） */
  onViewportChange?: (viewport: ViewportState) => void;
}

/**
 * TTS音频项（用于时间轴显示）
 */
export interface TTSAudioItem {
  /** 字幕索引 */
  index: number;
  /** 合成状态 */
  status: 'pending' | 'synthesizing' | 'completed' | 'error';
  /** 音频文件路径 */
  audioPath?: string;
  /** 原始时长（秒） */
  duration?: number;
  /** 去静音后时长（秒） */
  trimmedDuration?: number;
  /** 错误信息 */
  error?: string;
  /** 对应的开始时间（秒）- 来自 history 或字幕，可拖拽调整 */
  startTime: number;
  /** 对应的结束时间（秒）- 来自 history 或字幕，可拖拽调整 */
  endTime: number;
  /** 该条 content md5（用于更新 history 中的 st/et） */
  md5?: string;
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
  /** 按轨道分组的 TTS 音频项：trackId -> TTSAudioItem[] */
  ttsItemsByTrack?: Map<string, TTSAudioItem[]>;
  /** TTS 轨道显示标签：trackId -> 显示名（如「原文」「中文」） */
  ttsTrackLabels?: Map<string, string>;
  /** 字幕轨道到TTS轨道的映射：timeline track id (如 'track-0') -> TTS trackId (如 'main', 'zh-CN') */
  subtitleToTTSTrackMap?: Map<string, string>;
  /** 是否显示TTS轨道 */
  showTTSTrack?: boolean;
  /** 播放TTS音频回调 */
  onPlayTTSAudio?: (index: number, audioPath: string) => void;
  /** 停止TTS播放回调 */
  onStopTTSAudio?: () => void;
  /** 当前正在播放的TTS索引 */
  playingTTSIndex?: number;
  /** 删除字幕轨道回调（trackId 为 timeline track id，如 'track-1'） */
  onDeleteSubtitleTrack?: (trackId: string) => void;
  /** 删除TTS轨道回调（trackId 为 TTS trackId，如 'main', 'zh-CN'） */
  onDeleteTTSTrack?: (trackId: string) => void;
  /** 删除单个TTS片段回调（trackId 为 TTS trackId，index 为片段索引） */
  onDeleteTTSSegment?: (trackId: string, index: number) => void;
  /** TTS 块时间变更回调（拖拽移动或边缘调整后） */
  onTTSTimeChange?: (trackId: string, index: number, newStartTime: number, newEndTime: number) => void;

  // ---- 剪辑轨道 Props ----
  /** 是否显示剪辑轨道 */
  showClipTrack?: boolean;
  /** 剪辑轨道数据 */
  clipTrack?: ClipTrackData;
  /** 当前激活的剪辑工具 */
  clipTool?: ClipTool;
  /** 剪辑轨道回调 */
  clipCallbacks?: ClipTrackCallbacks;
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
  TRACK_LABEL_WIDTH: 100,
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
  ZOOM_STEP: 1.2,
  /** 剪辑轨道高度 */
  CLIP_TRACK_HEIGHT: 48
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

// ========== 剪辑轨道相关类型 ==========

/**
 * 剪辑片段 — 引用原始视频/音频的一个时间范围
 *
 * 每个 ClipSegment 代表用户从源媒体中"剪"出来的一段。
 * 多个 ClipSegment 按 order 排列后构成最终的播放序列。
 */
export interface ClipSegment {
  /** 唯一标识 */
  id: string;
  /** 原始媒体中的开始时间（秒） */
  sourceStart: number;
  /** 原始媒体中的结束时间（秒） */
  sourceEnd: number;
  /** 在剪辑序列中的排列顺序（从 0 开始，值越小越靠前） */
  order: number;
  /** 播放速率 (1.0 = 正常, 0.5 = 慢放, 2.0 = 快放) */
  playbackRate: number;
  /** 是否静音 */
  muted?: boolean;
  /** 用户自定义标签 / 备注 */
  label?: string;
  /** 是否被禁用（跳过播放） */
  disabled?: boolean;
  /** 是否已删除（保留占位但跳过播放，播放到此区域会自动跳过） */
  deleted?: boolean;
}

/**
 * 剪辑轨道
 */
export interface ClipTrackData {
  /** 轨道 ID */
  id: string;
  /** 轨道显示名称 */
  label: string;
  /** 剪辑片段列表 */
  clips: ClipSegment[];
  /** 原始媒体总时长（秒） */
  sourceDuration: number;
}

/**
 * 剪辑轨道当前激活的工具
 */
export type ClipTool = 'select' | 'cut';

/**
 * 剪辑轨道布局模式
 */
export type ClipLayoutMode = 'source-time' | 'playback-order';

/**
 * 剪辑轨道回调
 */
export interface ClipTrackCallbacks {
  /** 在某个时间点切割（裁剪工具点击时） */
  onClipCut?: (time: number) => void;
  /** 删除某个剪辑片段（软删除） */
  onClipDelete?: (clipId: string) => void;
  /** 恢复已删除的剪辑片段 */
  onClipRestore?: (clipId: string) => void;
  /** 片段播放速率变更 */
  onClipSpeedChange?: (clipId: string, playbackRate: number) => void;
  /** 片段启用/禁用切换 */
  onClipToggleDisabled?: (clipId: string) => void;
  /** 片段标签/备注变更 */
  onClipLabelChange?: (clipId: string, label: string) => void;
  /** 切割工具切换 */
  onClipToolChange?: (tool: ClipTool) => void;
  /** 片段排序变更（拖拽排序后） */
  onClipReorder?: (orderedIds: string[]) => void;
  /** 片段移动到指定位置 */
  onClipMove?: (clipId: string, targetOrder: number) => void;
}
