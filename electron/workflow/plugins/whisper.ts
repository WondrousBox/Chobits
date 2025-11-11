import { spawn } from 'node:child_process';
import fs from 'node:fs';

import { pluginResourceManager } from '../../main/plugins/plugin-resource-manager';
import { Plugin } from '../types';

function existsInPath(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

export const WhisperPlugin: Plugin = {
  id: 'plugin:whisper',
  label: 'Whisper CLI',
  description: 'Provides transcription capability via openai-whisper (whisper CLI)',
  capabilities: ['transcribe'],
  installHint: '可以通过插件资源管理器下载Whisper CLI，或手动安装: pip install -U openai-whisper',
  async isInstalled(ctx) {
    // 首先检查资源管理器中是否已安装
    const enginePath = pluginResourceManager.getEnginePath('plugin:whisper', 'whisper');
    if (fs.existsSync(enginePath)) {
      return true;
    }
    // 回退到检查PATH中的whisper命令
    return await existsInPath('whisper');
  },
  async prepare(ctx) {
    // 如果资源管理器中安装了engine，可以在这里设置环境变量或路径
    // 目前whisper CLI通常通过PATH访问，所以暂时不需要额外准备
    // 后续可以在这里添加模型预下载逻辑
  }
};
