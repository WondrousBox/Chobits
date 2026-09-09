import type { Live2DModelTarget } from './live2d-runtime';

const MODEL_SUFFIX = '.model3.json';

export function resolveLive2DModelTarget(localPath: string): Live2DModelTarget {
  const normalized = localPath.trim().replace(/\\/g, '/');
  if (!normalized.toLowerCase().endsWith(MODEL_SUFFIX)) {
    throw new Error(`Live2D model must end with ${MODEL_SUFFIX}`);
  }

  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex <= 0) throw new Error('Live2D model path must include a directory');

  const modelFile = normalized.slice(slashIndex + 1);
  return {
    resourcesBaseUrl: 'res://local/',
    modelDir: encodeURIComponent(normalized.slice(0, slashIndex)),
    modelFileName: modelFile.slice(0, -MODEL_SUFFIX.length)
  };
}
