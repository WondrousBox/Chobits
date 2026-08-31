import * as crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { list, packDirectoryContents, unpack } from '../libs/7zip-min-electron';

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

export interface ArchiveListEntry {
  name?: string;
  attr?: string;
  size?: string;
  compressed?: string;
}

export function unzipFileWith7Z(
  zipFilePath: string,
  outputFolderPath: string,
  progressCallback?: (data: { total: number; current: number; filePath: string; type: 'Directory' | 'File'; size?: number; percent?: number }) => void,
  x?: string | readonly string[]
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    unpack(
      zipFilePath,
      outputFolderPath,
      (err: any) => {
        if (err) {
          console.log('unzip error', err);
          reject(err);
        }
        resolve();
      },
      (data: any) => {
        if (data.progress !== -1 && data.index !== -1) {
          progressCallback &&
            progressCallback({
              total: Math.round(((data.index || 0) * 100) / (data.progress || 1)),
              current: data.index || 0,
              filePath: '',
              type: 'File',
              size: 0,
              percent: data.progress
            });
        }
      },
      x
    );
  });
}

export function listArchiveEntriesWith7Z(archivePath: string): Promise<ArchiveListEntry[]> {
  return new Promise<ArchiveListEntry[]>((resolve, reject) => {
    list(archivePath, (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(Array.isArray(result) ? (result as ArchiveListEntry[]) : []);
    });
  });
}

export function zipDirectoryContentsWith7Z(sourceFolderPath: string, zipFilePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    packDirectoryContents(sourceFolderPath, zipFilePath, (err: any) => {
      if (err) {
        reject(err);
        return;
      }

      resolve();
    });
  });
}

export function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);

    input.on('error', reject);
    hash.on('readable', () => {
      const data = hash.read();
      if (data) {
        resolve(data.toString('hex'));
      }
    });

    input.pipe(hash);
  });
}
