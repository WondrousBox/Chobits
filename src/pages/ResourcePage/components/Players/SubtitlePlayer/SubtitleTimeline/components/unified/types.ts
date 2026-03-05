/**
 * UnifiedBlock 通用块组件类型定义
 */

import type { MediaThumbnail, MediaTransform, MediaTransition, WordTimestamp } from '../../types';

// ========== 拖拽模式 ==========

export type BlockDragMode = 'none' | 'move' | 'resize-start' | 'resize-end';

export interface BlockDragState {
  mode: BlockDragMode;
  startX: number;
  startTime: number;
  endTime: number;
  deltaX: number;
  tooltip: BlockTimeTooltip | null;
}

export interface BlockTimeTooltip {
  startTime?: number;
  endTime?: number;
  x: number;
  y: number;
}

// ========== 能力配置 ==========

export interface BlockTextCapabilities {
  /** 是否启用文本 */
  enabled: boolean;
  /** 是否可编辑（双击/选中后点击进入编辑） */
  editable: boolean;
  /** 是否显示字级别高亮（卡拉OK） */
  wordHighlight?: boolean;
  /** 最大长度限制 */
  maxLength?: number;
  /** 是否在编辑时校验 */
  validate?: (text: string) => { valid: boolean; message?: string };
}

export interface BlockThumbnailCapabilities {
  /** 是否启用缩略图 */
  enabled: boolean;
  /** 缩略图类型 */
  type: 'video-strip' | 'single-image';
  /** 是否在缩略图上叠加信息层 */
  showOverlay?: boolean;
}

export interface BlockWaveformCapabilities {
  /** 是否启用波形 */
  enabled: boolean;
  /** 波形加载方式 */
  loadMode: 'inline' | 'lazy' | 'none';
}

export interface BlockPlaybackCapabilities {
  /** 是否启用播放控制 */
  enabled: boolean;
  /** 是否显示播放按钮 */
  showPlayButton: boolean;
  /** 是否显示播放进度条 */
  showProgress: boolean;
}

export interface BlockDragCapabilities {
  /** 是否允许整体移动 */
  movable: boolean;
  /** 边缘调整模式：time=调整时间，speed=调整速度，none=禁用 */
  edgeResize: 'time' | 'speed' | 'none';
  /** 最小持续时间（秒） */
  minDuration?: number;
  /** 是否显示拖拽手柄 */
  showHandles: boolean;
}

export interface BlockSelectionCapabilities {
  /** 是否可点击选中 */
  clickable: boolean;
  /** 选中后是否可进入编辑 */
  editOnSelect: boolean;
  /** 是否显示选中操作栏 */
  showActionBar: boolean;
}

export interface BlockSpecialCapabilities {
  /** 是否显示顺序号（剪辑块） */
  showOrder?: boolean;
  /** 是否显示转场指示器（媒体块） */
  showTransition?: boolean;
  /** 是否显示状态徽章（TTS块） */
  showStatusBadge?: boolean;
  /** 是否显示速率标记 */
  showRateLabel?: boolean;
  /** 是否显示合并按钮（字幕块） */
  showMergeButton?: boolean;
  /** 是否显示上下移动按钮 */
  showReorderButtons?: boolean;
  /** 是否显示变换按钮（媒体块） */
  showTransformButtons?: boolean;
}

/**
 * 块能力配置
 */
export interface BlockCapabilities {
  /** 文本能力 */
  text?: BlockTextCapabilities;
  /** 缩略图能力 */
  thumbnail?: BlockThumbnailCapabilities;
  /** 波形能力 */
  waveform?: BlockWaveformCapabilities;
  /** 播放能力 */
  playback?: BlockPlaybackCapabilities;
  /** 拖拽能力 */
  drag?: BlockDragCapabilities;
  /** 选中激活能力 */
  selection?: BlockSelectionCapabilities;
  /** 特殊能力 */
  special?: BlockSpecialCapabilities;
}

// ========== 内容数据 ==========

/**
 * 块内容数据
 */
export interface BlockContent {
  // ---- 基础信息 ----
  /** 唯一标识 */
  id: string;
  /** 开始时间（秒） */
  startTime: number;
  /** 结束时间（秒） */
  endTime: number;
  /** 文本内容 */
  text?: string;
  /** 是否已删除（软删除） */
  deleted?: boolean;

  // ---- 样式 ----
  /** 块颜色 */
  color?: string;
  /** 不透明度 */
  opacity?: number;

  // ---- 播放状态 ----
  /** 是否正在播放 */
  isPlaying?: boolean;
  /** 播放进度（0~1） */
  playbackProgress?: number;
  /** 播放速率 */
  playbackRate?: number;
  /** 是否静音 */
  muted?: boolean;

  // ---- 字级别时间戳（卡拉OK） ----
  /** 当前播放时间（用于字级别高亮） */
  currentTime?: number;
  /** 字级别时间戳数据 */
  words?: WordTimestamp[];

  // ---- 缩略图数据 ----
  thumbnails?: MediaThumbnail[];

  // ---- 波形数据 ----
  waveform?: {
    data?: number[];
    loading?: boolean;
    error?: string | null;
  };

