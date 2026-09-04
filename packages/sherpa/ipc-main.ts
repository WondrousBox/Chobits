import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { stripEmoji } from '@packages/tts/common';
import { app, BrowserWindow, ipcMain } from 'electron';

import { getASRInstance } from './asr-instance-manager';
import { assertSherpaCapabilityActive, assertSherpaCapabilityUnlocked, notifySherpaCapabilityChanged } from './capability-guard';
import { CommonConfig, SherpaModel } from './common';
import { ASR_createInstance, ASR_destroyInstance, ASR_sendData, TTS_createInstance, TTS_destroyInstance, TTS_generateSpeech } from './index';

/**
 * mini 分支录音只落盘、不再写库（folders/resources 表已删除）：
 * 录音文件存放在 <userData>/data/recordings/<YYYY-MM-DD>/ 下，
 * 录音 ID 即文件主名（asr-recording-<timestamp>），历史记录通过扫描目录得到。
 */
function getRecordingRootDir(): string {
  return path.join(app.getPath('userData'), 'data', 'recordings');
}

async function ensureDailyRecordingDir(): Promise<string> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dirPath = path.join(getRecordingRootDir(), today);
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/** 在 recordings 目录下按录音 ID（文件主名）查找音频文件 */
async function findRecordingAudioPath(resourceId: string): Promise<string | null> {
  const recRoot = getRecordingRootDir();
  let dateDirs: string[];
  try {
    dateDirs = await fs.readdir(recRoot);
  } catch {
    return null;
  }
  for (const dir of dateDirs) {
    const candidate = path.join(recRoot, dir, `${resourceId}.pcm`);
    if (fscb.existsSync(candidate)) return candidate;
  }
  return null;
}

// ASR 配置类型（面向未来多后端扩展）
export interface ASRConfig {
  enabled: boolean;
  backend: 'local' | 'cloud';
  local: {
    scene: string;
    model: string;
    language: string;
    punctuationModel: string;
  };
  cloud: {
    providerId: string;
    providerPresetId: string;
    modelId: string;
  };
}

// 字幕片段接口
interface SubtitleSegment {
  text: string;
  start: number;
  end: number;
  translation?: string;
}

// 录音流管理（包含音频和字幕）
interface RecordingStream {
  resourceId: string;
  audioFilePath: string;
  subtitleFilePath: string;
  audioWriteStream: fscb.WriteStream;
  subtitleWriteStream: fscb.WriteStream;
  startTime: number;
  segmentCount: number; // 字幕片段计数
}

const recordingStreams = new Map<string, RecordingStream>();

// 将字幕片段转换为 SRT 格式的单条记录
function segmentToSrtEntry(index: number, segment: SubtitleSegment): string {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  };

  let entry = `${index}\n${formatTime(segment.start)} --> ${formatTime(segment.end)}\n${segment.text}`;
  if (segment.translation) {
    entry += `\n${segment.translation}`;
  }
  entry += '\n\n';
  return entry;
}

// 场景配置映射（与 ASRConfigPage 的 SCENE_CONFIGS 保持一致）
const SCENE_COMMON_CONFIGS: Record<string, CommonConfig> = {
  meeting: {
    enableEndpoint: true
  },
  'english-learning': {
    enableEndpoint: true,
    rule3MinUtteranceLength: 10
  },
  english: {
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20
  },
  chinese: {
    enableEndpoint: true
  },
  multilingual: {
    enableEndpoint: true
  }
};

const DEFAULT_ASR_CONFIG: ASRConfig = {
  enabled: false,
  backend: 'local',
  local: { scene: 'meeting', model: '', language: 'zh', punctuationModel: '' },
  cloud: { providerId: '', providerPresetId: '', modelId: '' }
};

let asrConfig: ASRConfig = { ...DEFAULT_ASR_CONFIG, local: { ...DEFAULT_ASR_CONFIG.local }, cloud: { ...DEFAULT_ASR_CONFIG.cloud } };
let asrConfigLoaded = false;

function cloneASRConfig(config: ASRConfig): ASRConfig {
  return {
    ...config,
    local: { ...config.local },
    cloud: { ...config.cloud }
  };
}

function getASRConfigFile(): string {
  const configDir = app.getPath('userData');
  return path.join(configDir, 'data', 'asr-config.json');
}

