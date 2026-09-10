import { readFileSync } from 'node:fs';
import path from 'node:path';

import { VRMLoaderPlugin, VRMRequiredHumanBoneName } from '@pixiv/three-vrm';
import { createVRMAnimationClip, type VRMAnimation, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';

import { getVrmAnimationControlMask } from '../src/features/sprite-assistant/renderers/vrm/vrm-motion-controller';

describe('Three Buddy VRM asset', () => {
  it('is a loadable VRM 1.0 model with every required humanoid bone', async () => {
    const modelPath = path.resolve('resources/character-packs/three-buddy/models/three-buddy.vrm');
    const bytes = readFileSync(modelPath);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const gltf = await loader.parseAsync(buffer, '');
    const vrm = gltf.userData.vrm;

    expect(vrm).toBeDefined();
    expect(vrm.meta).toMatchObject({ metaVersion: '1', name: 'Three Buddy', authors: ['Chobits contributors'] });
    for (const boneName of Object.values(VRMRequiredHumanBoneName)) {
      expect(vrm.humanoid.getRawBoneNode(boneName), boneName).not.toBeNull();
    }
    expect(vrm.expressionManager?.getExpression('aa')).not.toBeNull();
    expect(vrm.expressionManager?.getExpression('blink')).not.toBeNull();
    expect(vrm.expressionManager?.getExpression('happy')).not.toBeNull();
    expect(vrm.lookAt).toBeDefined();
    expect(vrm.scene.children.length).toBeGreaterThan(0);
  });

  it('parses and retargets all bundled VRMA motions', async () => {
    const modelBytes = readFileSync(path.resolve('resources/character-packs/three-buddy/models/three-buddy.vrm'));
    const modelLoader = new GLTFLoader();
    modelLoader.register((parser) => new VRMLoaderPlugin(parser));
    const modelBuffer = modelBytes.buffer.slice(modelBytes.byteOffset, modelBytes.byteOffset + modelBytes.byteLength);
    const modelGltf = await modelLoader.parseAsync(modelBuffer, '');
    const vrm = modelGltf.userData.vrm;
    const expected = {
      idle: { mood: false, blink: false, mouth: false, lookAt: false },
      walk: { mood: false, blink: false, mouth: false, lookAt: false },
      welcome: { mood: true, blink: false, mouth: false, lookAt: true },
      thinking: { mood: true, blink: false, mouth: false, lookAt: false }
    };

    for (const [id, controlMask] of Object.entries(expected)) {
      const bytes = readFileSync(path.resolve('resources/character-packs/three-buddy/motions', id + '.vrma'));
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await loader.parseAsync(buffer, '');
      const animation = (gltf.userData.vrmAnimations as VRMAnimation[] | undefined)?.[0];

      expect(animation, id).toBeDefined();
      expect(animation!.duration, id).toBeGreaterThan(0);
      expect(getVrmAnimationControlMask(animation!), id).toEqual(controlMask);
      const clip = createVRMAnimationClip(animation!, vrm);
      expect(clip.tracks.length, id).toBeGreaterThan(0);
    }
  });
});
