/**
 * TTS IPC 渲染进程接口
 *
 * 提供给渲染进程调用的TTS相关API
 */

import type { IpcRenderer } from 'electron';

import type { BatchTTSConfig, BatchTTSResult, TTSItemResult } from './batch-tts-service';

/**
 * 批量TTS合成返回结果（立即返回，不等待合成完成）
 */
export interface BatchTTSSynthesizeResponse {
  /** 请求ID，用于跟踪任务和接收事件 */
  requestId: string;
  /** 事件通道名称 */
  eventsChannel: string;
}

// TTS 事件通道
const TTS_EVENT_CHANNEL = 'tts:event';

/**
 * TTS合成进度事件数据
 */
export interface TTSProgressEventData {
  requestId: string;
  resourceId: string;
  type: 'progress';
  data: {
    currentIndex: number;
    total: number;
    percentage: number;
    message: string;
    currentText?: string;
  };
}

/**
 * TTS合成完成事件数据
 */
export interface TTSCompleteEventData {
  requestId: string;
  resourceId: string;
  type: 'complete';
  data: BatchTTSResult;
}

/**
 * TTS合成错误事件数据
 */
export interface TTSErrorEventData {
  requestId: string;
  resourceId: string;
  type: 'error';
  data: {
    message: string;
    code?: string;
    index?: number;
  };
}

/**
 * TTS完成事件数据
 */
export interface TTSDoneEventData {
  requestId: string;
  resourceId: string;
  type: 'done';
}

/**
 * TTS事件数据类型
 */
export type TTSEventData = TTSProgressEventData | TTSCompleteEventData | TTSErrorEventData | TTSDoneEventData;

/**
 * 批量TTS合成配置（不包含text，因为text通过items提供）
 */
export interface BatchSynthesisConfig {
  /** TTS类型，默认 'Edge' */
  type?: 'Edge' | 'OpenAI' | 'Volc' | string;
  /** 语音名称 */
  voiceName: string;
  /** 语速百分比（-100到200，默认20） */
  rate?: number;
  /** 音高百分比（-100到200，默认0） */
  pitch?: number;
}

/** 轨道标识：main 为主轨道，其他为语言代码如 zh-CN、en */
export type TTSTrackId = 'main' | string;

/**
 * 批量TTS合成参数
 */
export interface SynthesizeBatchParams {
  /** 资源ID */
  resourceId: string;
  /** 轨道标识：main 为主轨道，其他为语言代码如 zh-CN、en */
  trackId?: TTSTrackId;
  /** 语言代码（翻译轨道时可选） */
  languageCode?: string;
  /** 请求ID（可选） */
  requestId?: string;
  /** 要合成的项目 */
  items: Array<{
    text: string;
    index: number;
    id?: string;
  }>;
  /** TTS配置 */
  config: BatchSynthesisConfig;
  /** 最大并发数 */
  maxConcurrency?: number;
  /** 是否跳过空白移除 */
  skipTrimSilence?: boolean;
}

/**
 * TTS IPC 渲染进程接口类型
 */
export interface TTSIpcRenderer {
  /**
   * 批量合成TTS
   * 立即返回 requestId 和 eventsChannel，不等待合成完成
   * 合成进度和结果通过事件通道推送
   */
  synthesizeBatch: (params: SynthesizeBatchParams) => Promise<BatchTTSSynthesizeResponse>;

  /**
   * 取消TTS任务
   */
  cancelTask: (requestId: string) => Promise<boolean>;

  /**
   * 获取所有活跃任务
   */
  getActiveTasks: () => Promise<any[]>;

  /**
   * 检查是否有活跃任务
   */
  hasActiveTasks: () => Promise<boolean>;

  /**
   * 加载TTS历史记录
   * @param params.resourceId - 资源ID
   * @param params.trackId - 轨道标识（可选，默认 main）
   * @param params.configPrefix - 配置前缀（可选，如果提供了 config 则自动计算）
   * @param params.config - TTS配置对象（可选，用于自动计算 configPrefix）
   */
  loadHistory: (params: {
    resourceId: string;
    trackId?: TTSTrackId;
    configPrefix?: string;
    config?: BatchSynthesisConfig;
  }) => Promise<any>;

  /**
   * 删除指定轨道的TTS文件目录
   */
  deleteTrackFiles: (params: { resourceId: string; trackId: TTSTrackId }) => Promise<{ success: boolean }>;

  /**
   * 监听TTS事件
   * @param callback 事件回调函数
   * @returns 取消监听的函数
   */
  onEvent: (callback: (event: TTSEventData) => void) => () => void;
}

/**
 * 创建TTS IPC渲染进程接口
 */
export function createTTSIpcRenderer(ipcRenderer: IpcRenderer): TTSIpcRenderer {
  return {
    synthesizeBatch: (params: SynthesizeBatchParams) => ipcRenderer.invoke('tts:synthesizeBatch', params),

    cancelTask: (requestId: string) => ipcRenderer.invoke('tts:cancelTask', requestId),

    getActiveTasks: () => ipcRenderer.invoke('tts:getActiveTasks'),

    hasActiveTasks: () => ipcRenderer.invoke('tts:hasActiveTasks'),

    loadHistory: (params: {
      resourceId: string;
      trackId?: TTSTrackId;
      configPrefix?: string;
      config?: BatchSynthesisConfig;
    }) => ipcRenderer.invoke('tts:loadHistory', params),

    deleteTrackFiles: (params: { resourceId: string; trackId: TTSTrackId }) => ipcRenderer.invoke('tts:deleteTrackFiles', params),

    updateSegmentTimes: (params: {
      resourceId: string;
      trackId: TTSTrackId;
      configPrefix: string;
      md5: string;
      st: number;
      et: number;
    }) => ipcRenderer.invoke('tts:updateSegmentTimes', params),

    onEvent: (callback: (event: TTSEventData) => void) => {
      const handler = (_event: any, data: TTSEventData): void => {
        callback(data);
      };
      ipcRenderer.on(TTS_EVENT_CHANNEL, handler);
      return () => {
        ipcRenderer.off(TTS_EVENT_CHANNEL, handler);
      };
    }
  };
}

export type { BatchTTSConfig, BatchTTSResult, TTSItemResult };
