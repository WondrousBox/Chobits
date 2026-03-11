import { ipcRenderer } from 'electron';

import { AllModels, CommonConfig } from './common';
import type { ASRConfig } from './ipc-main';

export const sherpaIpcRenderer = {
  // ASR 配置持久化
  getASRConfig(): Promise<ASRConfig> {
    return ipcRenderer.invoke('sherpa:getASRConfig');
  },

  saveASRConfig(partial: Partial<ASRConfig>): Promise<ASRConfig> {
    return ipcRenderer.invoke('sherpa:saveASRConfig', partial);
  },
  createInstance(data: { model?: AllModels; punctuationModel?: string; language?: string; type?: 'online' | 'offline' | 'vad'; commonConfig?: CommonConfig }): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:createInstance', data);
  },

  freeInstance(): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:freeInstance');
  },

  // 查询 ASR 引擎运行状态
  getStatus(): Promise<{ running: boolean }> {
    return ipcRenderer.invoke('sherpa:getStatus');
  },

  sendData(data: {
    uuid: string;
    workspaceId?: string;
    folderId?: string;
    data: Float32Array;
    save?: boolean;
    tracks?: [
      {
        format: 'srt';
        language: 'zh_cn';
        content: string;
      }
    ];
  }): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:sendData', data);
  },

  startRecording(data: { workspaceId?: string; folderId?: string }): Promise<{ success: boolean; resourceId?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:startRecording', data);
  },

  // 继续之前的录音（追加模式）
  resumeRecording(data: { resourceId: string }): Promise<{ success: boolean; resourceId?: string; segmentCount?: number; error?: string }> {
    return ipcRenderer.invoke('sherpa:resumeRecording', data);
  },

  stopRecording(): Promise<{ success: boolean; resourceId?: string; srtResourceId?: string; segmentCount?: number; error?: string }> {
    return ipcRenderer.invoke('sherpa:stopRecording');
  },

  // 追加字幕片段（流式写入）
  appendSubtitle(data: { segment: { text: string; start: number; end: number; translation?: string } }): Promise<{ success: boolean; segmentIndex?: number; error?: string }> {
    return ipcRenderer.invoke('sherpa:appendSubtitle', data);
  },

  saveSubtitle(data: { resourceId: string; srtContent: string }): Promise<{ success: boolean; srtResourceId?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:saveSubtitle', data);
  },

  checkPendingRecording(data: { resourceId: string }): Promise<{ success: boolean; resourceId?: string; filePath?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:checkPendingRecording', data);
  },

  cleanupStreams(): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:cleanupStreams');
  },

  // 获取录音历史记录
  getRecordingHistory(data?: { limit?: number; offset?: number }): Promise<{
    success: boolean;
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
    return ipcRenderer.invoke('sherpa:getRecordingHistory', data || {});
  },

  // 删除录音记录
  deleteRecording(data: { resourceId: string }): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:deleteRecording', data);
  },

  // 读取字幕文件内容
  readSubtitleContent(data: { filePath: string }): Promise<{ success: boolean; content?: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:readSubtitleContent', data);
  },

  // ==================== TTS 相关方法 ====================

  // 创建 TTS 实例
  ttsCreateInstance(data: { model: string; numThreads?: number; maxNumSentences?: number }): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:tts:createInstance', data);
  },

  // 释放 TTS 实例
  ttsFreeInstance(): Promise<{ success: boolean; error?: string }> {
    return ipcRenderer.invoke('sherpa:tts:freeInstance');
  },

  // 生成语音（异步，结果通过 renderer-message 事件返回）
  ttsGenerate(data: { text: string; sid?: number; speed?: number; outputPath?: string; requestId: string }): Promise<{ success: boolean; requestId: string; error?: string }> {
    return ipcRenderer.invoke('sherpa:tts:generate', data);
  },

  // 生成语音并保存到文件（同步返回结果）
  ttsGenerateToFile(data: {
    text: string;
    sid?: number;
    speed?: number;
    outputPath: string;
    requestId: string;
  }): Promise<{ success: boolean; outputPath?: string; duration?: number; error?: string; requestId: string }> {
    return ipcRenderer.invoke('sherpa:tts:generateToFile', data);
  }
};

export type SherpaIpcRendererType = typeof sherpaIpcRenderer;
