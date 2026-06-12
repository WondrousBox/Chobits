import { describe, expect, it } from 'vitest';

import { createMainWindowAnimationPresetTimeline, createWindowAnimationPresetFrames, serializeWindowAnimationPresetFrames, type WindowAnimationPresetFrame } from '../src/pages/ExtensionSettings/window-animation-presets';

const workArea = { x: 0, y: 0, width: 1440, height: 900 };

function createBaseFrame(patch: Partial<WindowAnimationPresetFrame> = {}): WindowAnimationPresetFrame {
  return {
    x: 720,
    y: 450,
    width: 240,
    height: 160,
    opacity: 0.9,
    duration: 0,
    easing: 'linear',
    curve: 'line',
    ...patch
  };
}

function expectNoProperties(value: object, keys: string[]): void {
  for (const key of keys) {
    expect(value).not.toHaveProperty(key);
  }
}

function resolveInheritedSizes(keyframes: Array<{ width?: number; height?: number }>, startSize: { width: number; height: number }): Array<{ width: number; height: number }> {
  let previous = startSize;
  return keyframes.map((keyframe) => {
    previous = {
      width: keyframe.width ?? previous.width,
      height: keyframe.height ?? previous.height
    };
    return previous;
  });
}

describe('window animation presets', () => {
  it('creates fly-in frames from outside the selected side to the base frame', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'fly-in',
      baseFrame,
      positionAnchor: 'center',
      direction: 'left',
      duration: 800,
      workArea
    });

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ x: -168, y: 450, width: 240, height: 160, opacity: 0, duration: 0 });
    expect(frames[1]).toMatchObject({ x: 720, y: 450, width: 240, height: 160, opacity: 0.9, duration: 800 });
  });

  it('creates fly-out frames that end outside the selected side', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'fly-out',
      baseFrame,
      positionAnchor: 'center',
      direction: 'right',
      duration: 700,
      workArea
    });

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ x: 720, y: 450, opacity: 0.9, duration: 0 });
    expect(frames[1]).toMatchObject({ x: 1608, y: 450, opacity: 0, duration: 700 });
  });

  it('keeps placement on effects that return to the authored base frame', () => {
    const baseFrame = createBaseFrame({
      placement: { anchor: 'right', display: 'current', useWorkArea: true, margin: 16 }
    });

    const frames = createWindowAnimationPresetFrames({
      presetId: 'pulse',
      baseFrame,
      positionAnchor: 'center',
      duration: 600,
      workArea
    });

    expect(frames[0].placement).toEqual(baseFrame.placement);
    expect(frames[1].placement).toEqual(baseFrame.placement);
    expect(frames[2]).toMatchObject({ x: baseFrame.x, y: baseFrame.y, width: baseFrame.width, height: baseFrame.height });
    expect(frames[2].placement).toEqual(baseFrame.placement);
  });

  it('builds zoom presets by changing size around the selected position anchor', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'zoom-in',
      baseFrame,
      positionAnchor: 'center',
      duration: 500,
      workArea
    });

    expect(frames[0]).toMatchObject({ x: 720, y: 450, width: 84, height: 56, opacity: 0, duration: 0 });
    expect(frames[1]).toMatchObject({ x: 720, y: 450, width: 240, height: 160, opacity: 0.9, duration: 500 });
  });

  it('builds shake presets as a short multi-keyframe emphasis motion', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'shake',
      baseFrame,
      positionAnchor: 'center',
      direction: 'top',
      duration: 500,
      workArea
    });

    expect(frames).toHaveLength(6);
    expect(frames[0]).toMatchObject({ x: 720, y: 450, duration: 0 });
    expect(frames[1].y).toBeLessThan(baseFrame.y);
    expect(frames[2].y).toBeGreaterThan(baseFrame.y);
    expect(frames[5]).toMatchObject({ x: baseFrame.x, y: baseFrame.y, width: baseFrame.width, height: baseFrame.height });
  });

  it('serializes fly presets without size fields', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'fly-in',
      baseFrame,
      positionAnchor: 'center',
      direction: 'left',
      duration: 800,
      workArea
    });

    const keyframes = serializeWindowAnimationPresetFrames({ presetId: 'fly-in', frames });

    expect(keyframes).toEqual([
      { x: -168, y: 450, opacity: 0 },
      { x: 720, y: 450, opacity: 0.9, duration: 800, easing: 'ease-out-cubic' }
    ]);
    for (const keyframe of keyframes) {
      expectNoProperties(keyframe, ['width', 'height', 'curve']);
    }
    expectNoProperties(keyframes[0], ['duration', 'easing']);
  });

  it('serializes fade presets as opacity-only timelines', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'fade-in',
      baseFrame,
      positionAnchor: 'center',
      duration: 650,
      workArea
    });

    const keyframes = serializeWindowAnimationPresetFrames({ presetId: 'fade-in', frames });

    expect(keyframes).toEqual([{ opacity: 0 }, { opacity: 0.9, duration: 650, easing: 'ease-out' }]);
    for (const keyframe of keyframes) {
      expectNoProperties(keyframe, ['x', 'y', 'width', 'height', 'placement', 'curve']);
    }
  });

  it('serializes shake presets without size or opacity fields', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'shake',
      baseFrame,
      positionAnchor: 'center',
      direction: 'top',
      duration: 500,
      workArea
    });

    const keyframes = serializeWindowAnimationPresetFrames({ presetId: 'shake', frames });

    expect(keyframes).toHaveLength(6);
    expect(keyframes[0]).toEqual({ x: 720, y: 450 });
    expect(keyframes[1]).toMatchObject({ x: 720, y: 437, duration: 100, easing: 'ease-out' });
    expect(keyframes[5]).toMatchObject({ x: 720, y: 450, duration: 100, easing: 'ease-out' });
    for (const keyframe of keyframes) {
      expectNoProperties(keyframe, ['width', 'height', 'opacity', 'curve']);
    }
  });

  it('keeps position and size on zoom presets until the manager supports anchor-based missing position', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'zoom-in',
      baseFrame,
      positionAnchor: 'center',
      duration: 500,
      workArea
    });

    const keyframes = serializeWindowAnimationPresetFrames({ presetId: 'zoom-in', frames });

    expect(keyframes).toEqual([
      { x: 720, y: 450, width: 84, height: 56, opacity: 0 },
      { x: 720, y: 450, width: 240, height: 160, opacity: 0.9, duration: 500, easing: 'ease-out-cubic' }
    ]);
    for (const keyframe of keyframes) {
      expectNoProperties(keyframe, ['placement', 'curve']);
    }
  });

  it('serializes pulse presets with size but without opacity', () => {
    const baseFrame = createBaseFrame();
    const frames = createWindowAnimationPresetFrames({
      presetId: 'pulse',
      baseFrame,
      positionAnchor: 'center',
      duration: 600,
      workArea
    });

    const keyframes = serializeWindowAnimationPresetFrames({ presetId: 'pulse', frames });

    expect(keyframes).toEqual([
      { x: 720, y: 450, width: 240, height: 160 },
      { x: 720, y: 450, width: 269, height: 179, duration: 300, easing: 'ease-out' },
      { x: 720, y: 450, width: 240, height: 160, duration: 300, easing: 'ease-in-out' }
    ]);
    for (const keyframe of keyframes) {
      expectNoProperties(keyframe, ['opacity', 'placement', 'curve']);
    }
  });

  it('lets playback inherit the current size for position and opacity only presets', () => {
    const baseFrame = createBaseFrame();
    const startSize = { width: 333, height: 222 };
    const cases = [
      { presetId: 'fly-in' as const, direction: 'left' as const },
      { presetId: 'fade-in' as const },
      { presetId: 'shake' as const, direction: 'top' as const }
    ];

    for (const testCase of cases) {
      const frames = createWindowAnimationPresetFrames({
        presetId: testCase.presetId,
        baseFrame,
        positionAnchor: 'center',
        direction: testCase.direction,
        duration: 500,
        workArea
      });
      const keyframes = serializeWindowAnimationPresetFrames({ presetId: testCase.presetId, frames });

      for (const keyframe of keyframes) {
        expectNoProperties(keyframe, ['width', 'height']);
      }
      expect(resolveInheritedSizes(keyframes, startSize)).toEqual(keyframes.map(() => startSize));
    }
  });

  it('creates sparse main-window playback timelines for non-editable presets', () => {
    const timeline = createMainWindowAnimationPresetTimeline({
      presetId: 'fly-in',
      bounds: { x: 500, y: 370, width: 220, height: 220 },
      workArea,
      windowKey: 'main'
    });

    expect(timeline).toMatchObject({
      id: 'chobits-window-main-fly-in',
      positionAnchor: 'center',
      createIfMissing: false,
      showBeforePlay: true,
      clampToWorkArea: false,
      suspendFollowMainDuringPlay: true,
      refreshFollowerAfterPlay: false
    });
    expect(timeline.coordinateSpace).toBeUndefined();
    expect(timeline.keyframes).toEqual([
      { x: -158, y: 480, opacity: 0 },
      { x: 610, y: 480, opacity: 1, duration: 650, easing: 'ease-out-cubic' }
    ]);
    for (const keyframe of timeline.keyframes) {
      expectNoProperties(keyframe, ['width', 'height', 'curve']);
    }
  });
});
