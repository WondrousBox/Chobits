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
