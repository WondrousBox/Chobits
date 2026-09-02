import { ipcRenderer } from 'electron';

import { CommonConfig, SherpaModel } from './common';
import type { ASRConfig } from './ipc-main';

export const sherpaIpcRenderer = {
  // ASR 配置持久化
  getASRConfig(): Promise<ASRConfig> {
    return ipcRenderer.invoke('sherpa:get-asr-config');
  },

  saveASRConfig(partial: Partial<ASRConfig>): Promise<ASRConfig> {
    return ipcRenderer.invoke('sherpa:save-asr-config', partial);
  },
  createInstance(data: { model?: SherpaModel; punctuationModel?: string; language?: string; type?: 'online' | 'offline' | 'vad'; commonConfig?: CommonConfig }): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:create-instance', data);
  },

  destroyInstance(): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:destroy-instance');
  },

  // 查询 ASR 引擎运行状态
  getStatus(): Promise<{ running: boolean }> {
    return ipcRenderer.invoke('sherpa:get-status');
  },

  sendData(data: {
    uuid: string;
    workspaceId?: string;
    folderId?: string;
    data: Float32Array;
    shouldSave?: boolean;
    tracks?: [
      {
        format: 'srt';
        language: 'zh_cn';
        content: string;
      }
    ];
  }): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:send-data', data);
  },

  startRecording(data: { workspaceId?: string; folderId?: string }): Promise<{ ok: boolean; resourceId?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:start-recording', data);
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

  saveSubtitle(data: { resourceId: string; srtContent: string }): Promise<{ ok: boolean; srtResourceId?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:save-subtitle', data);
  },

  checkPendingRecording(data: { resourceId: string }): Promise<{ ok: boolean; resourceId?: string; filePath?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:check-pending-recording', data);
  },

  cleanupStreams(): Promise<{ ok: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:cleanup-streams');
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
      workspaceId: string;
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

  // 生成语音（异步，结果通过 app:renderer-message 事件返回）
  ttsGenerate(data: { text: string; sid?: number; speed?: number; outputPath?: string; requestId: string }): Promise<{ ok: boolean; requestId: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:tts:generate', data);
  },

  // 生成语音并保存到文件（同步返回结果）
  ttsGenerateToFile(data: {
    text: string;
    sid?: number;
    speed?: number;
    outputPath: string;
    requestId: string;
  }): Promise<{ ok: boolean; outputPath?: string; duration?: number; error?: string; requestId: string }> {
    return ipcRenderer.invoke('sherpa:tts:generate-to-file', data);
  }
};

export type SherpaIpcRendererType = typeof sherpaIpcRenderer;
