import { app } from "electron"
import path from "path"
import fs from 'fs'

import { DefaultWorkspaceName } from "../config"

// Suggest a default workspace path: ~/Documents/ChobitsWorkspace, fallback to incremented suffix
export function getSuggestWorkspacePath() {
  try {
    const docs = app.getPath('documents')
    const base = path.join(docs, DefaultWorkspaceName)
    if (!fs.existsSync(base)) return { ok: true, path: base }
    for (let i = 2; i < 50; i++) {
      const candidate = `${base} ${i}`
      if (!fs.existsSync(candidate)) return { ok: true, path: candidate }
    }
    return { ok: true, path: base + ' ' + Date.now() }
  } catch { return { ok: false } }
}

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
    const nameWithSuffix = `${baseName.split(".")[0]}_${counter}${path.extname(baseName)}`;
    filePath = path.join(dirName, nameWithSuffix);
    counter++;
  }

  return filePath;
}

export const Env = {
  isLinux: function () {
    return process.platform === "linux";
  },
  isMacOS() {
    return process.platform === "darwin";
  },
  isWindows() {
    return process.platform === "win32";
  },
  isProd: function () {
    return process.env.NODE_ENV !== "development";
  },
  isDev: function () {
    return process.env.NODE_ENV === "development";
  },
};

export function getRealPath(prodPath: string, devPath: string, basePath: string = app.getAppPath()) {
  return path.resolve(basePath, Env.isProd() ? prodPath : devPath);
}