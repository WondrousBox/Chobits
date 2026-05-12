export interface SegmentMarkers {
  start: number;
  loopStart: number;
  loopEnd: number;
  end: number;
}

export type SegmentMarkerKey = keyof SegmentMarkers;

function readTime(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function getDurationLimit(duration?: number): number | undefined {
  return duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function clampTime(value: number, min: number, max?: number): number {
  const minBounded = Math.max(min, value);
  return max === undefined ? minBounded : Math.min(max, minBounded);
}

export function hasLoopSegment(segments: SegmentMarkers): boolean {
  return segments.loopEnd > segments.loopStart;
}

export function isTimeInTrimmedSegment(segments: SegmentMarkers, time: number, duration?: number): boolean {
  if (!Number.isFinite(time)) return false;
  const normalized = normalizeSegmentMarkers(segments, duration);
  return time >= normalized.start && time <= normalized.end;
}

export function normalizeSegmentMarkers(segments: SegmentMarkers, duration?: number): SegmentMarkers {
  const upper = getDurationLimit(duration);
  const start = clampTime(readTime(segments.start, 0), 0, upper);
  const rawEnd = readTime(segments.end, upper ?? start);
  const end = clampTime(upper !== undefined && rawEnd <= 0 ? upper : rawEnd, start, upper);

  if (!hasLoopSegment(segments)) {
    return {
      start,
      loopStart: start,
      loopEnd: start,
      end
    };
  }

  const loopStart = clampTime(readTime(segments.loopStart, start), start, end);
  const loopEnd = clampTime(readTime(segments.loopEnd, loopStart), loopStart, end);

  return {
    start,
    loopStart,
    loopEnd,
    end
  };
}

export function updateSegmentMarker(segments: SegmentMarkers, marker: SegmentMarkerKey, value: number, duration?: number): SegmentMarkers {
  const base = normalizeSegmentMarkers(segments, duration);
  const nextValue = readTime(value, base[marker]);
  const upper = getDurationLimit(duration);

  if (marker === 'start') {
    const start = clampTime(nextValue, 0, base.end);
    if (!hasLoopSegment(base)) {
      return {
        ...base,
        start,
        loopStart: start,
        loopEnd: start
      };
    }

    const loopStart = Math.max(base.loopStart, start);
    const loopEnd = Math.max(base.loopEnd, loopStart);
    return {
      ...base,
      start,
      loopStart,
      loopEnd
    };
  }

  if (marker === 'end') {
    const end = clampTime(nextValue, base.start, upper);
    if (!hasLoopSegment(base)) {
      return {
        ...base,
        loopStart: base.start,
        loopEnd: base.start,
        end
      };
    }

    const loopEnd = Math.min(base.loopEnd, end);
    const loopStart = Math.min(base.loopStart, loopEnd);
    return {
      ...base,
      loopStart,
      loopEnd,
      end
    };
  }

  if (marker === 'loopStart') {
    const loopStart = clampTime(nextValue, base.start, base.end);
    const loopEnd = Math.max(base.loopEnd, loopStart);
    return {
      ...base,
      loopStart,
      loopEnd
    };
  }

  const loopEnd = clampTime(nextValue, base.loopStart, base.end);
  return {
    ...base,
    loopEnd
  };
}
