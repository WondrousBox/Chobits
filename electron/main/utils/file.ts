import * as crypto from 'crypto';
import fs from 'fs';

import { unpack } from '../libs/7zip-min-electron';

export function unzipFileWith7Z(
  zipFilePath: string,
  outputFolderPath: string,
  progressCallback?: (data: { total: number; current: number; filePath: string; type: 'Directory' | 'File'; size?: number; percent?: number }) => void,
  x?: string
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
