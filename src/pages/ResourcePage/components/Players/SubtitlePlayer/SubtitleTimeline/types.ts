// Re-export WordTimestamp from adapters for backward compatibility
export type { AnnotationItem, TimelineAdapters, WordTimestamp } from './adapters/types';

// Import WordTimestamp for internal use
import type { AnnotationItem, TimelineAdapters, WordTimestamp } from './adapters/types';

/**
 * SubtitleTimeline 时间轴组件类型定义
 *
 * 设计目标：
 * 1. 高性能 - 虚拟化渲染，只渲染可视区域
 * 2. 多轨道 - 支持多个字幕轨道并排显示
 * 3. 交互友好 - 支持缩放、平移、点击、选中等操作
 */

// ========== 统一基础类型 ==========

/**
 * 片段基础数据 - 所有片段类型共享
 */
export interface BaseSegment {
  /** 片段唯一 ID */
  id: string;
  /** 开始时间 (秒) */
  startTime: number;
  /** 结束时间 (秒) */
  endTime: number;
  /** 是否已删除 (软删除) */
  deleted?: boolean;
}

/**
 * 统一的轨道 Props - 所有轨道类型共享
 * 某些 props 可能对特定轨道不使用，但保持接口一致
 */
export interface TrackProps {
  // ========== 布局 (必需) ==========
  /** 轨道总宽度 (像素) */
  width: number;
  /** 轨道高度 (像素) */
  height?: number;
  /** 缩放级别 (每秒像素数) */
  pixelsPerSecond: number;

  // ========== 视口 (必需) ==========
  /** 可视区域状态 */
  viewport: ViewportState;
  /** 水平滚动偏移 */
  scrollLeft?: number;

  // ========== 时间上下文 ==========
  /** 总时长 (秒) */
  totalDuration: number;
  /** 当前播放时间 */
  currentTime?: number;

  // ========== 交互状态 ==========
  /** 是否禁用交互 */
  disabled?: boolean;

  // ========== 轨道数据 ==========
  /** 轨道 ID */
  trackId?: string;
  /** 轨道标签 */
  trackLabel?: string;
  /** 轨道颜色 */
  trackColor?: string;

  // ========== 选中状态 (统一为 string | number | null) ==========
  /** 选中的片段/块 ID */
  selectedId?: string | number | null;
  /** 高亮的片段 ID 集合 */
  highlightIds?: Set<string>;

  // ========== 工具状态 ==========
  /** 当前激活的工具 */
  activeTool?: ClipTool | MediaTool;

  // ========== 数据 (轨道特定，但统一命名) ==========
  /** 片段数据 (字幕/TTS/剪辑/媒体通用) */
  segments?: BaseSegment[];
  /** 轨道完整数据 (用于需要额外元数据的轨道) */
  trackData?: TimelineTrack | MediaTrackData | ClipTrackData;

  // ========== 波形特定 ==========
  /** 波形数据 */
  waveformData?: WaveformData;
  /** 是否加载中 */
  isLoading?: boolean;
  /** 错误信息 */
  error?: string | null;

  // ========== TTS 特定 ==========
  /** 正在播放的索引 */
  playingIndex?: number;

  // ========== 媒体轨道特定 ==========
  /** 媒体源映射 */
  sources?: Map<string, MediaSource>;

  // ========== 回调函数 (统一签名) ==========
  /** 点击片段 */
  onSegmentClick?: (segmentId: string, event?: React.MouseEvent) => void;
  /** 双击片段 */
  onSegmentDoubleClick?: (segmentId: string) => void;
  /** 删除片段 */
  onSegmentDelete?: (segmentId: string) => void;
  /** 恢复片段 */
  onSegmentRestore?: (segmentId: string) => void;
  /** 片段时间变更 */
  onSegmentTimeChange?: (segmentId: string, newStartTime: number, newEndTime: number) => void;
  /** 片段移动 */
  onSegmentMove?: (segmentId: string, newStartTime: number) => void;
  /** 片段大小调整 */
  onSegmentResize?: (segmentId: string, edge: 'start' | 'end', newTime: number) => void;
  /** 跳转 */
  onSeek?: (time: number) => void;
  /** 选中变更 */
  onSelect?: (id: string | number | null) => void;

  // ========== 字幕特定回调 ==========
  /** 文本变更 */
  onTextChange?: (segmentId: string, newText: string) => void;
  /** 合并上一片段 */
  onMergePrev?: (segmentId: string) => void;

  // ========== TTS 特定回调 ==========
  /** 播放音频 */
  onPlayAudio?: (index: number, audioPath?: string) => void;
  /** 停止音频 */
  onStopAudio?: () => void;

