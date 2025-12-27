import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// 查找 pnpm 模块路径的辅助函数
export function findPnpmModulePath(basePath: string, moduleName: string): string | null {
  const pnpmDir = path.resolve(basePath, 'node_modules', '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir);
      // 查找匹配的模块目录（格式：moduleName@version）
      const matched = entries.find((entry) => entry.startsWith(`${moduleName}@`));
      if (matched) {
        const modulePath = path.resolve(pnpmDir, matched, 'node_modules', moduleName);
        if (fs.existsSync(modulePath)) {
          return modulePath;
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return null;
}

// 查找 sherpa-onnx-node 模块的实际路径（支持 pnpm 的 node_modules 结构）
export function findSherpaOnnxNodePath(): string | null {
  const appPath = app.getAppPath();

  if (appPath.includes('app.asar')) {
    // 打包后的环境：模块在 app.asar.unpacked 中
    const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
    const possiblePath = path.resolve(unpackedPath, 'node_modules', 'sherpa-onnx-node');
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  } else {
    // 开发环境：尝试多个可能的路径
    const searchPaths = [appPath, process.cwd()];

    for (const basePath of searchPaths) {
      // 1. 尝试直接路径
      const directPath = path.resolve(basePath, 'node_modules', 'sherpa-onnx-node');
      if (fs.existsSync(directPath)) {
        return directPath;
      }

      // 2. 尝试 pnpm 路径
      const pnpmPath = findPnpmModulePath(basePath, 'sherpa-onnx-node');
      if (pnpmPath) {
        return pnpmPath;
      }
    }

    // 3. 如果都找不到，尝试通过 require.resolve 查找
    try {
      const resolvedPath = require.resolve('sherpa-onnx-node/package.json');
      return path.dirname(resolvedPath);
    } catch (e) {
      // ignore
    }
  }

  return null;
}

// 查找 sherpa-onnx-darwin-arm64 原生库路径
export function findSherpaOnnxNativeLibPath(): string | null {
  const appPath = app.getAppPath();

  if (appPath.includes('app.asar')) {
    const unpackedPath = appPath.replace('app.asar', 'app.asar.unpacked');
    const possiblePath = path.resolve(unpackedPath, 'node_modules', 'sherpa-onnx-darwin-arm64');
    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }
  } else {
    const searchPaths = [appPath, process.cwd()];

    for (const basePath of searchPaths) {
      // 1. 尝试直接路径
      const directPath = path.resolve(basePath, 'node_modules', 'sherpa-onnx-darwin-arm64');
      if (fs.existsSync(directPath)) {
        return directPath;
      }

      // 2. 尝试 pnpm 路径
      const pnpmPath = findPnpmModulePath(basePath, 'sherpa-onnx-darwin-arm64');
      if (pnpmPath) {
        return pnpmPath;
      }
    }
  }

  return null;
}