function ensureASRConfigLoaded(): void {
  if (asrConfigLoaded) return;

  const asrConfigFile = getASRConfigFile();
  try {
    if (fscb.existsSync(asrConfigFile)) {
      const txt = fscb.readFileSync(asrConfigFile, 'utf8');
      const parsed = JSON.parse(txt);
      asrConfig = {
        ...DEFAULT_ASR_CONFIG,
        ...parsed,
        local: { ...DEFAULT_ASR_CONFIG.local, ...(parsed.local || {}) },
        cloud: { ...DEFAULT_ASR_CONFIG.cloud, ...(parsed.cloud || {}) }
      };
    } else {
      asrConfig = cloneASRConfig(DEFAULT_ASR_CONFIG);
    }
  } catch {
    asrConfig = cloneASRConfig(DEFAULT_ASR_CONFIG);
  }

  asrConfigLoaded = true;
}

function persistASRConfig(): void {
  const asrConfigFile = getASRConfigFile();
  try {
    const dir = path.dirname(asrConfigFile);
    if (!fscb.existsSync(dir)) {
      fscb.mkdirSync(dir, { recursive: true });
    }
    fscb.writeFileSync(asrConfigFile, JSON.stringify(asrConfig, null, 2), 'utf8');
  } catch {
    //
  }
}

export function getASRConfigSnapshot(): ASRConfig {
  ensureASRConfigLoaded();
  return cloneASRConfig(asrConfig);
}

export function updateASRConfigSnapshot(partial: Partial<ASRConfig>): ASRConfig {
  ensureASRConfigLoaded();
  asrConfig = {
    ...asrConfig,
    ...partial,
    local: { ...asrConfig.local, ...(partial.local || {}) },
    cloud: { ...asrConfig.cloud, ...(partial.cloud || {}) }
  };
  persistASRConfig();
  return getASRConfigSnapshot();
}

function notifyASRStatusChanged(): void {
  notifySherpaCapabilityChanged({ source: 'speechRecognition.status' });
}

export function disableASRRuntime(options?: { disableConfig?: boolean }): void {
  ASR_destroyInstance({
    uuid: 'stream'
  });

  if (options?.disableConfig) {
    updateASRConfigSnapshot({ enabled: false });
  }

  notifyASRStatusChanged();
}

export function getASRStatusSnapshot(): { running: boolean } {
  const instance = getASRInstance('stream');
  return { running: !!instance };
}

/**
 * localAI 功能旗标关闭时注册的降级 handler:
 * 查询类返回禁用态默认值,操作类返回 { ok: false },均不做副作用,
 * 渲染侧现有逻辑按"服务未运行"静默降级,避免 "No handler registered" 噪音。
 */
export function initSherpaStubHandlers(): void {
  const disabled = (): { ok: boolean; error: string } => ({ ok: false, error: 'Local AI feature is disabled' });

  ipcMain.handle('sherpa:get-asr-config', () => ({ ok: true, config: cloneASRConfig(DEFAULT_ASR_CONFIG) }));
  ipcMain.handle('sherpa:save-asr-config', (_event, partial: Partial<ASRConfig>) => ({
    ok: true,
    config: {
      ...cloneASRConfig(DEFAULT_ASR_CONFIG),
      ...(partial || {}),
      enabled: false,
      local: { ...DEFAULT_ASR_CONFIG.local, ...(partial?.local || {}) },
      cloud: { ...DEFAULT_ASR_CONFIG.cloud, ...(partial?.cloud || {}) }
    }
  }));
  ipcMain.handle('sherpa:create-instance', async () => disabled());
  ipcMain.handle('sherpa:destroy-instance', async () => ({ ok: true }));
  ipcMain.handle('sherpa:get-status', async () => ({ ok: true, running: false }));
  ipcMain.handle('sherpa:send-data', async () => disabled());
  ipcMain.handle('sherpa:start-recording', async () => disabled());
  ipcMain.handle('sherpa:resume-recording', async () => disabled());
  ipcMain.handle('sherpa:stop-recording', async () => disabled());
  ipcMain.handle('sherpa:append-subtitle', async () => disabled());
  ipcMain.handle('sherpa:get-recording-history', async () => ({ ok: true, data: [] }));
  ipcMain.handle('sherpa:delete-recording', async () => disabled());
  ipcMain.handle('sherpa:read-subtitle-content', async () => disabled());
  ipcMain.handle('sherpa:tts:create-instance', async () => disabled());
  ipcMain.handle('sherpa:tts:destroy-instance', async () => ({ ok: true }));
  ipcMain.handle('sherpa:tts:generate', async (_event, data?: { requestId?: string }) => ({ ...disabled(), requestId: data?.requestId ?? '' }));
}