  // ========== 剪辑特定回调 ==========
  /** 剪切 */
  onCut?: (time: number) => void;
  /** 速度变更 */
  onSpeedChange?: (clipId: string, speed: number) => void;
  /** 上移 */
  onMoveUp?: (clipId: string) => void;
  /** 下移 */
  onMoveDown?: (clipId: string) => void;

  // ========== 添加片段 (通用) ==========
  /** 允许添加片段 */
  allowAddSegment?: boolean;
  /** 待添加的片段 */
  pendingNewSegment?: { startTime: number; endTime: number } | null;
  /** 确认添加 */
  onAddSegmentConfirm?: (startTime: number, endTime: number, text?: string) => void;
  /** 取消添加 */
  onCancelNewSegment?: () => void;

  // ========== 其他 ==========
  /** 自定义类名 */
  className?: string;
}

// ========== 现有类型定义 ==========

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
  /** 是否启用（默认 true）。禁用后轨道不可交互，播放时不生效 */
  enabled?: boolean;
  /** 轨道高度（像素） */
  height?: number;
}

/**
 * 波形数据
 */
export interface WaveformData {
  /** 峰值数组（0-1 范围） */
  peaks: number[];
  /** 音频时长（秒） */
  duration: number;
}

/**
 * 波形状态（包含数据和加载状态）
 */
export interface WaveformState {
  /** 波形数据 */
  data?: WaveformData;
  /** 是否加载中 */
  loading?: boolean;
  /** 错误信息 */
  error?: string | null;
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
  /** 片段索引 */
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
  /** 合成所用的原始文本（独立 TTS 轨道片段自包含文本） */
  text?: string;
}

/**
 * 独立 TTS 轨道信息（不绑定字幕轨道，在时间轴中独立显示）
 */
export interface StandaloneTTSTrack {
  /** 轨道 ID（如 tts-xxxxx） */
  id: string;
  /** 显示名称 */
  label: string;
  /** 轨道颜色 */
  color?: string;
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
  /** 波形状态（包含数据、加载状态和错误信息） */
  waveform?: WaveformState;
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
  /** 独立 TTS 轨道列表（不绑定字幕轨道，在字幕轨道之后独立显示） */
  standaloneTTSTracks?: StandaloneTTSTrack[];
  /** 在独立 TTS 轨道空白处添加片段的回调 */
  onAddTTSSegment?: (ttsTrackId: string, startTime: number, endTime: number) => void;
  /** 待新增 TTS 片段的时间范围（显示 inline 输入框） */
  pendingTTSSegment?: { trackId: string; startTime: number; endTime: number } | null;
  /** 确认新增 TTS 片段（输入框失焦且有内容时） */
  onAddTTSSegmentConfirm?: (trackId: string, startTime: number, endTime: number, text: string) => void;
  /** 取消新增 TTS 片段 */
  onCancelTTSSegment?: () => void;
  /** 双击 TTS 音频块编辑回调（传入 trackId 和 item） */
  onTTSBlockDoubleClick?: (ttsTrackId: string, item: TTSAudioItem) => void;
  /** 播放TTS音频回调 */
  onPlayTTSAudio?: (index: number, audioPath: string) => void;
  /** 停止TTS播放回调 */
  onStopTTSAudio?: () => void;
  /** 当前正在播放的TTS索引 */
  playingTTSIndex?: number;
  /** 添加字幕轨道回调 */
  onAddSubtitleTrack?: () => void;
  /** 添加 TTS 语音轨道回调 */
  onAddTTSTrack?: () => void;
  /** 删除字幕轨道回调（trackId 为 timeline track id，如 'track-1'） */
  onDeleteSubtitleTrack?: (trackId: string) => void;
  /** 删除TTS轨道回调（trackId 为 TTS trackId，如 'main', 'zh-CN'） */
  onDeleteTTSTrack?: (trackId: string) => void;
  /** 删除单个TTS片段回调（trackId 为 TTS trackId，index 为片段索引） */
  onDeleteTTSSegment?: (trackId: string, index: number) => void;
  /** TTS 块时间变更回调（拖拽移动或边缘调整后） */
  onTTSTimeChange?: (trackId: string, index: number, newStartTime: number, newEndTime: number) => void;
  /** 切换字幕轨道启用/禁用 */
  onToggleSubtitleTrackEnabled?: (trackId: string) => void;
  /** 切换TTS轨道启用/禁用 */
  onToggleTTSTrackEnabled?: (ttsTrackId: string) => void;
  /** 打开 TTS 设置面板回调 */
  onOpenTTSSettings?: (ttsTrackId: string) => void;
  /** 打开 TTS 批量文本输入面板回调 */
  onOpenTTSBatchInput?: (ttsTrackId: string) => void;
  /** TTS 语音标签映射：ttsTrackId -> 短名称（如 "Xiaoxiao"） */
  ttsVoiceLabels?: Map<string, string>;
  /** 剪辑轨道是否启用（默认 true） */
  clipTrackEnabled?: boolean;
  /** TTS 轨道的启用状态：ttsTrackId -> enabled */
  ttsTrackEnabledMap?: Map<string, boolean>;
  /** 字级别时间戳映射：trackId -> (segment id -> WordTimestamp[])，用于卡拉OK高亮 */
  wordsMapByTrack?: Map<string, Map<string, WordTimestamp[]>>;

