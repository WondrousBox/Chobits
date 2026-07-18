import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import { resolveRuntimeDataDir } from './runtime-data';

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
    // Use Electron's packaging signal. NODE_ENV may be undefined in production builds.
    return app.isPackaged;
  },
  isDev: function () {
    // Treat anything other than packaged as dev-like (includes 'development' and 'test')
    return !app.isPackaged;
  }
};

export function getRuntimeDataDir(): string {
  return resolveRuntimeDataDir(app.getPath('userData'), app.isPackaged);
}

export function getRealPath(prodPath: string, devPath: string, basePath: string = app.getAppPath()): string {
  return path.resolve(basePath, Env.isProd() ? prodPath : devPath);
}
