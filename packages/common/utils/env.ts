import { app } from 'electron';
import path from 'path';

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

export function getRealPath(prodPath: string, devPath: string, basePath: string = app.getAppPath()): string {
  return path.resolve(basePath, Env.isProd() ? prodPath : devPath);
}