  // ---- 标注轨道 Props ----
  /** 标注轨道数据 */
  annotationTrack?: AnnotationTrackData;
  /** 标注轨道回调 */
  annotationCallbacks?: AnnotationTrackCallbacks;
  /** 标注轨道是否启用 */
  annotationTrackEnabled?: boolean;

  // ---- 剪辑轨道 Props ----
  /** 剪辑轨道数据 */
  clipTrack?: ClipTrackData;
  /** 当前激活的剪辑工具 */
  clipTool?: ClipTool;
  /** 剪辑轨道回调 */
  clipCallbacks?: ClipTrackCallbacks;

  // ---- 媒体轨道 Props ----
  /** 媒体轨道列表 */
  mediaTracks?: MediaTrackData[];
  /** 媒体源映射：sourceId -> MediaSource */
  mediaSources?: Map<string, MediaSource>;
  /** 媒体轨道回调 */
  mediaCallbacks?: MediaTrackCallbacks;

  // ---- 适配器 Props (用于独立组件库模式) ----
  /**
   * 适配器配置，用于注入外部服务依赖
   * 如果不提供，组件将使用默认的 no-op 实现（部分功能受限）
   */
  adapters?: TimelineAdapters;
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

// ========== 标注轨道相关类型 ==========

/**
 * 标注轨道数据
 */
export interface AnnotationTrackData {
  /** 轨道 ID */
  id: string;
  /** 轨道显示名称 */
  label: string;
  /** 标注列表 */
  annotations: AnnotationItem[];
}

/**
 * 标注轨道回调
 */
export interface AnnotationTrackCallbacks {
  /** 点击标注 */
  onAnnotationClick?: (annotation: AnnotationItem) => void;
  /** 删除标注 */
  onAnnotationDelete?: (annotationId: string) => void;
  /** 更新标注 */
  onAnnotationUpdate?: (annotationId: string, patch: Partial<Pick<AnnotationItem, 'title' | 'description' | 'type' | 'color'>>) => void;
}

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

// ========== 媒体轨道相关类型 ==========

/**
 * 媒体源类型
 */
export type MediaType = 'video' | 'image';

/**
 * 媒体文件引用
 */
export interface MediaSource {
  /** 唯一标识 */
  id: string;
  /** 文件路径 */
  path: string;
  /** 媒体类型 */
  type: MediaType;
  /** 视频时长（秒，仅视频类型） */
  duration?: number;
  /** 原始宽度 */
  width: number;
  /** 原始高度 */
  height: number;
}

/**
 * 变换参数
 */
export interface MediaTransform {
  /** X 位置（百分比 0-100） */
  x: number;
  /** Y 位置（百分比 0-100） */
  y: number;
  /** 缩放比例（1.0 = 100%） */
  scale: number;
  /** 旋转角度（度） */
  rotation: number;
  /** 不透明度（0-1） */
  opacity: number;
  /** 水平翻转 */
  flipX: boolean;
  /** 垂直翻转 */
  flipY: boolean;
}

/**
 * 转场类型
 */
export type TransitionType = 'none' | 'fade' | 'dissolve' | 'wipe-left' | 'wipe-right';

/**
 * 转场配置
 */
export interface MediaTransition {
  /** 转场类型 */
  type: TransitionType;
  /** 转场时长（秒） */
  duration: number;
}

/**
 * 缩略图数据
 */
export interface MediaThumbnail {
  /** 缩略图 URL（data URL 或文件路径） */
  url: string;
  /** 在源媒体中的时间偏移（秒） */
  timeOffset: number;
  /** 缩略图宽度 */
  width: number;
  /** 缩略图高度 */
  height: number;
}

/**
 * 媒体片段
 */
export interface MediaSegment {
  /** 唯一标识 */
  id: string;
  /** 关联的媒体源 ID */
  sourceId: string;

