import React, { createContext, useContext, useMemo } from 'react';

import { DEFAULT_LABELS, mergeAdapters } from '../adapters/defaults';
import type { TimelineAdapters, TimelineLabels } from '../adapters/types';

// ========== Context Definition ==========

const TimelineAdapterContext = createContext<TimelineAdapters>({});

// ========== Provider Component ==========

export interface TimelineProviderProps {
  /** Adapters for external services (optional - uses defaults if not provided) */
  adapters?: TimelineAdapters;
  children: React.ReactNode;
}

/**
 * TimelineAdapterProvider
 * Provides adapter context for all timeline components
 * Merges provided adapters with defaults to ensure all operations have fallbacks
 */
export const TimelineAdapterProvider: React.FC<TimelineProviderProps> = ({ adapters, children }) => {
  const mergedAdapters = useMemo(() => mergeAdapters(adapters), [adapters]);

  return <TimelineAdapterContext.Provider value={mergedAdapters}>{children}</TimelineAdapterContext.Provider>;
};

// ========== Context Hooks ==========

/**
 * Get all adapters from context
 */
export const useTimelineAdapters = (): TimelineAdapters => useContext(TimelineAdapterContext);

/**
 * Get media service adapter from context
 */
export const useMediaAdapter = () => useTimelineAdapters().media;

/**
 * Get annotation service adapter from context
 */
export const useAnnotationAdapter = () => useTimelineAdapters().annotation;

/**
 * Get ID generator adapter from context
 */
export const useIdGeneratorAdapter = () => useTimelineAdapters().idGenerator;

/**
 * Get configuration adapter from context
 */
export const useConfigAdapter = () => useTimelineAdapters().config;

/**
 * Get selection adapter from context
 * Returns undefined in uncontrolled mode
 */
export const useSelectionAdapter = () => useTimelineAdapters().selection;

// ========== Specialized Hooks ==========

/**
 * Get merged labels (user overrides + defaults)
 */
export const useLabels = (): Required<TimelineLabels> => {
  const config = useConfigAdapter();
  return useMemo(() => ({ ...DEFAULT_LABELS, ...config?.labels }), [config?.labels]);
};

/**
 * Check if selection is in controlled mode
 * Controlled mode: at least one selection value or callback is provided
 */
export const useIsControlledSelection = (): boolean => {
  const selection = useSelectionAdapter();
  if (!selection) return false;
  return (
    selection.selectedSegmentId !== undefined ||
    selection.selectedTTS !== undefined ||
    selection.selectedClipId !== undefined ||
    selection.selectedMediaSegmentId !== undefined ||
    !!selection.onSelectedSegmentChange ||
    !!selection.onSelectedTTSChange ||
    !!selection.onSelectedClipChange ||
    !!selection.onSelectedMediaSegmentChange
  );
};
