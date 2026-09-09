import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';

import { getSpriteAnimationSourceKind, normalizeSpritePresentationConfig } from '../packages/sprite-core/types';
import { calculateVrmCameraFrame } from '../src/features/sprite-assistant/renderers/vrm/vrm-camera';

describe('sprite presentation contracts', () => {
  it('keeps legacy sources on video and recognizes explicit backend kinds', () => {
    expect(getSpriteAnimationSourceKind()).toBe('video');
    expect(getSpriteAnimationSourceKind({ localPath: './idle.webm' })).toBe('video');
    expect(getSpriteAnimationSourceKind({ kind: 'live2d', localPath: './model3.json' })).toBe('live2d');
    expect(getSpriteAnimationSourceKind({ kind: 'three', localPath: './idle.vrma' })).toBe('three');
  });

  it('normalizes renderer snapshots without inventing a VRM model path', () => {
    expect(normalizeSpritePresentationConfig(undefined)).toEqual({ renderer: 'video' });
    expect(normalizeSpritePresentationConfig({ renderer: 'live2d' })).toEqual({ renderer: 'live2d' });
    expect(
      normalizeSpritePresentationConfig({
        renderer: 'live2d',
        model: { localPath: './runtime/avatar.model3.json' },
        config: { localPath: './live2d.json', type: 'text/plain' }
      })
    ).toEqual({
      renderer: 'live2d',
      model: { localPath: './runtime/avatar.model3.json', type: 'model/live2d' },
      config: { localPath: './live2d.json', type: 'application/json' }
    });
    expect(normalizeSpritePresentationConfig({ renderer: 'three' })).toEqual({ renderer: 'three' });
    expect(
      normalizeSpritePresentationConfig({
        renderer: 'three',
        model: { localPath: './avatar.vrm' },
        camera: { fov: 42, scale: Number.NaN, offsetX: 0.2 }
      })
    ).toEqual({
      renderer: 'three',
      model: { localPath: './avatar.vrm', format: 'vrm', type: 'model/vrm' },
      camera: { fov: 42, offsetX: 0.2 }
    });
  });

  it('frames model bounds and applies camera scale and offsets deterministically', () => {
    const model = new Group();
    model.add(new Mesh(new BoxGeometry(2, 4, 1), new MeshBasicMaterial()));

    const base = calculateVrmCameraFrame(model, 1, { fov: 40 });
    const zoomed = calculateVrmCameraFrame(model, 1, { fov: 40, scale: 2, offsetX: 0.5, offsetY: 0.25 });

    expect(base.distance).toBeGreaterThan(0);
    expect(zoomed.distance).toBeCloseTo(base.distance / 2);
    expect(zoomed.target.x).toBeCloseTo(base.target.x + 0.5);
    expect(zoomed.target.y).toBeCloseTo(base.target.y + 0.25);
  });
});