export function initSherpaHandlers(): void {
  ensureASRConfigLoaded();
  const currentASRConfig = getASRConfigSnapshot();

  // Auto-start ASR if enabled (fire-and-forget)
  if (currentASRConfig.enabled && currentASRConfig.local.model) {
    const { scene, model, language, punctuationModel } = currentASRConfig.local;
    const commonConfig = SCENE_COMMON_CONFIGS[scene];
    console.log('[ASR] Auto-starting with saved config, scene:', scene, 'model:', model);
    ASR_createInstance({
      uuid: 'stream',
      model: model as SherpaModel,
      language,
      punctuationModel: punctuationModel || undefined,
      commonConfig
    })
      .then((ins) => {
        if (ins) {
          ins.handler = (d) => {
            BrowserWindow.getAllWindows().forEach((w) => {
              if (!w.isDestroyed()) {
                try {
                  w.webContents.send('sherpa:asr-result', d);
                } catch (error) {
                  console.error('发送 ASR 识别结果失败:', error);
                }
              }
            });
          };
          console.log('[ASR] Auto-start succeeded');
          notifyASRStatusChanged();
        } else {
          console.warn('[ASR] Auto-start returned null instance');
          notifyASRStatusChanged();
        }
      })
      .catch((error) => {
        console.error('[ASR] Auto-start failed:', error);
        notifyASRStatusChanged();
      });
  }

  // IPC: get ASR config
  ipcMain.handle('sherpa:get-asr-config', () => {
    try {
      return { ok: true, config: getASRConfigSnapshot() };
    } catch (error) {
      console.error('[Sherpa] 读取 ASR 配置失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // IPC: save ASR config
  ipcMain.handle('sherpa:save-asr-config', (_event, partial: Partial<ASRConfig>) => {
    try {
      if (partial.enabled === true) {
        assertSherpaCapabilityUnlocked('speechRecognition');
      }
      return { ok: true, config: updateASRConfigSnapshot(partial) };
    } catch (error) {
      console.error('[Sherpa] 保存 ASR 配置失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'sherpa:create-instance',
    async (_event, data: { model?: SherpaModel; punctuationModel?: string; language?: string; type?: 'online' | 'offline' | 'vad'; commonConfig?: CommonConfig }) => {
      try {
        assertSherpaCapabilityUnlocked('speechRecognition');
        const ins = await ASR_createInstance({
          uuid: 'stream',
          model: data.model,
          language: data.language,
          punctuationModel: data.punctuationModel,
          type: data.type,
          commonConfig: data.commonConfig
        });
        if (ins) {
          ins.handler = (d) => {
            // send to all windows
            BrowserWindow.getAllWindows().forEach((w) => {
              if (!w.isDestroyed()) {
                try {
                  w.webContents.send('sherpa:asr-result', d);
                } catch (error) {
                  console.error('发送 ASR 识别结果失败:', error);
                }
              }
            });
          };

          notifyASRStatusChanged();
          return { ok: true };
        }

        notifyASRStatusChanged();
        return { ok: false, error: 'Failed to create ASR instance' };
      } catch (error) {
        console.error('[ASR] 创建实例失败:', error);
        notifyASRStatusChanged();
        return { ok: false, error: String(error) };
      }
    }
  );

  ipcMain.handle('sherpa:destroy-instance', async () => {
    try {
      disableASRRuntime();
      return { ok: true };
    } catch (error) {
      console.error('[ASR] 释放实例失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // 查询 ASR 引擎状态
  ipcMain.handle('sherpa:get-status', async () => {
    try {
      return { ok: true, running: getASRStatusSnapshot().running };
    } catch (error) {
      console.error('[ASR] 查询状态失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // 开始录音存储（同时创建音频和字幕流）
  ipcMain.handle('sherpa:start-recording', async () => {
    try {
      assertSherpaCapabilityActive('speechRecognition');
      console.log('[Sherpa] 收到开始录音请求');

      // 录音 ID 即文件主名，保证重启后可按 ID 找回文件
      const timestamp = Date.now();
      const resourceId = `asr-recording-${timestamp}`;
      const baseDir = await ensureDailyRecordingDir();
      console.log('[Sherpa] 录音目录:', baseDir);

      // 音频文件路径
      const audioFilePath = path.join(baseDir, `${resourceId}.pcm`);
      console.log('[Sherpa] 音频文件路径:', audioFilePath);

      // 字幕文件路径（SRT 格式，流式写入）
      const subtitleFilePath = path.join(baseDir, `${resourceId}.srt`);
      console.log('[Sherpa] 字幕文件路径:', subtitleFilePath);

      // 创建音频写入流（Float32 PCM，16kHz）
      const audioWriteStream = fscb.createWriteStream(audioFilePath);
      console.log('[Sherpa] 音频写入流已创建');

      // 创建字幕写入流（SRT 格式，UTF-8）
      const subtitleWriteStream = fscb.createWriteStream(subtitleFilePath, { encoding: 'utf8' });
      console.log('[Sherpa] 字幕写入流已创建');

      // 保存流信息
      const stream: RecordingStream = {
        resourceId,
        audioFilePath,
        subtitleFilePath,
        audioWriteStream,
        subtitleWriteStream,
        startTime: timestamp,
        segmentCount: 0
      };

      recordingStreams.set('stream', stream);
      console.log('[Sherpa] 录音流已保存到Map，resourceId:', resourceId);

      return { ok: true, resourceId };
    } catch (error) {
      console.error('[Sherpa] 开始录音存储失败:', error);
      if (error instanceof Error) {
        console.error('[Sherpa] 错误堆栈:', error.stack);
      }
      return { ok: false, error: String(error) };
    }
  });

  // 继续之前的录音（追加模式打开已有文件）
  ipcMain.handle('sherpa:resume-recording', async (_event, data: { resourceId: string }) => {
    try {
      assertSherpaCapabilityActive('speechRecognition');
      console.log('[Sherpa] 收到继续录音请求，resourceId:', data.resourceId);

      // 检查是否已有活动的录音流
      if (recordingStreams.has('stream')) {
        return { ok: false, error: 'Already has an active recording stream' };
      }

      // 按录音 ID 查找音频文件
      const audioFilePath = await findRecordingAudioPath(data.resourceId);
      if (!audioFilePath) {
        return { ok: false, error: 'Resource not found' };
      }

      // 构建字幕文件路径（与音频文件同名，扩展名为 .srt）
      const subtitleFilePath = audioFilePath.replace(/\.pcm$/, '.srt');

      // 检查音频文件是否存在
      try {
        await fs.access(audioFilePath);
      } catch {
        return { ok: false, error: 'Audio file does not exist' };
      }

      // 获取现有字幕的片段数量（用于继续编号）
      let existingSegmentCount = 0;
      try {
        const srtContent = await fs.readFile(subtitleFilePath, 'utf8');
        // 计算现有的片段数量（通过匹配 SRT 序号行）
        const matches = srtContent.match(/^\d+$/gm);
        if (matches) {
          existingSegmentCount = matches.length;
        }
      } catch {
        // 字幕文件不存在，从 0 开始
        existingSegmentCount = 0;
      }

      console.log('[Sherpa] 继续录音，已有字幕片段数:', existingSegmentCount);

      // 以追加模式打开音频写入流
      const audioWriteStream = fscb.createWriteStream(audioFilePath, { flags: 'a' });
      console.log('[Sherpa] 音频写入流已创建（追加模式）');

      // 以追加模式打开字幕写入流
      const subtitleWriteStream = fscb.createWriteStream(subtitleFilePath, { flags: 'a', encoding: 'utf8' });
      console.log('[Sherpa] 字幕写入流已创建（追加模式）');

      // 保存流信息
      const stream: RecordingStream = {
        resourceId: data.resourceId,
        audioFilePath,
        subtitleFilePath,
        audioWriteStream,
        subtitleWriteStream,
        startTime: Date.now(),
        segmentCount: existingSegmentCount
      };

      recordingStreams.set('stream', stream);
      console.log('[Sherpa] 录音流已保存到Map（继续录音），resourceId:', data.resourceId);

      return {
        ok: true,
        resourceId: data.resourceId,
        segmentCount: existingSegmentCount
      };
    } catch (error) {
      console.error('[Sherpa] 继续录音失败:', error);
      if (error instanceof Error) {
        console.error('[Sherpa] 错误堆栈:', error.stack);
      }
      return { ok: false, error: String(error) };
    }
  });

  // 追加字幕片段（流式写入）
  ipcMain.handle('sherpa:append-subtitle', async (_event, data: { segment: SubtitleSegment }) => {
    try {
      const stream = recordingStreams.get('stream');
      if (!stream) {
        return { ok: false, error: 'No active recording stream' };
      }

      // 增加片段计数
      stream.segmentCount++;

      // 将片段转换为 SRT 格式并写入
      const srtEntry = segmentToSrtEntry(stream.segmentCount, data.segment);
      stream.subtitleWriteStream.write(srtEntry);

      console.log('[Sherpa] 字幕片段已追加，序号:', stream.segmentCount, '文本:', data.segment.text.substring(0, 20) + '...');

      return { ok: true, segmentIndex: stream.segmentCount };
    } catch (error) {
      console.error('[Sherpa] 追加字幕片段失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // 停止录音存储（同时关闭音频和字幕流）
  ipcMain.handle('sherpa:stop-recording', async () => {
    try {
      const stream = recordingStreams.get('stream');
      if (!stream) {
        return { ok: false, error: 'No active recording stream' };
      }

      console.log('[Sherpa] 开始停止录音，resourceId:', stream.resourceId);

      // 同时关闭音频和字幕写入流
      return new Promise((resolve) => {
        let audioEnded = false;
        let subtitleEnded = false;

        const checkComplete = async (): Promise<void> => {
          if (!audioEnded || !subtitleEnded) return;

          try {
            // 获取音频文件大小
            const audioStats = await fs.stat(stream.audioFilePath);
            console.log('[Sherpa] 音频文件大小:', audioStats.size);

            // 字幕文件有内容则保留（流式写入已落盘），为空则删除
            let srtResourceId: string | undefined;
            try {
              const subtitleStats = await fs.stat(stream.subtitleFilePath);
              console.log('[Sherpa] 字幕文件大小:', subtitleStats.size);

              if (subtitleStats.size > 0) {
                srtResourceId = `${stream.resourceId}.srt`;
              } else {
                console.log('[Sherpa] 字幕文件为空，删除它');
                await fs.unlink(stream.subtitleFilePath).catch(() => {});
              }
            } catch (error) {
              console.log('[Sherpa] 字幕文件不存在或无法访问:', error);
            }

            recordingStreams.delete('stream');
            resolve({
              ok: true,
              resourceId: stream.resourceId,
              srtResourceId,
              segmentCount: stream.segmentCount
            });
          } catch (error) {
            console.error('[Sherpa] 停止录音处理失败:', error);
            recordingStreams.delete('stream');
            resolve({ ok: false, error: String(error) });
          }
        };

        // 关闭音频写入流
        stream.audioWriteStream.end(() => {
          console.log('[Sherpa] 音频写入流已关闭');
          audioEnded = true;
          checkComplete();
        });

        // 关闭字幕写入流
        stream.subtitleWriteStream.end(() => {
          console.log('[Sherpa] 字幕写入流已关闭');
          subtitleEnded = true;
          checkComplete();
        });
      });
    } catch (error) {
      console.error('停止录音存储失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'sherpa:send-data',
    async (
      _,
      data: {
        uuid: string;
        data: Float32Array;
        shouldSave?: boolean;
      }
    ) => {
      try {
        assertSherpaCapabilityActive('speechRecognition');
        ASR_sendData({ uuid: 'stream' }, data.data);

        // 如果启用了保存，将音频数据写入文件流
        if (data.shouldSave) {
          const stream = recordingStreams.get('stream');
          if (stream && stream.audioWriteStream) {
            try {
              // Float32 PCM 转 Buffer
              const buffer = Buffer.from(data.data.buffer, data.data.byteOffset, data.data.byteLength);
              stream.audioWriteStream.write(buffer);
            } catch (error) {
              console.error('写入音频数据失败:', error);
            }
          }
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    }
  );

  // 获取录音历史记录（扫描 recordings 目录下的 .pcm 文件）
  ipcMain.handle('sherpa:get-recording-history', async (_event, data: { limit?: number; offset?: number }) => {
    try {
      const { limit = 50, offset = 0 } = data || {};

      const items: Array<Record<string, any>> = [];
      const recRoot = getRecordingRootDir();
      let dateDirs: string[];
      try {
        dateDirs = await fs.readdir(recRoot);
      } catch {
        dateDirs = [];
      }

      for (const dir of dateDirs) {
        const dirPath = path.join(recRoot, dir);
        let files: string[];
        try {
          files = await fs.readdir(dirPath);
        } catch {
          continue;
        }
        for (const file of files) {
          const match = file.match(/^(asr-recording-(\d+))\.pcm$/);
          if (!match) continue;
          const id = match[1];
          const timestamp = Number(match[2]);
          const audioFilePath = path.join(dirPath, file);
          try {
            const stats = await fs.stat(audioFilePath);
            if (stats.size === 0) continue;
            const subtitleFilePath = path.join(dirPath, `${id}.srt`);
            let hasSubtitle = false;
            try {
              hasSubtitle = (await fs.stat(subtitleFilePath)).size > 0;
            } catch {
              hasSubtitle = false;
            }
            items.push({
              id,
              title: `录音-${new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`,
              audioFilePath,
              subtitleFilePath: hasSubtitle ? subtitleFilePath : null,
              subtitleResourceId: hasSubtitle ? `${id}.srt` : null,
              duration: 0,
              sizeBytes: stats.size,
              createdAt: timestamp,
              updatedAt: stats.mtimeMs,
              folderId: dir,
              status: 'ready'
            });
          } catch {
            // 单个文件读取失败不影响整体列表
          }
        }
      }

      items.sort((a, b) => b.createdAt - a.createdAt);
      const result = items.slice(offset, offset + limit);

      return { ok: true, data: result };
    } catch (error) {
      console.error('[Sherpa] 获取录音历史失败:', error);
      return { ok: false, error: String(error), data: [] };
    }
  });

  // 删除录音记录（删除音频文件和关联的字幕文件）
  ipcMain.handle('sherpa:delete-recording', async (_event, data: { resourceId: string }) => {
    try {
      const { resourceId } = data;

      const audioFilePath = await findRecordingAudioPath(resourceId);
      if (!audioFilePath) {
        return { ok: false, error: 'Resource not found' };
      }

      // 删除关联的字幕文件与音频文件
      const subtitleFilePath = audioFilePath.replace(/\.pcm$/, '.srt');
      await fs.unlink(subtitleFilePath).catch(() => {});
      await fs.unlink(audioFilePath).catch(() => {});

      console.log('[Sherpa] 录音记录已删除，resourceId:', resourceId);
      return { ok: true };
    } catch (error) {
      console.error('[Sherpa] 删除录音记录失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // 读取字幕文件内容
  ipcMain.handle('sherpa:read-subtitle-content', async (_event, data: { filePath: string }) => {
    try {
      const { filePath } = data;
      if (!filePath || !fscb.existsSync(filePath)) {
        return { ok: false, error: 'File not found' };
      }

      const content = await fs.readFile(filePath, 'utf8');
      return { ok: true, content };
    } catch (error) {
      console.error('[Sherpa] 读取字幕文件失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // ==================== TTS 相关 Handlers ====================

  // 创建 TTS 实例
  ipcMain.handle('sherpa:tts:create-instance', async (_event, data: { model: string; numThreads?: number; maxNumSentences?: number }) => {
    try {
      const ins = await TTS_createInstance({
        uuid: 'tts-stream',
        model: data.model,
        numThreads: data.numThreads,
        maxNumSentences: data.maxNumSentences
      });

      if (ins) {
        ins.handler = (d) => {
          // 发送 TTS 结果到所有窗口
          BrowserWindow.getAllWindows().forEach((w) => {
            if (!w.isDestroyed()) {
              try {
                w.webContents.send('sherpa:tts-result', d);
              } catch (error) {
                console.error('[TTS] 发送 TTS 结果失败:', error);
              }
            }
          });
        };

        return { ok: true };
      }

      return { ok: false, error: 'Failed to create TTS instance' };
    } catch (error) {
      console.error('[TTS] 创建实例失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // 释放 TTS 实例
  ipcMain.handle('sherpa:tts:destroy-instance', async () => {
    try {
      TTS_destroyInstance({ uuid: 'tts-stream' });
      return { ok: true };
    } catch (error) {
      console.error('[TTS] 释放实例失败:', error);
      return { ok: false, error: String(error) };
    }
  });

  // 生成语音
  ipcMain.handle(
    'sherpa:tts:generate',
    async (
      _,
      data: {
        text: string;
        sid?: number;
        speed?: number;
        outputPath?: string;
        requestId: string;
      }
    ) => {
      try {
        TTS_generateSpeech({
          uuid: 'tts-stream',
          text: stripEmoji(data.text),
          sid: data.sid,
          speed: data.speed,
          outputPath: data.outputPath,
          requestId: data.requestId
        });

        return { ok: true, requestId: data.requestId };
      } catch (error) {
        console.error('[TTS] 生成语音失败:', error);
        return { ok: false, error: String(error), requestId: data.requestId };
      }
    }
  );
}
