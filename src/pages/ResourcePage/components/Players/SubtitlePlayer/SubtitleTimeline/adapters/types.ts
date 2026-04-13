import type React from 'react';

// ========== Common Types ==========

/**
 * Word timestamp for subtitle segments
 */
export interface WordTimestamp {
  /** Start time in seconds */
  st: number;
  /** End time in seconds */
  et: number;
  /** Word text */
  text: string;
}

/**
 * Media file information
 */
export interface MediaInfo {
  width: number;
  height: number;
  duration?: number;
}

/**
 * File picker result
 */
export interface FilePickResult {
  canceled: boolean;
  paths?: string[];
  path?: string;
}

/**
 * File picker options
 */
export interface FilePickOptions {
  filters?: Array<{ name: string; extensions: string[] }>;
  multi?: boolean;
}

// ========== Annotation Types ==========

export type AnnotationType = 'highlight' | 'note' | 'vocabulary' | 'comment' | 'custom';

/**
 * Annotation item interface (business-independent)
 */
export interface AnnotationItem {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  segmentIndex: number;
  wordStartIndex: number;
  wordEndIndex: number;
  title?: string;
  description?: string;
  type: AnnotationType;
  color?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

// ========== Media Service Adapter ==========

/**
 * Media service adapter for file operations
 * Provides media file handling capabilities
 */
export interface MediaServiceAdapter {
  /** Get media file information (dimensions, duration) */
  getMediaInfo?: (filePath: string) => Promise<MediaInfo | null>;
  /** Open file picker dialog */
  pickFiles?: (options: FilePickOptions) => Promise<FilePickResult | null>;
  /** Extract audio waveform data */
  extractWaveform?: (inputPath: string, samplesCount: number) => Promise<{ peaks: number[]; duration: number }>;
  /** Generate video thumbnails */
  generateThumbnails?: (videoPath: string, times: number[]) => Promise<string[]>;
}

// ========== Annotation Service Adapter ==========

/**
 * Annotation service adapter for annotation-related operations
 */
export interface AnnotationServiceAdapter {
  /** Get color for annotation type */
  getAnnotationColor?: (type: AnnotationType) => string;
  /** Get icon component for annotation type */
  getAnnotationTypeIcon?: (type: AnnotationType) => React.ReactNode;
}

// ========== ID Generator Adapter ==========

/**
 * ID generator adapter for creating unique identifiers
 */
export interface IdGeneratorAdapter {
  /** Generate a unique source ID */
  generateSourceId?: () => string;
  /** Generate a unique segment ID */
  generateSegmentId?: (trackIndex: number, segmentIndex: number) => string;
  /** Parse segment ID back to indices */
  parseSegmentId?: (id: string) => { trackIndex: number; segmentIndex: number } | null;
  /** Generate a unique media source ID */
  generateMediaSourceId?: () => string;
}

// ========== Configuration Adapter ==========

/**
 * UI labels for i18n support
 * All labels have built-in defaults (Chinese), override to localize
 */
export interface TimelineLabels {
  // --- Toolbar ---
  /** Zoom out button tooltip */
  zoomOut?: string;
  /** Zoom in button tooltip */
  zoomIn?: string;
  /** Zoom level tooltip template, use {value} as placeholder */
  zoomLevel?: string;
  /** Select tool tooltip */
  selectTool?: string;
  /** Cut tool tooltip */
  cutTool?: string;
  /** Import media button tooltip */
  importMedia?: string;
  /** Track count display, use {count} as placeholder */
  trackCount?: string;
  /** Segment count display, use {count} as placeholder */
  segmentCount?: string;
  /** Waveform track label */
  waveform?: string;
  /** Waveform + clip overlay track label */
  waveformClip?: string;
  /** Clip track label */
  clip?: string;
  /** Default track labels (index-based fallback) */
  defaultTrackLabels?: string[];
  /** Fallback track label template, use {index} as placeholder */
  trackLabelTemplate?: string;

  // --- Common ---
  cancel?: string;
  delete?: string;
  settings?: string;
  show?: string;
  hide?: string;
  deleteTrack?: string;
  deleteConfirmTitle?: string;
  /** use {label} as placeholder for track name */
  deleteConfirmDescription?: string;
  comingSoon?: string;
  annotationDefaultLabel?: string;

  // --- Inline input ---
  inlineInputPlaceholder?: string;

  // --- Track add menu ---
  trackAddButtonLabel?: string;
  trackAddSubtitle?: string;
  trackAddTTS?: string;
  trackAddMedia?: string;

  // --- Block actions ---
  blockEdit?: string;
  blockPause?: string;
  blockPlay?: string;
  blockMoveUp?: string;
  blockMoveDown?: string;
  blockDragEdgeSpeed?: string;
  blockTransformSettings?: string;
  blockRotate90?: string;
  blockRestore?: string;
  blockMergePrev?: string;
  blockDelete?: string;
  /** use {maxLength} as placeholder */
  blockValidationEmpty?: string;
  blockValidationControlChar?: string;
  blockValidationArrow?: string;
  /** use {maxLength} as placeholder */
  blockValidationMaxLength?: string;
  blockValidationInvalid?: string;
  blockEditHint?: string;
  blockWaveformLoading?: string;

  // --- Block handles ---
  blockHandlesDragSpeed?: string;
  blockHandlesDragTime?: string;

  // --- Block order ---
  /** use {order} as placeholder */
  blockOrderPlayback?: string;

