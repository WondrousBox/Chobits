import { ipcRenderer, IpcRendererEvent } from 'electron';

import { CommonConfig, SherpaModel } from './common';
import type { ASRConfig } from './ipc-main';

// ASR 识别结果（主进程通过 sherpa:asr-result 广播到所有窗口）
export interface ASRResultPayload {
  start?: number;
  end?: number;
  text?: string;
  isEndpoint?: boolean;
  // VAD 模式（云端识别链路）回传的音频分段
  samples?: number[];
  duration?: number;
}

// TTS 合成结果（主进程通过 sherpa:tts-result 广播到所有窗口）
export interface TTSResultPayload {
  requestId: string;
  samples?: number[];
  sampleRate?: number;
  duration?: number;
  outputPath?: string;
  elapsedSeconds?: number;
  rtf?: number;
  error?: string;
}

export interface ASRConfigResult {
  ok: boolean;
  config?: ASRConfig;
  error?: string;
}

export interface ASRStatusResult {
  ok: boolean;
  running?: boolean;
  error?: string;
}

export interface SherpaOperationResult {
  ok: boolean;
  error?: string;
}

export const sherpaBridge = {
  // ASR 配置持久化
  getASRConfig(): Promise<ASRConfigResult> {
    return ipcRenderer.invoke('sherpa:get-asr-config');
  },

  saveASRConfig(partial: Partial<ASRConfig>): Promise<ASRConfigResult> {
    return ipcRenderer.invoke('sherpa:save-asr-config', partial);
  },

  createInstance(data: { model?: SherpaModel; punctuationModel?: string; language?: string; type?: 'online' | 'offline' | 'vad'; commonConfig?: CommonConfig }): Promise<SherpaOperationResult> {
    return ipcRenderer.invoke('sherpa:create-instance', data);
  },

  destroyInstance(): Promise<SherpaOperationResult> {
    return ipcRenderer.invoke('sherpa:destroy-instance');
  },

  // 查询 ASR 引擎运行状态
  getStatus(): Promise<ASRStatusResult> {
    return ipcRenderer.invoke('sherpa:get-status');
  },

  sendData(data: { uuid: string; data: Float32Array; shouldSave?: boolean }): Promise<SherpaOperationResult> {
    return ipcRenderer.invoke('sherpa:send-data', data);
  },

  // 订阅 ASR 识别结果广播，返回取消订阅函数
  onASRResult(callback: (data: ASRResultPayload) => void): () => void {
    const listener = (_event: IpcRendererEvent, data: ASRResultPayload): void => callback(data);
    ipcRenderer.on('sherpa:asr-result', listener);
    return () => ipcRenderer.off('sherpa:asr-result', listener);
  },

  // 订阅 TTS 合成结果广播，返回取消订阅函数
  onTTSResult(callback: (data: TTSResultPayload) => void): () => void {
    const listener = (_event: IpcRendererEvent, data: TTSResultPayload): void => callback(data);
    ipcRenderer.on('sherpa:tts-result', listener);
    return () => ipcRenderer.off('sherpa:tts-result', listener);
  },

  startRecording(): Promise<{ ok: boolean; resourceId?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:start-recording');
  },

  // 继续之前的录音（追加模式）
  resumeRecording(data: { resourceId: string }): Promise<{ ok: boolean; resourceId?: string; segmentCount?: number; error?: string }> {
    return ipcRenderer.invoke('sherpa:resume-recording', data);
  },

  stopRecording(): Promise<{ ok: boolean; resourceId?: string; srtResourceId?: string; segmentCount?: number; error?: string }> {
    return ipcRenderer.invoke('sherpa:stop-recording');
  },

  // 追加字幕片段（流式写入）
  appendSubtitle(data: { segment: { text: string; start: number; end: number; translation?: string } }): Promise<{ ok: boolean; segmentIndex?: number; error?: string }> {
    return ipcRenderer.invoke('sherpa:append-subtitle', data);
  },

  // 获取录音历史记录
  getRecordingHistory(data?: { limit?: number; offset?: number }): Promise<{
    ok: boolean;
    data: Array<{
      id: string;
      title: string;
      audioFilePath: string;
      subtitleFilePath: string | null;
      subtitleResourceId: string | null;
      duration: number;
      sizeBytes: number;
      createdAt: number;
      updatedAt: number;
      folderId: string;
      status: string;
    }>;
    error?: string;
  }> {
    return ipcRenderer.invoke('sherpa:get-recording-history', data || {});
  },

  // 删除录音记录
  deleteRecording(data: { resourceId: string }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:delete-recording', data);
  },

  // 读取字幕文件内容
  readSubtitleContent(data: { filePath: string }): Promise<{ ok: boolean; content?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:read-subtitle-content', data);
  },

  // ==================== TTS 相关方法 ====================

  // 创建 TTS 实例
  ttsCreateInstance(data: { model: string; numThreads?: number; maxNumSentences?: number }): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:tts:create-instance', data);
  },

  // 释放 TTS 实例
  ttsDestroyInstance(): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:tts:destroy-instance');
  },

  // 生成语音（异步，结果通过 sherpa:tts-result 事件返回）
  ttsGenerate(data: { text: string; sid?: number; speed?: number; outputPath?: string; requestId: string }): Promise<{ ok: boolean; requestId: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:tts:generate', data);
  }
};

export type SherpaBridgeType = typeof sherpaBridge;
