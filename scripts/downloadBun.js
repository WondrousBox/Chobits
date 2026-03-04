import { spawn } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const BUN_VERSION = 'bun-v1.2.5';
const PLATFORM = process.argv[2] || 'win32';
const ARCH = process.argv[3] || 'x64';

const config = {
  'win32-x64': {
    url: `https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/bun-windows-x64.zip`,
    folder: 'resources/bun/win32/x64',
    zipName: 'bun.zip',
    extractFolder: 'bun-windows-x64',
    nestedArchive: 'bun.7zip', // Windows zip contains a nested 7zip
    executable: 'bun.exe'
  },
  'darwin-x64': {
    url: `https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/bun-darwin-x64.zip`,
    folder: 'resources/bun/darwin/x64',
    zipName: 'bun.zip',
    extractFolder: 'bun-darwin-x64',
    nestedArchive: null,
    executable: 'bun'
  },
  'darwin-arm64': {
    url: `https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/bun-darwin-aarch64.zip`,
    folder: 'resources/bun/darwin/arm64',
    zipName: 'bun.zip',
    extractFolder: 'bun-darwin-aarch64',
    nestedArchive: null,
    executable: 'bun'
  }
};

const key = `${PLATFORM}-${ARCH}`;
const cfg = config[key];

if (!cfg) {
  console.error(`Unsupported platform: ${PLATFORM}-${ARCH}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = path.resolve(__dirname, '..', cfg.folder);
const zipPath = path.join(targetDir, cfg.zipName);
const executablePath = path.join(targetDir, cfg.executable);
const extractedFolderPath = path.join(targetDir, cfg.extractFolder);

function get7zPath() {
  const archMap = { x64: 'x64', arm64: 'arm64' };
  const platformDir = PLATFORM === 'win32' ? 'win32' : 'darwin';
  const archDir = archMap[ARCH] || 'x64';
  const exeName = PLATFORM === 'win32' ? '7za.exe' : '7za';

  return path.resolve(__dirname, '..', 'resources', '7zip', platformDir, archDir, exeName);
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (url) => {
      https
        .get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            request(response.headers.location);

            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: ${response.statusCode}`));

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

async function extractZip(zipPath, targetDir) {
  const sevenZipPath = get7zPath();

  if (!fs.existsSync(sevenZipPath)) {
    throw new Error(`7z binary not found at: ${sevenZipPath}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(sevenZipPath, ['x', '-y', `-o${targetDir}`, zipPath], {
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`7z extraction failed with code ${code}`));
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
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
  }
}

async function main() {
  console.log(`Downloading bun for ${PLATFORM}-${ARCH}...`);
  console.log(`URL: ${cfg.url}`);

  // Create target directory
  fs.mkdirSync(targetDir, { recursive: true });

  // Download
  console.log('Downloading...');
  await downloadFile(cfg.url, zipPath);
  console.log('Download complete.');

  // Extract outer zip
  console.log('Extracting zip...');
  await extractZip(zipPath, targetDir);
  console.log('Zip extraction complete.');

  // Handle nested 7zip (Windows case)
  let actualExtractedFolder = extractedFolderPath;
  if (cfg.nestedArchive) {
    const nestedArchivePath = path.join(targetDir, cfg.nestedArchive);
    if (fs.existsSync(nestedArchivePath)) {
      console.log(`Extracting nested ${cfg.nestedArchive}...`);
      await extractZip(nestedArchivePath, targetDir);
      console.log('Nested extraction complete.');
      // After extracting 7zip, the executable is directly in targetDir
      actualExtractedFolder = targetDir;
      // Clean up the nested archive
      fs.unlinkSync(nestedArchivePath);
    }
  }

  // Move executable
  const extractedExecutable = path.join(actualExtractedFolder, cfg.executable);
  console.log(`Moving ${extractedExecutable} to ${executablePath}...`);
  moveFile(extractedExecutable, executablePath);

  // Add execute permission for non-Windows platforms
  if (PLATFORM !== 'win32') {
    console.log('Setting execute permission...');
    fs.chmodSync(executablePath, 0o755);
  }

  // Cleanup
  console.log('Cleaning up...');
  if (actualExtractedFolder !== targetDir) {
    deleteFolderRecursive(extractedFolderPath);
  }
  fs.unlinkSync(zipPath);

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
