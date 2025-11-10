import { spawn } from 'node:child_process';

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
  installHint: process.platform === 'win32' ? 'pip install -U openai-whisper' : 'pip install -U openai-whisper  # 并确保已安装 ffmpeg',
  async isInstalled() {
    // 仅检测 whisper 命令是否存在。后续可扩展 python -m whisper --help 检测。
    return await existsInPath('whisper');
  },
  async prepare() {
    // 初版无需额外准备。可在此加入设备选择或模型预下载逻辑。
  }
};
