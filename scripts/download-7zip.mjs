#!/usr/bin/env node
/**
 * download-7zip.mjs — 下载 7-Zip 独立命令行二进制到 resources/7zip/<platform>/<arch>/
 *
 * 运行时代码固定查找名为 7za 的二进制(见 packages/common/libs/7zip-min-electron),
 * 本脚本下载官方 7-Zip 发行包并提取/重命名为 7za(win32 为 7za.exe):
 * - darwin / linux:官方 tar.xz 中的 7zz(全功能独立版,重命名为 7za)
 * - win32:官方 extra 包中的 x64/7za.exe
 *
 * 解包依赖系统自带的 tar(macOS / Windows 10+ 为 bsdtar,可解 xz 与 7z;Linux 为 GNU tar)。
 *
 * 用法:
 *   node scripts/download-7zip.mjs [platform arch]   # 默认当前平台
 *
 * 也可通过 package.json 脚本:
 *   pnpm run download-7zip                # 当前平台
 *   pnpm run download-7zip-darwin-arm64
 *   pnpm run download-7zip-linux-x64
 *   pnpm run download-7zip-win32-x64
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SEVEN_ZIP_VERSION = '2602';

const SOURCES = {
  'darwin-arm64': {
    url: `https://www.7-zip.org/a/7z${SEVEN_ZIP_VERSION}-mac.tar.xz`,
    // 官方 mac 包为 universal 二进制(arm64 + x86_64)
    binInArchive: '7zz'
  },
  'linux-x64': {
    url: `https://www.7-zip.org/a/7z${SEVEN_ZIP_VERSION}-linux-x64.tar.xz`,
    binInArchive: '7zz'
  },
  'win32-x64': {
    url: `https://www.7-zip.org/a/7z${SEVEN_ZIP_VERSION}-extra.7z`,
    binInArchive: 'x64/7za.exe'
  }
};

const platform = process.argv[2] ?? process.platform;
const arch = process.argv[3] ?? process.arch;
const key = `${platform}-${arch}`;
const source = SOURCES[key];

if (!source) {
  console.error(`[download-7zip] unsupported target: ${key}(支持:${Object.keys(SOURCES).join(', ')})`);
  process.exit(1);
}

const targetDir = path.resolve('resources/7zip', platform, arch);
const targetName = platform === 'win32' ? '7za.exe' : '7za';
const targetPath = path.join(targetDir, targetName);

if (existsSync(targetPath)) {
  console.log(`[download-7zip] already exists: ${targetPath}(跳过;如需重装请先删除)`);
  process.exit(0);
}

async function download(url, dest) {
  console.log(`[download-7zip] downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

/** 在解压目录中按相对路径查找目标二进制 */
function findExtractedBinary(extractDir, relPath) {
  const direct = path.join(extractDir, relPath);
  if (existsSync(direct)) return direct;
  // 兜底:递归找同名文件(发行包目录结构变化时)
  const base = path.basename(relPath);
  const stack = [extractDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (entry === base) return full;
    }
  }
  return null;
}

const workDir = mkdtempSync(path.join(tmpdir(), 'chobits-7zip-'));
try {
  const archivePath = path.join(workDir, path.basename(source.url));
  await download(source.url, archivePath);

  const extractDir = path.join(workDir, 'extracted');
  mkdirSync(extractDir, { recursive: true });
  execFileSync('tar', ['-xf', archivePath, '-C', extractDir], { stdio: 'inherit' });

  const extracted = findExtractedBinary(extractDir, source.binInArchive);
  if (!extracted) {
    throw new Error(`binary ${source.binInArchive} not found in archive`);
  }

  mkdirSync(targetDir, { recursive: true });
  copyFileSync(extracted, targetPath);
  if (platform !== 'win32') {
    chmodSync(targetPath, 0o755);
  }
  console.log(`[download-7zip] installed: ${targetPath}`);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

// 仅在下载目标与当前机器一致时做可执行性校验(交叉下载无法运行)
if (platform === process.platform && arch === process.arch) {
  try {
    execFileSync(targetPath, ['i'], { stdio: 'pipe' });
  } catch (e) {
    // 7za 无参数/查询参数返回非零属正常,只要能执行并输出版本信息即视为可用
    const output = String(e.stdout ?? '') + String(e.stderr ?? '');
    if (!output.includes('7-Zip')) {
      throw new Error(`[download-7zip] ${targetPath} 无法运行:${e.message}`);
    }
  }
  console.log('[download-7zip] verified: binary runs on this machine');
}
