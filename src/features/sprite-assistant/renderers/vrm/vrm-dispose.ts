import { type VRM, VRMUtils } from '@pixiv/three-vrm';
import type { WebGLRenderer } from 'three';

export function disposeVrm(vrm: VRM | null | undefined): void {
  if (vrm) VRMUtils.deepDispose(vrm.scene);
}

export function disposeVrmRenderer(renderer: WebGLRenderer | null | undefined): void {
  if (!renderer) return;
  renderer.renderLists.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
