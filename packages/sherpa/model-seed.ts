import fs from 'node:fs';
import path from 'node:path';

import { getResourcePath } from '../common/utils/resources-path';
import { PluginConfigStore } from '../plugins/plugin-config-store';

/**
 * 随安装包内置的精简 ASR 模型（SenseVoice int8 权重 + tokens，约 234MB，官方包内含 fp32 副本未携带）。
 * 选 2024-07-17 版而非 2025-09-09 版:后者的官方压缩包只含 fp32 的 model.onnx,没有 int8 权重。
 * 新装用户免下载即可在「机能扩展 → 语音识别」里直接启用;机能扩展页的已安装状态以磁盘目录为准,
 * 种子落盘后会被 plugin-resource:list 的 hydrate 逻辑自动识别为已安装。
 */
export const BUNDLED_ASR_MODEL_NAME = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17';

const BUNDLED_ASR_MODEL_FILES = ['model.int8.onnx', 'tokens.txt'] as const;

/**
 * 把内置 ASR 模型复制到插件模型目录。
 * 幂等:目标文件已齐全或安装包未携带内置模型(如 dev 环境未拉取 LFS)时跳过。
 * @returns 是否执行了复制
 */
export function seedBundledASRModel(): boolean {
  const sherpaResourceDir = getResourcePath('sherpa');
  if (!sherpaResourceDir) {
    return false;
  }

  const sourceDir = path.join(sherpaResourceDir, 'models', BUNDLED_ASR_MODEL_NAME);
  if (!BUNDLED_ASR_MODEL_FILES.every((file) => fs.existsSync(path.join(sourceDir, file)))) {
    return false;
  }

  // 与 pluginResourceManager.getModelPath('plugin:sherpa-onnx', ...) 同一落点，但避免拉起整个下载器依赖链
  const targetDir = path.join(PluginConfigStore.getPluginsDir(), 'sherpa-onnx', 'model', BUNDLED_ASR_MODEL_NAME);
  if (BUNDLED_ASR_MODEL_FILES.every((file) => fs.existsSync(path.join(targetDir, file)))) {
    return false;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of BUNDLED_ASR_MODEL_FILES) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  }
  console.log('[Sherpa] seeded bundled ASR model:', BUNDLED_ASR_MODEL_NAME);
  return true;
}