  // ---- 特殊数据 ----
  /** 顺序号（剪辑块） */
  order?: number;
  /** 总片段数（用于判断是否可上下移动） */
  totalSegments?: number;
  /** 状态（TTS块） */
  status?: 'pending' | 'synthesizing' | 'completed' | 'error';
  /** 错误信息 */
  errorMessage?: string;
  /** 转场配置 */
  transitionIn?: MediaTransition;
  transitionOut?: MediaTransition;
  /** 媒体类型图标 */
  mediaType?: 'video' | 'image' | 'audio';
  /** 自定义标签 */
  label?: string;
  /** 音频时长（TTS块用，用于计算倍率） */
  audioDuration?: number;
  /** 去静音后时长 */
  trimmedDuration?: number;
  /** 变换参数 */
  transform?: MediaTransform;
}

// ========== 回调函数 ==========

/**
 * 块回调函数
 */
export interface BlockCallbacks {
  // ---- 基础回调 ----
  /** 点击回调 */
  onClick?: (id: string, event: React.MouseEvent) => void;
  /** 双击回调 */
  onDoubleClick?: (id: string, event: React.MouseEvent) => void;

  // ---- 文本回调 ----
  /** 文本变更回调 */
  onTextChange?: (id: string, newText: string) => void;

  // ---- 时间回调 ----
  /** 时间变更回调（整体移动或边缘调整） */
  onTimeChange?: (id: string, newStart: number, newEnd: number) => void;
  /** 移动回调（仅整体移动） */
  onMove?: (id: string, newStart: number) => void;
  /** 调整大小回调（仅边缘调整） */
  onResize?: (id: string, edge: 'start' | 'end', newTime: number) => void;

  // ---- 速度回调 ----
  /** 速度变更回调（剪辑块边缘拖拽） */
  onSpeedChange?: (id: string, newSpeed: number) => void;

  // ---- 播放回调 ----
  /** 播放回调 */
  onPlay?: (id: string) => void;
  /** 暂停回调 */
  onPause?: (id: string) => void;

  // ---- 操作回调 ----
  /** 删除回调 */
  onDelete?: (id: string) => void;
  /** 恢复回调 */
  onRestore?: (id: string) => void;
  /** 合并到上一片段回调 */
  onMergePrev?: (id: string) => void;

  // ---- 顺序回调 ----
  /** 上移回调 */
  onMoveUp?: (id: string) => void;
  /** 下移回调 */
  onMoveDown?: (id: string) => void;

  // ---- 变换回调 ----
  /** 变换回调 */
  onTransform?: (id: string, transform: Partial<MediaTransform>) => void;
}

// ========== 布局配置 ==========

/**
 * 块布局配置
 */
export interface BlockLayout {
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 最大时长限制（秒） */
  maxDuration?: number;
  /** 轨道高度 */
  trackHeight: number;
  /** 轨道颜色 */
  trackColor?: string;
  /** 轨道间距 */
  trackGap?: number;
}

// ========== 主 Props ==========

/**
 * UnifiedBlock 主 Props
 */
export interface UnifiedBlockProps {
  /** 能力配置 */
  capabilities: BlockCapabilities;
  /** 内容数据 */
  content: BlockContent;
  /** 回调函数 */
  callbacks?: BlockCallbacks;
  /** 布局配置 */
  layout: BlockLayout;

  // ---- 状态 ----
  /** 是否为当前播放的片段 */
  isActive?: boolean;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否高亮 */
  isHighlighted?: boolean;
  /** 是否与其他片段重叠 */
  isOverlapping?: boolean;
  /** 是否禁用交互 */
  disabled?: boolean;

  // ---- 工具状态 ----
  /** 当前激活的工具 */
  activeTool?: 'select' | 'cut' | 'transform';

  // ---- 其他 ----
  /** 自定义类名 */
  className?: string;
  /** 数据属性前缀（用于 data-*-block） */
  dataAttrType?: string;
}

// ========== 子组件 Props ==========

export interface BlockContainerProps {
  children: React.ReactNode;
  content: BlockContent;
  layout: BlockLayout;
  capabilities: BlockCapabilities;
  isActive?: boolean;
  isSelected?: boolean;
  isOverlapping?: boolean;
  disabled?: boolean;
  dragMode: BlockDragMode;
  visualLeft: number;
  visualWidth: number;
  style?: React.CSSProperties;
  className?: string;
  dataAttrType?: string;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}

export interface BlockContentProps {
  capabilities: BlockCapabilities;
  content: BlockContent;
  layout: BlockLayout;
  isActive?: boolean;
  isSelected?: boolean;
  disabled?: boolean;
  isEditing: boolean;
  editText: string;
  onEditTextChange: (text: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
}

export interface BlockHandlesProps {
  capabilities: BlockCapabilities;
  dragMode: BlockDragMode;
  disabled?: boolean;
}

export interface BlockActionBarProps {
  capabilities: BlockCapabilities;
  content: BlockContent;
  callbacks?: BlockCallbacks;
  disabled?: boolean;
}

export interface BlockProgressBarProps {
  progress: number;
  color?: string;
}

export interface BlockTimeTooltipProps extends BlockTimeTooltip {}

export interface BlockOrderBadgeProps {
  order: number;
  isActive?: boolean;
}

export interface BlockStatusBadgeProps {
  status: BlockContent['status'];
  errorMessage?: string;
}

export interface BlockRateLabelProps {
  rate: number;
  isPreview?: boolean;
}
