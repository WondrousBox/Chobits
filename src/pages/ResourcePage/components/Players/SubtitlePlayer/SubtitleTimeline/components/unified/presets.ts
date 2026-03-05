/**
 * UnifiedBlock 预设配置
 *
 * 为不同类型的块提供预设的能力配置
 */

import type { BlockCapabilities } from './types';

/**
 * 字幕块预设配置
 * - 文本可编辑
 * - 攋持卡拉OK字级别高亮
 * - 拖拽移动和调整时长
 */
export const SUBTITLE_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: {
    enabled: true,
    editable: true,
    wordHighlight: true
  },
  thumbnail: {
    enabled: false,
    type: 'video-strip'
  },
  waveform: {
    enabled: false,
    loadMode: 'none'
  },
  playback: {
    enabled: false,
    showPlayButton: false,
    showProgress: false
  },
  drag: {
    movable: true,
    edgeResize: 'time',
    showHandles: true
  },
  selection: {
    clickable: true,
    editOnSelect: true,
    showActionBar: true
  },
  special: {
    showOrder: false,
    showTransition: false,
    showStatusBadge: false,
    showRateLabel: false
  }
};

/**
 * TTS 音频块预设配置
 * - 文本可编辑
 * - 波形显示（可选）
 * - 播放控制
 * - 状态徽章
 * - 拖拽移动和调整时长
 */
export const TTS_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: {
    enabled: true,
    editable: true,
    wordHighlight: false
  },
  thumbnail: {
    enabled: false,
    type: 'video-strip'
  },
  waveform: {
    enabled: true,
    loadMode: 'lazy'
  },
  playback: {
    enabled: true,
    showPlayButton: true,
    showProgress: true
  },
  drag: {
    movable: true,
    edgeResize: 'time',
    showHandles: true
  },
  selection: {
    clickable: true,
    editOnSelect: true,
    showActionBar: true
  },
  special: {
    showOrder: false,
    showTransition: false,
    showStatusBadge: true,
    showRateLabel: true
  }
};

/**
 * 剪辑块预设配置
 * - 辋缘调整速度（不是时长）
 * - 顺序号显示
 * - 上移/下移按钮
 * - 不支持整体移动
 */
export const CLIP_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: {
    enabled: false,
    editable: false
  },
  thumbnail: {
    enabled: false,
    type: 'video-strip'
  },
  waveform: {
    enabled: false,
    loadMode: 'none'
  },
  playback: {
    enabled: false,
    showPlayButton: false,
    showProgress: true
  },
  drag: {
    movable: false,
    edgeResize: 'speed',
    showHandles: true
  },
  selection: {
    clickable: true,
    editOnSelect: false,
    showActionBar: true
  },
  special: {
    showOrder: true,
    showTransition: false,
    showStatusBadge: false,
    showRateLabel: true
  }
};

/**
 * 媒体块预设配置
 * - 视频缩略图条
 * - 转场指示器
 * - 拖拽移动和调整时长
 * - 变换控制
 */
export const MEDIA_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: {
    enabled: false,
    editable: false
  },
  thumbnail: {
    enabled: true,
    type: 'video-strip',
    showOverlay: true
  },
  waveform: {
    enabled: false,
    loadMode: 'none'
  },
  playback: {
    enabled: false,
    showPlayButton: false,
    showProgress: true
  },
  drag: {
    movable: true,
    edgeResize: 'time',
    showHandles: true
  },
  selection: {
    clickable: true,
    editOnSelect: false,
    showActionBar: true
  },
  special: {
    showOrder: false,
    showTransition: true,
    showStatusBadge: false,
    showRateLabel: true
  }
};

/**
 * 标注块预设配置（简单标记点，不可编辑）
 */
export const ANNOTATION_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: {
    enabled: true,
    editable: false
  },
  thumbnail: {
    enabled: false,
    type: 'video-strip'
  },
  waveform: {
    enabled: false,
    loadMode: 'none'
  },
  playback: {
    enabled: false,
    showPlayButton: false,
    showProgress: false
  },
  drag: {
    movable: false,
    edgeResize: 'none',
    showHandles: false
  },
  selection: {
    clickable: true,
    editOnSelect: false,
    showActionBar: true
  },
  special: {
    showOrder: false,
    showTransition: false,
    showStatusBadge: false,
    showRateLabel: false
  }
};

/**
 * 获取默认能力配置（全部禁用）
 */
export const DEFAULT_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: {
    enabled: false,
    editable: false
  },
  thumbnail: {
    enabled: false,
    type: 'video-strip'
  },
  waveform: {
    enabled: false,
    loadMode: 'none'
  },
  playback: {
    enabled: false,
    showPlayButton: false,
    showProgress: false
  },
  drag: {
    movable: false,
    edgeResize: 'none',
    showHandles: false
  },
  selection: {
    clickable: true,
    editOnSelect: false,
    showActionBar: false
  },
  special: {
    showOrder: false,
    showTransition: false,
    showStatusBadge: false,
    showRateLabel: false
  }
};

/**
 * 合并能力配置（用于覆盖默认值）
 */
export function mergeCapabilities(base: BlockCapabilities, override: Partial<BlockCapabilities>): BlockCapabilities {
  return {
    text: { ...base.text, ...override.text },
    thumbnail: { ...base.thumbnail, ...override.thumbnail },
    waveform: { ...base.waveform, ...override.waveform },
    playback: { ...base.playback, ...override.playback },
    drag: { ...base.drag, ...override.drag },
    selection: { ...base.selection, ...override.selection },
    special: { ...base.special, ...override.special }
  };
}
