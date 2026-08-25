#!/usr/bin/env node
/**
 * 下载 Linux 平台所需的第三方资源二进制：
 * - ffmpeg / ffprobe（BtbN 静态构建）
 * - yt-dlp（官方 linux 独立二进制，保存为 yt-dlp）
 * - 7zip（官方 linux 构建中的 7zz，保存为 7za 以保持路径约定一致）
 *
 * 用法: node scripts/downloadLinuxResources.js
 * 依赖系统命令: tar（需支持 xz 解压）
 */
import { spawn } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const YTDLP_VERSION = '2025.10.14';
const SEVEN_ZIP_VERSION = '2501';

const FFMPEG_URL = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz';
const FFMPEG_EXTRACT_FOLDER = 'ffmpeg-master-latest-linux64-gpl';
const YTDLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_linux`;
const SEVEN_ZIP_URL = `https://www.7-zip.org/a/7z${SEVEN_ZIP_VERSION}-linux-x64.tar.xz`;

if (process.platform !== 'linux') {
  console.error('This script is only for Linux. Use the platform-specific download scripts instead.');
  process.exit(1);
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (requestUrl) => {
      https
        .get(requestUrl, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            request(response.headers.location);

            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download ${requestUrl}: ${response.statusCode}`));

            return;
          }
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(dest, () => { });
          reject(err);
        });
    };
    request(url);
  });
}

function extractTarXz(archivePath, targetDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xJf', archivePath, '-C', targetDir], { stdio: 'inherit' });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tar extraction failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

function moveFile(src, dest) {
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
  }
  fs.renameSync(src, dest);
}

function deleteFolderRecursive(folderPath) {
  fs.rmSync(folderPath, { recursive: true, force: true });
}

async function downloadFfmpeg() {
  const targetDir = path.join(ROOT, 'resources/ffmpeg/linux/x64');
  const archivePath = path.join(targetDir, 'ffmpeg.tar.xz');
  const extractedDir = path.join(targetDir, FFMPEG_EXTRACT_FOLDER);

  if (fs.existsSync(path.join(targetDir, 'ffmpeg')) && fs.existsSync(path.join(targetDir, 'ffprobe'))) {
    console.log('\n==> ffmpeg/ffprobe already installed, skipping');
    return;
  }

  console.log(`\n==> Downloading ffmpeg from ${FFMPEG_URL}`);
  fs.mkdirSync(targetDir, { recursive: true });
  await downloadFile(FFMPEG_URL, archivePath);

  console.log('Extracting...');
  await extractTarXz(archivePath, targetDir);

  for (const name of ['ffmpeg', 'ffprobe']) {
    moveFile(path.join(extractedDir, 'bin', name), path.join(targetDir, name));
    fs.chmodSync(path.join(targetDir, name), 0o755);
    console.log(`Installed ${path.join('resources/ffmpeg/linux/x64', name)}`);
  }

  deleteFolderRecursive(extractedDir);
  fs.unlinkSync(archivePath);
}

async function downloadYtDlp() {
  const targetDir = path.join(ROOT, 'resources/yt-dlp/linux');
  const destPath = path.join(targetDir, 'yt-dlp');

  if (fs.existsSync(destPath)) {
    console.log('\n==> yt-dlp already installed, skipping');
    return;
  }

  console.log(`\n==> Downloading yt-dlp from ${YTDLP_URL}`);
  fs.mkdirSync(targetDir, { recursive: true });
  await downloadFile(YTDLP_URL, destPath);
  fs.chmodSync(destPath, 0o755);
  console.log('Installed resources/yt-dlp/linux/yt-dlp');
}

async function download7zip() {
  const targetDir = path.join(ROOT, 'resources/7zip/linux/x64');
  const archivePath = path.join(targetDir, '7z.tar.xz');

  console.log(`\n==> Downloading 7-Zip from ${SEVEN_ZIP_URL}`);
  fs.mkdirSync(targetDir, { recursive: true });
  await downloadFile(SEVEN_ZIP_URL, archivePath);

  console.log('Extracting...');
  await extractTarXz(archivePath, targetDir);

  // 官方 linux 构建中的可执行文件名为 7zz，保存为 7za 以保持代码中的路径约定
  moveFile(path.join(targetDir, '7zz'), path.join(targetDir, '7za'));
  fs.chmodSync(path.join(targetDir, '7za'), 0o755);
  console.log('Installed resources/7zip/linux/x64/7za');

  for (const leftover of ['7zzs', '7zr', 'History.txt', 'License.txt', 'readme.txt', 'MANUAL']) {
    fs.rmSync(path.join(targetDir, leftover), { recursive: true, force: true });
  }
  fs.unlinkSync(archivePath);
}

async function main() {
  await downloadFfmpeg();
  await downloadYtDlp();
  await download7zip();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
