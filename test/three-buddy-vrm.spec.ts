import { readFileSync } from 'node:fs';
import path from 'node:path';

import { VRMLoaderPlugin, VRMRequiredHumanBoneName } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';

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
    expect(vrm.scene.children.length).toBeGreaterThan(0);
  });
});
