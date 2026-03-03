import type { AnnotationType, TimelineAdapters, TimelineLabels } from './types';

// ========== Default Constants ==========

const DEFAULT_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
const DEFAULT_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
const DEFAULT_WAVEFORM_SAMPLES = 150;

const DEFAULT_ANNOTATION_COLORS: Record<AnnotationType, string> = {
  highlight: 'hsl(48, 95%, 55%)',
  note: 'hsl(210, 80%, 60%)',
  vocabulary: 'hsl(150, 70%, 50%)',
  comment: 'hsl(280, 70%, 60%)',
  custom: 'hsl(30, 80%, 55%)'
};

// ========== Default Implementations ==========

/**
 * Default media service adapter
 * Provides no-op implementations - component works without media services
 */
const defaultMediaAdapter = {
  getMediaInfo: async () => null,
  pickFiles: async () => null,
  extractWaveform: async () => ({ peaks: [], duration: 0 }),
  generateThumbnails: async () => []
};

/**
 * Default annotation service adapter
 * Provides standard colors for annotation types
 */
const defaultAnnotationAdapter = {
  getAnnotationColor: (type: AnnotationType): string => DEFAULT_ANNOTATION_COLORS[type] || DEFAULT_ANNOTATION_COLORS.highlight
};

/**
 * Default ID generator adapter
 * Provides simple ID generation using timestamp and random strings
 */
const defaultIdGeneratorAdapter = {
  generateSourceId: (): string => `source-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  generateSegmentId: (trackIndex: number, segmentIndex: number): string => `t${trackIndex}-${segmentIndex}`,
  parseSegmentId: (id: string): { trackIndex: number; segmentIndex: number } | null => {
    const match = id.match(/^t(\d+)-(\d+)$/);
    if (!match) return null;
    return { trackIndex: parseInt(match[1], 10), segmentIndex: parseInt(match[2], 10) };
  },
  generateMediaSourceId: (): string => `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
};

export const DEFAULT_LABELS: Required<TimelineLabels> = {
  zoomOut: '缩小',
  zoomIn: '放大',
  zoomLevel: '缩放级别: {value} px/s',
  selectTool: '选择工具',
  cutTool: '裁剪工具',
  importMedia: '导入媒体',
  trackCount: '{count} 轨道',
  segmentCount: '{count} 片段',
  waveform: '波形',
  waveformClip: '波形/剪辑',
  clip: '剪辑',
  defaultTrackLabels: ['原文', '译文', '轨道 3', '轨道 4', '轨道 5', '轨道 6'],
  trackLabelTemplate: '轨道 {index}'
};

/**
 * Default configuration adapter
 * Provides standard configuration values
 */
const defaultConfigAdapter = {
  videoExtensions: DEFAULT_VIDEO_EXTENSIONS,
  imageExtensions: DEFAULT_IMAGE_EXTENSIONS,
  defaultMediaInfo: { width: 1920, height: 1080 },
  waveformSampleCount: DEFAULT_WAVEFORM_SAMPLES,
  labels: DEFAULT_LABELS
};

/**
 * Default selection adapter
 * Empty object means uncontrolled mode - component manages its own state
 */
const defaultSelectionAdapter = {};

// ========== Combined Default Adapters ==========

/**
 * Default adapters for standalone mode
 * All operations have safe no-op or fallback implementations
 */
export const defaultAdapters: TimelineAdapters = {
  media: defaultMediaAdapter,
  annotation: defaultAnnotationAdapter,
  idGenerator: defaultIdGeneratorAdapter,
  config: defaultConfigAdapter,
  selection: defaultSelectionAdapter
};

// ========== Utility Functions ==========

/**
 * Merge provided adapters with defaults
 * Ensures all adapter categories exist with fallback implementations
 */
export function mergeAdapters(adapters?: TimelineAdapters): TimelineAdapters {
  if (!adapters) return defaultAdapters;

  return {
    media: { ...defaultMediaAdapter, ...adapters.media },
    annotation: { ...defaultAnnotationAdapter, ...adapters.annotation },
    idGenerator: { ...defaultIdGeneratorAdapter, ...adapters.idGenerator },
    config: { ...defaultConfigAdapter, ...adapters.config },
    // Selection is special - if provided, it's fully controlled; otherwise uncontrolled
    selection: adapters.selection || defaultSelectionAdapter
  };
}
