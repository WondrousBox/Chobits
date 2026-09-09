import { Box3, MathUtils, type Object3D, PerspectiveCamera, Vector3 } from 'three';

export interface VrmCameraConfig {
  targetY?: number;
  fov?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface VrmCameraFrame {
  target: Vector3;
  distance: number;
}

export function calculateVrmCameraFrame(model: Object3D, aspect: number, config?: VrmCameraConfig): VrmCameraFrame {
  const bounds = new Box3().setFromObject(model);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const fov = MathUtils.clamp(config?.fov ?? 35, 10, 90);
  const verticalFov = MathUtils.degToRad(fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);
  const scale = Math.max(config?.scale ?? 1, 0.01);
  const distanceForHeight = size.y / (2 * Math.tan(verticalFov / 2));
  const distanceForWidth = size.x / (2 * Math.tan(horizontalFov / 2));

  return {
    target: new Vector3(center.x + (config?.offsetX ?? 0), (config?.targetY ?? center.y) + (config?.offsetY ?? 0), center.z),
    distance: (Math.max(distanceForHeight, distanceForWidth, size.z, 0.1) * 1.12) / scale
  };
}

export function frameVrmCamera(camera: PerspectiveCamera, model: Object3D, aspect: number, config?: VrmCameraConfig): void {
  const fov = MathUtils.clamp(config?.fov ?? 35, 10, 90);
  const frame = calculateVrmCameraFrame(model, aspect, config);
  camera.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  camera.fov = fov;
  camera.near = Math.max(frame.distance / 100, 0.01);
  camera.far = Math.max(frame.distance * 100, 100);
  camera.position.set(frame.target.x, frame.target.y, frame.target.z + frame.distance);
  camera.lookAt(frame.target);
  camera.updateProjectionMatrix();
}
