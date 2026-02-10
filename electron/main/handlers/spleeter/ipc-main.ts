import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import ffmpeg from 'fluent-ffmpeg';

import { getResourcePath } from '../../../../packages/common/utils';

// Configure FFmpeg paths
const ffmpegPath: string | undefined = getResourcePath('ffmpeg');
const ffprobePath: string | undefined = getResourcePath('ffprobe');

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}
if (ffprobePath) {
  ffmpeg.setFfprobePath(ffprobePath);
}

// Convert audio to a format supported by Spleeter using FFmpeg
async function convertAudioForSpleeter(inputFile: string, onProgress?: (progress: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    console.log('[spleeter] Converting audio file for Spleeter...');

    // Create a temporary file in the system temp directory
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `spleeter-input-${randomUUID()}.mp3`);

    console.log('[spleeter] Temporary file:', tempFile);

    const command = ffmpeg(inputFile)
      .audioCodec('libmp3lame')
      .audioBitrate('192k')
      .audioChannels(2)
      .audioFrequency(44100)
      .format('mp3')
      .output(tempFile)
      .on('start', (commandLine) => {
        console.log('[spleeter] FFmpeg conversion command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          onProgress?.(progress.percent);
        }
      })
      .on('error', (err) => {
        console.error('[spleeter] FFmpeg conversion error:', err);
        reject(new Error(`Audio conversion failed: ${err.message}`));
      })
      .on('end', () => {
        console.log('[spleeter] FFmpeg conversion completed');
        resolve(tempFile);
      });

    command.run();
  });
}

async function prepareInputFile(execFilePath: string, inputFile: string, onProgress?: (progress: number) => void): Promise<{ inputFile: string; convertedFile: string | null }> {
  const pathInfo = path.parse(inputFile);
  const inputExt = pathInfo.ext.toLowerCase();
  console.log('[spleeter] Input file extension:', inputExt);

  let convertedFile: string | null = null;

  // For WAV files, convert to MP3 for better compatibility
  if (inputExt === '.wav') {
    console.log('[spleeter] WAV file detected, converting to MP3 for better compatibility...');
    onProgress?.(0);

    convertedFile = await convertAudioForSpleeter(inputFile, (progress) => {
      // Map conversion progress (0-50%) to overall progress
      const overallProgress = (progress / 100) * 50;
      onProgress?.(overallProgress);
    });

    console.log('[spleeter] Conversion completed, converted file:', convertedFile);
  }

  return {
    inputFile: convertedFile || inputFile,
    convertedFile
  };
}

import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { pluginResourceManager } from '../../../../packages/plugins';

