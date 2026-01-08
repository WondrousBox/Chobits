import { ipcRenderer } from 'electron';

import { AllModels } from './common';

export const sherpaIpcRenderer = {
  createInstance(data: { model?: AllModels; punctuationModel?: string; language?: string; type?: 'online' | 'offline' | 'vad' }): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:createInstance', data);
  },

  freeInstance(): Promise<boolean> {
    return ipcRenderer.invoke('sherpa:freeInstance');
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
  }
};

export type SherpaIpcRendererType = typeof sherpaIpcRenderer;
