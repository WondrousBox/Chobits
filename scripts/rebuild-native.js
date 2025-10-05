#!/usr/bin/env node

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 重建原生模块...');

try {
  // 检查是否安装了 @electron/rebuild
  try {
    await import('@electron/rebuild');
  } catch (e) {
    console.log('📦 安装 @electron/rebuild...');
    execSync('pnpm add -D @electron/rebuild', { stdio: 'inherit' });
  }

  // 重建 better-sqlite3
  console.log('🔨 重建 better-sqlite3...');
  execSync('npx @electron/rebuild -f -w better-sqlite3', { stdio: 'inherit' });

  // 重建 sqlite-vec
  console.log('🔨 重建 sqlite-vec...');
  execSync('npx @electron/rebuild -f -w sqlite-vec', { stdio: 'inherit' });

  console.log('✅ 原生模块重建完成！');
} catch (error) {
  console.error('❌ 重建失败:', error.message);
  process.exit(1);
}
