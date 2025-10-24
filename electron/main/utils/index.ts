import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * 输入一个文件地址，如果文件已经存在，则更换文件名
 *
 * @export
 * @param {string} filePath
 * @return {*}  {string}
 */
export function findUniqueFileName(filePath: string): string {
  const baseName = path.basename(filePath);
  const dirName = path.dirname(filePath);
  let counter = 1;

  while (fs.existsSync(filePath)) {
    const nameWithSuffix = `${baseName.split('.')[0]}_${counter}${path.extname(baseName)}`;
    filePath = path.join(dirName, nameWithSuffix);
    counter++;
  }

  return filePath;
}

export const Env = {
  isLinux: function () {
    return process.platform === 'linux';
  },
  isMacOS() {
    return process.platform === 'darwin';
  },
  isWindows() {
    return process.platform === 'win32';
  },
  isProd: function () {
    return process.env.NODE_ENV === 'production';
  },
  isDev: function () {
    // Treat anything other than production as dev-like (includes 'development' and 'test')
    return process.env.NODE_ENV !== 'production';
  }
};

export function getRealPath(prodPath: string, devPath: string, basePath?: string): string {
  let base = basePath;
  if (!base) {
    try {
      base = (app as any)?.getAppPath?.();
    } catch {
      // ignore
    }
  }
  if (!base) {
    // In non-Electron contexts (tests), fall back to process.cwd()
    base = process.cwd();
  }
  return path.resolve(base, Env.isProd() ? prodPath : devPath);
}
