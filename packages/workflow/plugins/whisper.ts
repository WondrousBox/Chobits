import fs from 'node:fs';
import { platform } from 'node:os';

import { pluginResourceManager } from '../../plugins/plugin-resource-manager';
import { Plugin } from '../types';

export const WhisperPlugin: Plugin = {
  id: 'plugin:whisper',
  label: 'Whisper CLI',
  description: 'OpenAI Whisper 命令行工具，用于音频和视频转录',
  capabilities: ['transcribe'],
  installHint: '通过插件资源管理器下载 Whisper 转录插件',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async isInstalled(ctx) {
    // 首先检查资源管理器中是否已安装
    const enginePath = pluginResourceManager.getEnginePath('plugin:whisper', platform() === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
    if (fs.existsSync(enginePath)) {
      return true;
    }
    return false;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async prepare(ctx) {
    // 如果资源管理器中安装了engine，可以在这里设置环境变量或路径
    // 目前whisper CLI通常通过PATH访问，所以暂时不需要额外准备
    // 后续可以在这里添加模型预下载逻辑
  }
};
