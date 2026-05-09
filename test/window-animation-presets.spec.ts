import { describe, expect, it } from 'vitest';

import { createWindowAnimationPresetFrames, type WindowAnimationPresetFrame } from '../src/pages/ExtensionSettings/window-animation-presets';

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
});
