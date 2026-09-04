#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🔧 重建原生模块...');

// electron-builder 对不认识的原生模块会调用 `pnpm rebuild <pkg>@<version>`，
// pnpm 会把调用路由到本脚本（用户脚本 shadow 内置 rebuild 命令）。
const rebuildTarget = process.argv[2] ?? '';

// uiohook-napi 是 N-API 模块且 npm 包内自带全平台 prebuilds，无需为 Electron 重建。
// Windows CI 上没有可用的 VS C++ 工具链发现路径，从源码重建必然失败，这里直接跳过。
if (rebuildTarget.startsWith('uiohook-napi@')) {
  console.log(`ℹ️ 跳过重建 ${rebuildTarget}（N-API 模块，使用包内预编译二进制）`);
  process.exit(0);
}

try {
  // 检查是否安装了 @electron/rebuild
  try {
    await import('@electron/rebuild');
  } catch {
    console.log('📦 安装 @electron/rebuild...');
    execSync('pnpm add -D @electron/rebuild', { stdio: 'inherit' });
  }

  // 重建 better-sqlite3
  console.log('🔨 重建 better-sqlite3...');
  execSync('npx @electron/rebuild -f -w better-sqlite3', { stdio: 'inherit' });

  // 重建 sharp（可选）
  try {
    console.log('🔨 重建 sharp...');
    execSync('npx @electron/rebuild -f -w sharp', { stdio: 'inherit' });
  } catch {
    console.log('ℹ️ 跳过重建 sharp（未安装或非必要）');
  }

  console.log('✅ 原生模块重建完成！');
} catch (error) {
  console.error('❌ 重建失败:', error.message);
  process.exit(1);
}