function execSpleeter(data: { execFilePath: string; inputFile: string; onProgress?: (progress: number) => void }): Promise<{
  accompaniment: string;
  vocals: string;
}> {
  return new Promise((resolve, reject) => {
    console.log('[spleeter] Starting audio separation...');
    console.log('[spleeter] Input file:', data.inputFile);
    console.log('[spleeter] Executable:', data.execFilePath);

    const pathInfo = path.parse(data.inputFile);
    const modelsDir = data.execFilePath.replace(/memo-spleeter(\.exe)?$/, 'models');

    // Check if models directory exists
    const modelsDirExists = fs.existsSync(modelsDir);
    console.log('[spleeter] Models directory:', modelsDir, 'exists:', modelsDirExists);

    if (!modelsDirExists) {
      reject(new Error(`Models directory not found: ${modelsDir}`));
      return;
    }

    // List models directory contents
    console.log('[spleeter] Models directory contents:');
    try {
      const models = fs.readdirSync(modelsDir);
      models.forEach((model) => console.log('[spleeter]   -', model));
    } catch (err) {
      console.error('[spleeter] Failed to list models directory:', err);
    }

    // Prepare input file (convert if necessary)
    prepareInputFile(data.execFilePath, data.inputFile, data.onProgress)
      .then(({ inputFile: inputFileToUse, convertedFile }) => {
        const prop = `"${data.execFilePath}" "${inputFileToUse}" "${pathInfo.dir}" --models-dir "${modelsDir}"`;

        console.log('[spleeter] Command:', prop);
        console.log('[spleeter] Input file to use:', inputFileToUse);

        const child = exec(prop);

        let stdoutOutput = '';
        let stderrOutput = '';

        child.stdout?.on('data', (d: string) => {
          stdoutOutput += d;
          console.log('[spleeter] stdout:', d);

          const reg = /[0-9]+\/[0-9]+ done.../;
          if (reg.test(d)) {
            const progressText = reg.exec(d)?.[0].replace(' done...', '') || '';
            const [current, total] = progressText.split('/').map(Number);
            const progressPercent = total ? (current / total) * 100 : 0;

            console.log('[spleeter] Progress:', progressPercent.toFixed(2), '%');
            data.onProgress?.(progressPercent);
          }
        });

        child.stderr?.on('data', (d: string) => {
          stderrOutput += d;
          console.log('[spleeter] stderr:', d);
        });

        child.on('close', (code) => {
          // Cleanup temporary converted file
          if (convertedFile && fs.existsSync(convertedFile)) {
            console.log('[spleeter] Cleaning up temporary file:', convertedFile);
            try {
              fs.unlinkSync(convertedFile);
            } catch (cleanupErr) {
              console.warn('[spleeter] Failed to cleanup temporary file:', cleanupErr);
            }
          }

          console.log('[spleeter] Process closed with code:', code);
          console.log('[spleeter] Complete stdout:', stdoutOutput);
          console.log('[spleeter] Complete stderr:', stderrOutput);

          if (code === 0) {
            const accompanimentPath = path.resolve(pathInfo.dir, 'accompaniment.mp3');
            const vocalsPath = path.resolve(pathInfo.dir, 'vocals.mp3');

            console.log('[spleeter] Checking output files...');
            console.log('[spleeter] Accompaniment path:', accompanimentPath, 'exists:', fs.existsSync(accompanimentPath));
            console.log('[spleeter] Vocals path:', vocalsPath, 'exists:', fs.existsSync(vocalsPath));

            if (fs.existsSync(accompanimentPath) && fs.existsSync(vocalsPath)) {
              console.log('[spleeter] Output files found, resolving...');
              resolve({
                accompaniment: accompanimentPath,
                vocals: vocalsPath
              });
            } else {
              console.error('[spleeter] Output files not found after processing');
              reject(new Error('Output files not found after processing'));
            }
          } else {
            console.error('[spleeter] Process exited with non-zero code:', code);
            console.error('[spleeter] Please check the error output above');
            reject(new Error(`Spleeter process exited with code ${code}`));
          }
        });

        child.on('error', (error) => {
          // Cleanup temporary converted file
          if (convertedFile && fs.existsSync(convertedFile)) {
            console.log('[spleeter] Cleaning up temporary file due to error:', convertedFile);
            try {
              fs.unlinkSync(convertedFile);
            } catch (cleanupErr) {
              console.warn('[spleeter] Failed to cleanup temporary file:', cleanupErr);
            }
          }

          console.error('[spleeter] Child process error:', error);
          reject(error);
        });
      })
      .catch((error) => {
        console.error('[spleeter] Error preparing input file:', error);
        reject(error);
      });
  });
}

