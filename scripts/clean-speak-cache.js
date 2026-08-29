/**
 * 清理精灵语音合成缓存（sprite-speak-cache）
 * 用法：pnpm clean:speak-cache
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function resolveUserDataDir() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Chobits');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Chobits');
  return path.join(os.homedir(), '.config', 'Chobits');
}

const cacheDir = path.join(resolveUserDataDir(), 'data', 'sprite-speak-cache');
fs.rmSync(cacheDir, { recursive: true, force: true });
console.log(`[clean] 已删除语音缓存目录: ${cacheDir}`);