  // --- Block status ---
  blockStatusSynthesizing?: string;
  blockStatusSynthesisFailed?: string;
  blockStatusPending?: string;

  // --- Media import ---
  mediaImportNoValidFiles?: string;
  mediaImportProcessError?: string;
  mediaImportDragDropPathError?: string;
  mediaImportOpenDialogError?: string;
  mediaImportTitle?: string;
  mediaImportProcessing?: string;
  mediaImportDragDropHint?: string;
  mediaImportSelectFiles?: string;
  /** use {count} as placeholder */
  mediaImportSelectedFiles?: string;
  mediaImportAddToTrack?: string;
  mediaImportNewTrack?: string;
  mediaImportClearSelection?: string;
  /** use {count} as placeholder */
  mediaImportConfirm?: string;

  // --- Media track ---
  mediaTrackHide?: string;
  mediaTrackShow?: string;
  mediaTrackDelete?: string;
  mediaTrackDeleteConfirmTitle?: string;
  /** use {label} as placeholder */
  mediaTrackDeleteConfirmDescription?: string;

  // --- Media quick add ---
  mediaQuickAddDropToRelease?: string;
  mediaQuickAddProcessing?: string;
  mediaQuickAddMenuTitle?: string;
  mediaQuickAddSelectFile?: string;
  mediaQuickAddFromLibrary?: string;

  // --- Media transform ---
  mediaTransformTitle?: string;
  mediaTransformQuickActions?: string;
  mediaTransformCenter?: string;
  mediaTransformFitScreen?: string;
  mediaTransformFit?: string;
  mediaTransformFillScreen?: string;
  mediaTransformFill?: string;
  mediaTransformPositionX?: string;
  mediaTransformPositionY?: string;
  mediaTransformScale?: string;
  mediaTransformRotation?: string;
  mediaTransformOpacity?: string;
  mediaTransformFlip?: string;
  mediaTransformFlipHorizontal?: string;
  mediaTransformFlipVertical?: string;
  mediaTransformReset?: string;

  // --- Media transition ---
  transitionTypeNone?: string;
  transitionTypeNoneDesc?: string;
  transitionTypeFade?: string;
  transitionTypeFadeDesc?: string;
  transitionTypeDissolve?: string;
  transitionTypeDissolveDesc?: string;
  transitionTypeWipeLeft?: string;
  transitionTypeWipeLeftDesc?: string;
  transitionTypeWipeRight?: string;
  transitionTypeWipeRightDesc?: string;
  transitionIn?: string;
  transitionOut?: string;
  transitionLabel?: string;
  transitionDuration?: string;
  transitionRemove?: string;
  /** use {position} (入场/出场) as placeholder */
  transitionAddIn?: string;
  transitionAddOut?: string;

  // --- Thumbnail ---
  thumbnailLoading?: string;
  thumbnailNoPreview?: string;
  /** use {index} as placeholder */
  thumbnailAlt?: string;

  // --- TTS batch ---
  ttsBatchClearText?: string;
  ttsBatchConfigWarning?: string;
  ttsBatchInputLabel?: string;
  ttsBatchPlaceholder?: string;
  ttsBatchPlaceholderLine1?: string;
  ttsBatchPlaceholderLine2?: string;
  ttsBatchPlaceholderLine3?: string;
  /** use {completed} and {total} as placeholders */
  ttsBatchPreviewLabel?: string;
  ttsBatchCompleted?: string;
  ttsBatchSynthesizing?: string;
  ttsBatchStopSynthesis?: string;
  /** use {pending} as placeholder */
  ttsBatchStartSynthesis?: string;
}

/**
 * Configuration adapter for customizable settings
 */
export interface ConfigAdapter {
  /** Supported video file extensions (without dot) */
  videoExtensions?: string[];
  /** Supported image file extensions (without dot) */
  imageExtensions?: string[];
  /** Default media info when IPC unavailable */
  defaultMediaInfo?: MediaInfo;
  /** TTS waveform sample count */
  waveformSampleCount?: number;
  /** UI labels for i18n */
  labels?: TimelineLabels;
}

// ========== Selection State Adapters (Controlled Mode) ==========

/**
 * Selection adapters for controlled/uncontrolled mode support
 * When provided, the component operates in controlled mode
 */
export interface SelectionAdapters {
  /** Selected subtitle segment ID (controlled mode) */
  selectedSegmentId?: string | null;
  /** Selected TTS block (controlled mode) */
  selectedTTS?: { trackId: string; index: number } | null;
  /** Selected clip ID (controlled mode) */
  selectedClipId?: string | null;
  /** Selected media segment ID (controlled mode) */
  selectedMediaSegmentId?: string | null;
  /** Selection change callbacks */
  onSelectedSegmentChange?: (id: string | null) => void;
  onSelectedTTSChange?: (selection: { trackId: string; index: number } | null) => void;
  onSelectedClipChange?: (id: string | null) => void;
  onSelectedMediaSegmentChange?: (id: string | null) => void;
}

// ========== Combined Adapters Interface ==========

/**
 * Combined adapters interface for all external dependencies
 * All properties are optional - the component works in standalone mode without adapters
 */
export interface TimelineAdapters {
  /** Media service operations */
  media?: MediaServiceAdapter;
  /** Annotation service operations */
  annotation?: AnnotationServiceAdapter;
  /** ID generation operations */
  idGenerator?: IdGeneratorAdapter;
  /** Configuration settings */
  config?: ConfigAdapter;
  /** Selection state (controlled mode) */
  selection?: SelectionAdapters;
}