export function initSpleeterHandlers(win: BrowserWindow): void {
  ipcMain.handle('spleeter:separate', async (_event, payload: { inputFile: string; outputPrefix?: string }) => {
    console.log('[spleeter] IPC handler called with payload:', payload);

    const { inputFile, outputPrefix } = payload;

    if (!inputFile) {
      console.error('[spleeter] inputFile is required');
      throw new Error('inputFile is required');
    }

    console.log('[spleeter] Checking input file exists:', inputFile);
    if (!fs.existsSync(inputFile)) {
      console.error('[spleeter] Input file does not exist:', inputFile);
      throw new Error('Input file does not exist');
    }
    console.log('[spleeter] Input file exists and is accessible');

    console.log('[spleeter] Getting Spleeter executable path...');
    const execPath = pluginResourceManager.getEnginePath('plugin:spleeter', 'memo-spleeter');

    if (!execPath || !fs.existsSync(execPath)) {
      console.error('[spleeter] Spleeter is not installed or path not found:', execPath);
      throw new Error('Spleeter is not installed');
    }
    console.log('[spleeter] Executable path:', execPath);
    console.log('[spleeter] Executable exists:', fs.existsSync(execPath));

    const pathInfo = path.parse(inputFile);
    console.log('[spleeter] Parsed input file info:', pathInfo);

    const accompaniment = outputPrefix ? `${outputPrefix}_accompaniment${pathInfo.ext}` : path.join(pathInfo.dir, `${pathInfo.name}_accompaniment${pathInfo.ext}`);
    const vocals = outputPrefix ? `${outputPrefix}_vocals${pathInfo.ext}` : path.join(pathInfo.dir, `${pathInfo.name}_vocals${pathInfo.ext}`);

    console.log('[spleeter] Expected output paths:');
    console.log('[spleeter]   Accompaniment:', accompaniment, 'exists:', fs.existsSync(accompaniment));
    console.log('[spleeter]   Vocals:', vocals, 'exists:', fs.existsSync(vocals));

    if (fs.existsSync(accompaniment) && fs.existsSync(vocals)) {
      console.log('[spleeter] Output files already exist, returning early');
      return {
        accompaniment,
        vocals
      };
    }

    try {
      console.log('[spleeter] Starting execSpleeter...');
      const result = await execSpleeter({
        execFilePath: execPath,
        inputFile,
        onProgress: (progress: number) => {
          console.log('[spleeter] Progress update:', progress.toFixed(2), '%');
          eventManager.emit(AppEvent.SPLEETER_PROGRESS, { progress });
          win.webContents.send('spleeter:progress', { progress });
        }
      });
      console.log('[spleeter] execSpleeter completed with result:', result);

      console.log('[spleeter] Renaming output files...');
      if (result?.accompaniment) {
        console.log('[spleeter] Source accompaniment:', result.accompaniment, 'exists:', fs.existsSync(result.accompaniment));
        console.log('[spleeter] Target accompaniment:', accompaniment, 'exists:', fs.existsSync(accompaniment));
        if (fs.existsSync(result.accompaniment)) {
          console.log('[spleeter] Renaming accompaniment...');
          if (fs.existsSync(accompaniment)) {
            console.log('[spleeter] Target exists, removing:', accompaniment);
            fs.unlinkSync(accompaniment);
          }
          fs.renameSync(result.accompaniment, accompaniment);
          console.log('[spleeter] Accompaniment renamed successfully');
        } else {
          console.warn('[spleeter] Source accompaniment does not exist after processing');
        }
      }
      if (result?.vocals) {
        console.log('[spleeter] Source vocals:', result.vocals, 'exists:', fs.existsSync(result.vocals));
        console.log('[spleeter] Target vocals:', vocals, 'exists:', fs.existsSync(vocals));
        if (fs.existsSync(result.vocals)) {
          console.log('[spleeter] Renaming vocals...');
          if (fs.existsSync(vocals)) {
            console.log('[spleeter] Target exists, removing:', vocals);
            fs.unlinkSync(vocals);
          }
          fs.renameSync(result.vocals, vocals);
          console.log('[spleeter] Vocals renamed successfully');
        } else {
          console.warn('[spleeter] Source vocals does not exist after processing');
        }
      }

      console.log('[spleeter] Audio separation completed successfully');
      console.log('[spleeter] Final output:');
      console.log('[spleeter]   Accompaniment:', accompaniment, 'exists:', fs.existsSync(accompaniment));
      console.log('[spleeter]   Vocals:', vocals, 'exists:', fs.existsSync(vocals));

      return {
        accompaniment,
        vocals
      };
    } catch (error: any) {
      console.error('[spleeter] Error during audio separation:', error);
      console.error('[spleeter] Error stack:', error?.stack);
      console.error('[spleeter] Error message:', error?.message);
      throw error;
    }
  });

  ipcMain.handle('spleeter:isInstalled', async () => {
    console.log('[spleeter] Checking if Spleeter is installed...');
    const execPath = pluginResourceManager.getEnginePath('plugin:spleeter', 'memo-spleeter');
    console.log('[spleeter] Executable path:', execPath);
    const isInstalled = execPath && fs.existsSync(execPath);
    console.log('[spleeter] Is installed:', isInstalled);
    return {
      ok: true,
      installed: isInstalled
    };
  });

  ipcMain.handle('spleeter:getExecutablePath', async () => {
    console.log('[spleeter] Getting executable path...');
    const execPath = pluginResourceManager.getEnginePath('plugin:spleeter', 'memo-spleeter');
    console.log('[spleeter] Executable path:', execPath);
    return {
      ok: true,
      path: execPath
    };
  });
}
