import { describe, expect, it } from 'vitest';

import { isTimeInTrimmedSegment, normalizeSegmentMarkers, updateSegmentMarker } from '../../src/pages/ExtensionSettings/sprite-video-segments';

describe('sprite video segment markers', () => {
  it('keeps trimmed start when end is dragged before a loop segment exists', () => {
    const duration = 10_000;
    const afterStartDrag = updateSegmentMarker({ start: 0, loopStart: 0, loopEnd: 0, end: duration }, 'start', 2_000, duration);

    expect(afterStartDrag).toEqual({
      start: 2_000,
      loopStart: 2_000,
      loopEnd: 2_000,
      end: duration
    });

    expect(updateSegmentMarker(afterStartDrag, 'end', 8_000, duration)).toEqual({
      start: 2_000,
      loopStart: 2_000,
      loopEnd: 2_000,
      end: 8_000
    });
  });

  it('keeps trimmed end when start is dragged before a loop segment exists', () => {
    const duration = 10_000;
    const afterEndDrag = updateSegmentMarker({ start: 0, loopStart: 0, loopEnd: 0, end: duration }, 'end', 8_000, duration);

    expect(updateSegmentMarker(afterEndDrag, 'start', 2_000, duration)).toEqual({
      start: 2_000,
      loopStart: 2_000,
      loopEnd: 2_000,
      end: 8_000
    });
  });

  it('only clamps loop markers when trimmed bounds cross them', () => {
    const duration = 10_000;
    const segments = { start: 1_000, loopStart: 3_000, loopEnd: 7_000, end: 9_000 };

    expect(updateSegmentMarker(segments, 'start', 2_000, duration)).toEqual({
      start: 2_000,
      loopStart: 3_000,
      loopEnd: 7_000,
      end: 9_000
    });

    expect(updateSegmentMarker(segments, 'start', 4_000, duration)).toEqual({
      start: 4_000,
      loopStart: 4_000,
      loopEnd: 7_000,
      end: 9_000
    });

    expect(updateSegmentMarker(segments, 'end', 6_000, duration)).toEqual({
      start: 1_000,
      loopStart: 3_000,
      loopEnd: 6_000,
      end: 6_000
    });
  });

  it('normalizes empty imported markers to the full clip after metadata loads', () => {
    expect(normalizeSegmentMarkers({ start: 0, loopStart: 0, loopEnd: 0, end: 0 }, 12_000)).toEqual({
      start: 0,
      loopStart: 0,
      loopEnd: 0,
      end: 12_000
    });
  });

  it('detects whether a hover time is inside the trimmed clip bounds', () => {
    const segments = { start: 2_000, loopStart: 2_000, loopEnd: 2_000, end: 8_000 };

    expect(isTimeInTrimmedSegment(segments, 1_999, 10_000)).toBe(false);
    expect(isTimeInTrimmedSegment(segments, 2_000, 10_000)).toBe(true);
    expect(isTimeInTrimmedSegment(segments, 8_000, 10_000)).toBe(true);
    expect(isTimeInTrimmedSegment(segments, 8_001, 10_000)).toBe(false);
  });
});
