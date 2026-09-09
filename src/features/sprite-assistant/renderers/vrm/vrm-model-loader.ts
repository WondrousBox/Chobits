import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadVrmModel(modelUrl: string): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await loader.loadAsync(modelUrl);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) {
    VRMUtils.deepDispose(gltf.scene);
    throw new Error('The loaded asset does not contain VRM data');
  }

  try {
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);
    VRMUtils.combineMorphs(vrm);
    if (vrm.meta.metaVersion === '0') {
      VRMUtils.rotateVRM0(vrm);
    }
  } catch (error) {
    VRMUtils.deepDispose(vrm.scene);
    throw error;
  }
  return vrm;
}