  // ---- 时间轴时间范围 ----
  /** 在时间轴上的起始时间（秒） */
  timelineStart: number;
  /** 在时间轴上的结束时间（秒） */
  timelineEnd: number;

  // ---- 源时间范围（仅视频） ----
  /** 源媒体中的起始时间（秒） */
  sourceStart?: number;
  /** 源媒体中的结束时间（秒） */
  sourceEnd?: number;

  // ---- 播放控制 ----
  /** 播放速率（1.0 = 正常） */
  playbackRate: number;
  /** 是否静音 */
  muted: boolean;
  /** 音量（0-1） */
  volume: number;

  // ---- 视觉效果 ----
  /** 变换参数 */
  transform: MediaTransform;
  /** 入场转场 */
  transitionIn?: MediaTransition;
  /** 出场转场 */
  transitionOut?: MediaTransition;

  // ---- 缩略图 ----
  /** 缩略图列表 */
  thumbnails?: MediaThumbnail[];

  // ---- 状态 ----
  /** 自定义标签 */
  label?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否已删除 */
  deleted?: boolean;
}

/**
 * 媒体轨道数据
 */
export interface MediaTrackData {
  /** 轨道 ID */
  id: string;
  /** 轨道显示名称 */
  label: string;
  /** 媒体片段列表 */
  segments: MediaSegment[];
  /** 图层顺序（值越大越在上层） */
  zIndex: number;
  /** 是否可见 */
  visible: boolean;
  /** 是否锁定 */
  locked: boolean;
  /** 轨道颜色 */
  color?: string;
  /** 轨道高度（像素） */
  height?: number;
}

/**
 * 媒体工具类型
 */
export type MediaTool = 'select' | 'cut' | 'trim' | 'transform';

/**
 * 媒体轨道回调
 */
export interface MediaTrackCallbacks {
  /** 添加媒体源 */
  onSourceAdd?: (sources: MediaSource[]) => void;
  /** 添加片段 */
  onSegmentAdd?: (trackId: string, segment: Omit<MediaSegment, 'id'>) => void;
  /** 快速添加媒体（右键菜单或拖拽添加时触发，同时添加源和片段） */
  onQuickAdd?: (trackId: string, sources: MediaSource[], segments: Omit<MediaSegment, 'id'>[]) => void;
  /** 更新片段 */
  onSegmentUpdate?: (trackId: string, segmentId: string, patch: Partial<MediaSegment>) => void;
  /** 删除片段 */
  onSegmentDelete?: (trackId: string, segmentId: string) => void;
  /** 恢复片段 */
  onSegmentRestore?: (trackId: string, segmentId: string) => void;
  /** 在指定时间切割片段 */
  onSegmentCut?: (trackId: string, timelineTime: number) => void;
  /** 移动片段 */
  onSegmentMove?: (trackId: string, segmentId: string, newTimelineStart: number) => void;
  /** 调整片段大小 */
  onSegmentResize?: (trackId: string, segmentId: string, edge: 'start' | 'end', newTime: number) => void;
  /** 变换片段 */
  onSegmentTransform?: (trackId: string, segmentId: string, transform: Partial<MediaTransform>) => void;
  /** 添加轨道 */
  onTrackAdd?: () => void;
  /** 删除轨道 */
  onTrackDelete?: (trackId: string) => void;
  /** 重排轨道顺序 */
  onTrackReorder?: (trackIds: string[]) => void;
  /** 选中片段 */
  onSegmentSelect?: (trackId: string, segmentId: string | null) => void;
  /** 请求生成缩略图 */
  onThumbnailRequest?: (trackId: string, segmentId: string) => void;
}

/**
 * 媒体轨道配置常量
 */
export const MEDIA_CONFIG = {
  /** 默认轨道高度 */
  DEFAULT_TRACK_HEIGHT: 64,
  /** 缩略图宽度 */
  THUMBNAIL_WIDTH: 80,
  /** 缩略图高度 */
  THUMBNAIL_HEIGHT: 45,
  /** 每秒缩略图数量 */
  THUMBNAILS_PER_SECOND: 0.5,
  /** 每个片段最大缩略图数 */
  MAX_THUMBNAILS_PER_SEGMENT: 20,
  /** 片段最小宽度（像素） */
  MIN_SEGMENT_WIDTH: 20,
  /** 默认转场时长（秒） */
  DEFAULT_TRANSITION_DURATION: 0.5
} as const;

/**
 * 默认变换参数
 */
export const DEFAULT_TRANSFORM: MediaTransform = {
  x: 50,
  y: 50,
  scale: 1.0,
  rotation: 0,
  opacity: 1,
  flipX: false,
  flipY: false
};
