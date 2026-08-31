import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { stripEmoji } from '@packages/tts/common';
import { app, BrowserWindow, ipcMain } from 'electron';

import { WorkspacesRepo } from '../common/db/repositories';
import { getASRInstance } from './asr-instance-manager';
import { assertSherpaCapabilityActive, assertSherpaCapabilityUnlocked, notifySherpaCapabilityChanged } from './capability-guard';
import { AllModels, CommonConfig } from './common';
import { ASR_createInstance, ASR_freeInstance, ASR_sendData, TTS_createInstance, TTS_freeInstance, TTS_generateSpeech } from './index';

/**
 * mini 分支录音只落盘、不再写库（folders/resources 表已删除）：
 * 录音文件存放在 <workspaceRoot>/recordings/<YYYY-MM-DD>/ 下，
 * 录音 ID 即文件主名（asr-recording-<timestamp>），历史记录通过扫描目录得到。
 */
async function ensureDailyRecordingDir(rootPath: string): Promise<string> {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dirPath = path.join(rootPath, 'recordings', today);
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/** 在单个工作空间的 recordings 目录下按录音 ID（文件主名）查找音频文件 */
async function findRecordingAudioPath(rootPath: string, resourceId: string): Promise<string | null> {
  const recRoot = path.join(rootPath, 'recordings');
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

/** 跨工作空间解析录音 ID 对应的音频文件路径 */
async function resolveRecordingAudioPath(resourceId: string, preferredWorkspaceId?: string): Promise<{ audioFilePath: string; workspaceId: string } | null> {
  const workspaces = await WorkspacesRepo.list({ deletedAt: 0 } as any, 100, 0);
  const ordered = preferredWorkspaceId ? [...workspaces].sort((a, b) => (a.id === preferredWorkspaceId ? -1 : b.id === preferredWorkspaceId ? 1 : 0)) : workspaces;
  for (const ws of ordered) {
    if (!ws.rootPath) continue;
    const audioFilePath = await findRecordingAudioPath(ws.rootPath, resourceId);
    if (audioFilePath) return { audioFilePath, workspaceId: ws.id };
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
  workspaceId: string;
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

function broadcastASRStatus(): void {
  const payload = getASRStatusSnapshot();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win || win.isDestroyed()) continue;
    try {
      win.webContents.send('sherpa-status-updated', payload);
    } catch {
      /* ignore */
    }
  }

  notifySherpaCapabilityChanged({ source: 'speechRecognition.status' });
}

export function disableASRRuntime(options?: { disableConfig?: boolean }): void {
  ASR_freeInstance({
    uuid: 'stream'
  });

  if (options?.disableConfig) {
    updateASRConfigSnapshot({ enabled: false });
  }

  broadcastASRStatus();
}

export function getASRStatusSnapshot(): { running: boolean } {
  const instance = getASRInstance('stream');
  return { running: !!instance };
}

/**
 * localAi 功能旗标关闭时注册的降级 handler:
 * 查询类返回禁用态默认值,操作类返回 { success: false },均不做副作用,
 * 渲染侧现有逻辑按"服务未运行"静默降级,避免 "No handler registered" 噪音。
 */
export function initSherpaStubHandlers(): void {
  const disabled = (): { success: boolean; error: string } => ({ success: false, error: 'Local AI feature is disabled' });

  ipcMain.handle('sherpa:getASRConfig', () => cloneASRConfig(DEFAULT_ASR_CONFIG));
  ipcMain.handle('sherpa:saveASRConfig', (_, partial: Partial<ASRConfig>) => ({
    ...cloneASRConfig(DEFAULT_ASR_CONFIG),
    ...(partial || {}),
    enabled: false,
    local: { ...DEFAULT_ASR_CONFIG.local, ...(partial?.local || {}) },
    cloud: { ...DEFAULT_ASR_CONFIG.cloud, ...(partial?.cloud || {}) }
  }));
  ipcMain.handle('sherpa:createInstance', async () => false);
  ipcMain.handle('sherpa:freeInstance', async () => true);
  ipcMain.handle('sherpa:getStatus', async () => ({ running: false }));
  ipcMain.handle('sherpa:sendData', async () => false);
  ipcMain.handle('sherpa:startRecording', async () => disabled());
  ipcMain.handle('sherpa:resumeRecording', async () => disabled());
  ipcMain.handle('sherpa:stopRecording', async () => disabled());
  ipcMain.handle('sherpa:appendSubtitle', async () => disabled());
  ipcMain.handle('sherpa:saveSubtitle', async () => disabled());
  ipcMain.handle('sherpa:checkPendingRecording', async () => disabled());
  ipcMain.handle('sherpa:cleanupStreams', async () => ({ success: true }));
  ipcMain.handle('sherpa:getRecordingHistory', async () => ({ success: true, data: [] }));
  ipcMain.handle('sherpa:deleteRecording', async () => disabled());
  ipcMain.handle('sherpa:readSubtitleContent', async () => disabled());
  ipcMain.handle('sherpa:tts:createInstance', async () => disabled());
  ipcMain.handle('sherpa:tts:freeInstance', async () => ({ success: true }));
  ipcMain.handle('sherpa:tts:generate', async (_, data?: { requestId?: string }) => ({ ...disabled(), requestId: data?.requestId ?? '' }));
  ipcMain.handle('sherpa:tts:generateToFile', async (_, data?: { requestId?: string }) => ({ ...disabled(), requestId: data?.requestId ?? '' }));
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
      model: model as AllModels,
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
                  w.webContents.send('renderer-message', { type: 'sherpa:message', data: d });
                } catch (error) {
                  console.error('发送 ASR 识别结果失败:', error);
                }
              }
            });
          };
          console.log('[ASR] Auto-start succeeded');
          broadcastASRStatus();
        } else {
          console.warn('[ASR] Auto-start returned null instance');
          broadcastASRStatus();
        }
      })
      .catch((error) => {
        console.error('[ASR] Auto-start failed:', error);
        broadcastASRStatus();
      });
  }

  // IPC: get ASR config
  ipcMain.handle('sherpa:getASRConfig', () => {
    return getASRConfigSnapshot();
  });

  // IPC: save ASR config
  ipcMain.handle('sherpa:saveASRConfig', (_, partial: Partial<ASRConfig>) => {
    if (partial.enabled === true) {
      assertSherpaCapabilityUnlocked('speechRecognition');
    }
    return updateASRConfigSnapshot(partial);
  });

  ipcMain.handle('sherpa:createInstance', async (_, data: { model?: AllModels; punctuationModel?: string; language?: string; type?: 'online' | 'offline' | 'vad'; commonConfig?: CommonConfig }) => {
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
              w.webContents.send('renderer-message', { type: 'sherpa:message', data: d });
            } catch (error) {
              console.error('发送 ASR 识别结果失败:', error);
            }
          }
        });
      };

      broadcastASRStatus();
      return true;
    }

    broadcastASRStatus();
    return false;
  });

  ipcMain.handle('sherpa:freeInstance', async () => {
    disableASRRuntime();
    return true;
  });

  // 查询 ASR 引擎状态
  ipcMain.handle('sherpa:getStatus', async () => {
    return getASRStatusSnapshot();
  });

  // 开始录音存储（同时创建音频和字幕流）
  ipcMain.handle('sherpa:startRecording', async (_, data: { workspaceId?: string; folderId?: string }) => {
    try {
      assertSherpaCapabilityActive('speechRecognition');
      console.log('[Sherpa] 收到开始录音请求，data:', data);
      let { workspaceId } = data;

      // 获取工作空间
      let ws;
      if (workspaceId) {
        console.log('[Sherpa] 使用指定的workspaceId:', workspaceId);
        ws = await WorkspacesRepo.getById(workspaceId);
      } else {
        console.log('[Sherpa] 获取默认工作空间');
        ws = await WorkspacesRepo.getDefault();
        if (ws) workspaceId = ws.id;
      }

      if (!ws || !ws.rootPath) {
        console.error('[Sherpa] 工作空间不可用，ws:', ws);
        return { success: false, error: 'No workspace available' };
      }

      console.log('[Sherpa] 工作空间获取成功，id:', ws.id, 'rootPath:', ws.rootPath);

      // 录音 ID 即文件主名，保证重启后可按 ID 找回文件
      const timestamp = Date.now();
      const resourceId = `asr-recording-${timestamp}`;
      const baseDir = await ensureDailyRecordingDir(ws.rootPath);
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
        workspaceId: ws.id,
        startTime: timestamp,
        segmentCount: 0
      };

      recordingStreams.set('stream', stream);
      console.log('[Sherpa] 录音流已保存到Map，resourceId:', resourceId);

      // 通过事件发送给渲染进程
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          try {
            w.webContents.send('asr:recording-started', {
              resourceId,
              startTime: timestamp,
              workspaceId: ws.id
            });
            console.log('[Sherpa] 已发送录音开始事件到窗口');
          } catch (error) {
            console.error('[Sherpa] 发送录音开始事件失败:', error);
          }
        }
      });

      return { success: true, resourceId };
    } catch (error) {
      console.error('[Sherpa] 开始录音存储失败:', error);
      if (error instanceof Error) {
        console.error('[Sherpa] 错误堆栈:', error.stack);
      }
      return { success: false, error: String(error) };
    }
  });

  // 继续之前的录音（追加模式打开已有文件）
  ipcMain.handle('sherpa:resumeRecording', async (_, data: { resourceId: string }) => {
    try {
      assertSherpaCapabilityActive('speechRecognition');
      console.log('[Sherpa] 收到继续录音请求，resourceId:', data.resourceId);

      // 检查是否已有活动的录音流
      if (recordingStreams.has('stream')) {
        return { success: false, error: 'Already has an active recording stream' };
      }

      // 按录音 ID 查找音频文件
      const found = await resolveRecordingAudioPath(data.resourceId);
      if (!found) {
        return { success: false, error: 'Resource not found' };
      }

      const audioFilePath = found.audioFilePath;

      // 构建字幕文件路径（与音频文件同名，扩展名为 .srt）
      const subtitleFilePath = audioFilePath.replace(/\.pcm$/, '.srt');

      // 检查音频文件是否存在
      try {
        await fs.access(audioFilePath);
      } catch {
        return { success: false, error: 'Audio file does not exist' };
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
        workspaceId: found.workspaceId,
        startTime: Date.now(),
        segmentCount: existingSegmentCount
      };

      recordingStreams.set('stream', stream);
      console.log('[Sherpa] 录音流已保存到Map（继续录音），resourceId:', data.resourceId);

      // 通过事件发送给渲染进程
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          try {
            w.webContents.send('asr:recording-resumed', {
              resourceId: data.resourceId,
              workspaceId: found.workspaceId,
              segmentCount: existingSegmentCount
            });
            console.log('[Sherpa] 已发送录音恢复事件到窗口');
          } catch (error) {
            console.error('[Sherpa] 发送录音恢复事件失败:', error);
          }
        }
      });

      return {
        success: true,
        resourceId: data.resourceId,
        segmentCount: existingSegmentCount
      };
    } catch (error) {
      console.error('[Sherpa] 继续录音失败:', error);
      if (error instanceof Error) {
        console.error('[Sherpa] 错误堆栈:', error.stack);
      }
      return { success: false, error: String(error) };
    }
  });

  // 追加字幕片段（流式写入）
  ipcMain.handle('sherpa:appendSubtitle', async (_, data: { segment: SubtitleSegment }) => {
    try {
      const stream = recordingStreams.get('stream');
      if (!stream) {
        return { success: false, error: 'No active recording stream' };
      }

      // 增加片段计数
      stream.segmentCount++;

      // 将片段转换为 SRT 格式并写入
      const srtEntry = segmentToSrtEntry(stream.segmentCount, data.segment);
      stream.subtitleWriteStream.write(srtEntry);

      console.log('[Sherpa] 字幕片段已追加，序号:', stream.segmentCount, '文本:', data.segment.text.substring(0, 20) + '...');

      return { success: true, segmentIndex: stream.segmentCount };
    } catch (error) {
      console.error('[Sherpa] 追加字幕片段失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 停止录音存储（同时关闭音频和字幕流）
  ipcMain.handle('sherpa:stopRecording', async () => {
    try {
      const stream = recordingStreams.get('stream');
      if (!stream) {
        return { success: false, error: 'No active recording stream' };
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
              success: true,
              resourceId: stream.resourceId,
              srtResourceId,
              segmentCount: stream.segmentCount
            });
          } catch (error) {
            console.error('[Sherpa] 停止录音处理失败:', error);
            recordingStreams.delete('stream');
            resolve({ success: false, error: String(error) });
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
      return { success: false, error: String(error) };
    }
  });

  // 保存SRT字幕文件
  ipcMain.handle('sherpa:saveSubtitle', async (_, data: { resourceId: string; srtContent: string }) => {
    try {
      const { resourceId, srtContent } = data;
      console.log('[Sherpa] 收到保存SRT请求，resourceId:', resourceId, 'SRT内容长度:', srtContent.length);

      // 按录音 ID 查找音频文件
      const found = await resolveRecordingAudioPath(resourceId);
      if (!found) {
        console.error('[Sherpa] 录音不存在，resourceId:', resourceId);
        return { success: false, error: 'Resource not found' };
      }

      // 生成SRT文件路径（与音频文件同目录同名）
      const audioDir = path.dirname(found.audioFilePath);
      const srtPath = path.join(audioDir, `${resourceId}.srt`);
      console.log('[Sherpa] SRT文件路径:', srtPath);

      // 写入SRT文件
      await fs.writeFile(srtPath, srtContent, 'utf8');
      console.log('[Sherpa] SRT文件写入成功:', srtPath);

      const srtResourceId = `${resourceId}.srt`;
      return { success: true, srtResourceId };
    } catch (error) {
      console.error('[Sherpa] 保存SRT文件失败:', error);
      if (error instanceof Error) {
        console.error('[Sherpa] 错误堆栈:', error.stack);
      }
      return { success: false, error: String(error) };
    }
  });

  // 检查并恢复未完成的录音
  ipcMain.handle('sherpa:checkPendingRecording', async (_, data: { resourceId: string }) => {
    try {
      const { resourceId } = data;

      // 按录音 ID 查找音频文件
      const found = await resolveRecordingAudioPath(resourceId);
      if (!found) {
        return { success: false, error: 'Resource not found' };
      }

      // 检查文件大小
      const stats = await fs.stat(found.audioFilePath);
      if (stats.size === 0) {
        // 文件为空，直接删除
        console.log('[Sherpa] 音频文件为空，删除它');
        await fs.unlink(found.audioFilePath).catch(() => {});
        return { success: false, error: 'Audio file is empty' };
      }

      return { success: true, resourceId, filePath: found.audioFilePath };
    } catch (error) {
      console.error('检查待恢复录音失败:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'sherpa:sendData',
    async (
      _,
      data: {
        uuid: string;
        workspaceId?: number | string;
        folderId?: number | string;
        data: Float32Array;
        save?: boolean;
        tracks?: [
          {
            format: 'srt';
            language: 'zh_cn';
            content: string;
          }
        ];
      }
    ) => {
      assertSherpaCapabilityActive('speechRecognition');
      ASR_sendData({ uuid: 'stream' }, data.data);

      // 如果启用了保存，将音频数据写入文件流
      if (data.save) {
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
    }
  );

  // 清理所有录音流（窗口关闭时调用）
  ipcMain.handle('sherpa:cleanupStreams', async () => {
    try {
      for (const [key, stream] of recordingStreams.entries()) {
        // 关闭音频写入流
        if (stream.audioWriteStream && !stream.audioWriteStream.destroyed) {
          stream.audioWriteStream.end();
        }
        // 关闭字幕写入流
        if (stream.subtitleWriteStream && !stream.subtitleWriteStream.destroyed) {
          stream.subtitleWriteStream.end();
        }
        recordingStreams.delete(key);
      }
      return { success: true };
    } catch (error) {
      console.error('清理录音流失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取录音历史记录（扫描各工作空间 recordings 目录下的 .pcm 文件）
  ipcMain.handle('sherpa:getRecordingHistory', async (_, data: { limit?: number; offset?: number }) => {
    try {
      const { limit = 50, offset = 0 } = data || {};

      const workspaces = await WorkspacesRepo.list({ deletedAt: 0 } as any, 100, 0);
      const items: Array<Record<string, any>> = [];

      for (const ws of workspaces) {
        if (!ws.rootPath) continue;
        const recRoot = path.join(ws.rootPath, 'recordings');
        let dateDirs: string[];
        try {
          dateDirs = await fs.readdir(recRoot);
        } catch {
          continue;
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
                workspaceId: ws.id,
                folderId: dir,
                status: 'ready'
              });
            } catch {
              // 单个文件读取失败不影响整体列表
            }
          }
        }
      }

      items.sort((a, b) => b.createdAt - a.createdAt);
      const result = items.slice(offset, offset + limit);

      return { success: true, data: result };
    } catch (error) {
      console.error('[Sherpa] 获取录音历史失败:', error);
      return { success: false, error: String(error), data: [] };
    }
  });

  // 删除录音记录（删除音频文件和关联的字幕文件）
  ipcMain.handle('sherpa:deleteRecording', async (_, data: { resourceId: string }) => {
    try {
      const { resourceId } = data;

      const found = await resolveRecordingAudioPath(resourceId);
      if (!found) {
        return { success: false, error: 'Resource not found' };
      }

      // 删除关联的字幕文件与音频文件
      const subtitleFilePath = found.audioFilePath.replace(/\.pcm$/, '.srt');
      await fs.unlink(subtitleFilePath).catch(() => {});
      await fs.unlink(found.audioFilePath).catch(() => {});

      console.log('[Sherpa] 录音记录已删除，resourceId:', resourceId);
      return { success: true };
    } catch (error) {
      console.error('[Sherpa] 删除录音记录失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 读取字幕文件内容
  ipcMain.handle('sherpa:readSubtitleContent', async (_, data: { filePath: string }) => {
    try {
      const { filePath } = data;
      if (!filePath || !fscb.existsSync(filePath)) {
        return { success: false, error: 'File not found' };
      }

      const content = await fs.readFile(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      console.error('[Sherpa] 读取字幕文件失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // ==================== TTS 相关 Handlers ====================

  // 创建 TTS 实例
  ipcMain.handle('sherpa:tts:createInstance', async (_, data: { model: string; numThreads?: number; maxNumSentences?: number }) => {
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
                w.webContents.send('renderer-message', { type: 'sherpa:tts:message', data: d });
              } catch (error) {
                console.error('[TTS] 发送 TTS 结果失败:', error);
              }
            }
          });
        };

        return { success: true };
      }

      return { success: false, error: 'Failed to create TTS instance' };
    } catch (error) {
      console.error('[TTS] 创建实例失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 释放 TTS 实例
  ipcMain.handle('sherpa:tts:freeInstance', async () => {
    try {
      TTS_freeInstance({ uuid: 'tts-stream' });
      return { success: true };
    } catch (error) {
      console.error('[TTS] 释放实例失败:', error);
      return { success: false, error: String(error) };
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

        return { success: true, requestId: data.requestId };
      } catch (error) {
        console.error('[TTS] 生成语音失败:', error);
        return { success: false, error: String(error), requestId: data.requestId };
      }
    }
  );

  // 生成语音并保存到文件（同步返回结果）
  ipcMain.handle(
    'sherpa:tts:generateToFile',
    async (
      _,
      data: {
        text: string;
        sid?: number;
        speed?: number;
        outputPath: string;
        requestId: string;
      }
    ): Promise<{ success: boolean; outputPath?: string; duration?: number; error?: string; requestId: string }> => {
      return new Promise((resolve) => {
        try {
          TTS_createInstance({
            uuid: `tts-file-${data.requestId}`,
            model: 'kokoro-multi-lang-v1_0' // 默认模型，可以从参数中传入
          }).then((instance) => {
            if (!instance) {
              resolve({ success: false, error: 'Failed to create TTS instance', requestId: data.requestId });
              return;
            }

            instance.handler = (result) => {
              TTS_freeInstance({ uuid: `tts-file-${data.requestId}` });

              if (result.error) {
                resolve({ success: false, error: result.error, requestId: data.requestId });
              } else {
                resolve({
                  success: true,
                  outputPath: result.outputPath,
                  duration: result.duration,
                  requestId: data.requestId
                });
              }
            };

            TTS_generateSpeech({
              uuid: `tts-file-${data.requestId}`,
              text: stripEmoji(data.text),
              sid: data.sid,
              speed: data.speed,
              outputPath: data.outputPath,
              requestId: data.requestId
            });
          });
        } catch (error) {
          console.error('[TTS] 生成语音文件失败:', error);
          resolve({ success: false, error: String(error), requestId: data.requestId });
        }
      });
    }
  );
}
