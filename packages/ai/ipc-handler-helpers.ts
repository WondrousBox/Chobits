import { readFile } from '@aim-packages/file-utils';
import { type AimSegments, parser } from '@aim-packages/subtitle';
import { BrowserWindow } from 'electron';

import { ResourcesRepo } from '../common/db';
import { sendAppBusyEnd, sendAppBusyProgress, sendAppBusyStart } from '../event';
import { getAgent } from './agents';
import { ChatService } from './chat-service';
import { createModel } from './models/index';
import { getAllSecrets, getFirstApiKey } from './settings-store';

/**
 * 从资源ID加载字幕片段
 */
export async function loadSegmentsFromResource(resourceId: string): Promise<Array<{ text: string; index: number }>> {
  const resource = await ResourcesRepo.getById(resourceId);
  if (!resource || !resource.filePath) {
    throw new Error(`Resource ${resourceId} not found or has no file path`);
  }

  const lower = resource.filePath.toLowerCase();
  const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');
  if (!isSubtitleFile) {
    throw new Error(`Resource ${resourceId} is not a subtitle file`);
  }

  const fileContent = await readFile(resource.filePath, 'utf8');
  const parsedResult = await parser.parseSubtitle(fileContent);
  const segments = (parsedResult?.segments || []).map((seg, idx) => ({
    text: seg.text,
    index: idx
  }));

  if (segments.length === 0) {
    throw new Error(`No segments found in subtitle file: ${resource.filePath}`);
  }

  console.log(`[loadSegments] Loaded ${segments.length} segments from resource ${resourceId}`);
  return segments;
}

/**
 * 从资源ID加载文本内容
 */
export async function loadContentFromResource(resourceId: string): Promise<string | AimSegments[]> {
  const resource = await ResourcesRepo.getById(resourceId);
  if (!resource || !resource.filePath) {
    throw new Error(`Resource ${resourceId} not found or has no file path`);
  }

  const lower = resource.filePath.toLowerCase();
  const isSubtitleFile = lower.endsWith('.srt') || lower.endsWith('.vtt') || lower.endsWith('.ass') || lower.endsWith('.ssa');

  if (isSubtitleFile) {
    // 读取字幕文件
    const fileContent = await readFile(resource.filePath, 'utf8');
    const parsedResult = await parser.parseSubtitle(fileContent);
    const segments = parsedResult?.segments || [];
    if (segments.length === 0) {
      throw new Error(`No segments found in subtitle file: ${resource.filePath}`);
    }
    console.log(`[loadContent] Loaded ${segments.length} segments from resource ${resourceId}`);
    return segments;
  } else {
    // 读取普通文本文件
    const content = await readFile(resource.filePath, 'utf8');
    if (!content || content.length === 0) {
      throw new Error(`No content found in file: ${resource.filePath}`);
    }
    console.log(`[loadContent] Loaded content from resource ${resourceId}`);
    return content;
  }
}

/**
 * 设置模型实例和Agent
 */
export interface ModelSetupResult {
  modelInstance: any;
  agent: any;
}

export async function setupModelAndAgent(providerId: string, model: string, agentId: string = 'assistant'): Promise<ModelSetupResult> {
  const chatService = new ChatService();

  // 获取 provider 配置
  const providerConfig = chatService.getProviderConfig(providerId);
  if (!providerConfig) {
    throw new Error(`Provider ${providerId} not found`);
  }

  // 获取 secrets
  const fields = providerConfig.fields as Array<{ key: string; required?: boolean }>;
  const keys = fields.map((f: any) => f.key);
  const secrets = await getAllSecrets(providerId, keys);
  const apiKey = getFirstApiKey(secrets.apiKey);

  if (!apiKey && fields.some((f: any) => f.key === 'apiKey' && f.required)) {
    throw new Error(`Provider ${providerId} 未配置 API Key`);
  }

  // 创建模型实例
  const modelConfig = {
    apiKey: apiKey || '',
    baseUrl: secrets.baseUrl as string,
    model: model || providerConfig.defaultModel
  };
  const modelInstance = createModel(providerId, modelConfig);

  // 获取 Agent 实例
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  // 配置 Agent 使用当前模型
  agent.model = modelInstance;

  return { modelInstance, agent };
}

/**
 * 创建通用的聊天函数
 */
export type ChatFunction = (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal) => Promise<void>;

export function createChatFunction(agent: any): ChatFunction {
  return async (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal): Promise<void> => {
    try {
      const stream = await agent.stream(prompt, {
        maxSteps: 10,
        abortSignal
      });

      for await (const chunk of stream.textStream) {
        if (abortSignal?.aborted) break;
        onEvent({ type: 'delta', data: { text: chunk } });
      }

      onEvent({ type: 'message_completed' });
    } catch (error: any) {
      onEvent({ type: 'error', data: { message: error?.message || '处理失败' } });
    }
  };
}

/**
 * 创建进度事件发射器的配置
 */
export interface EmitterConfig {
  requestId: string;
  eventType: string; // 'subtitle:translate' | 'summary' 等
  busyMessage?: string;
  progressMessage?: string;
  onChunkComplete?: (data: any) => void | Promise<void>;
  onCompleted?: (data: any) => void | Promise<void>;
}

/**
 * 创建通用的事件发射器
 */
export function createEventEmitter(config: EmitterConfig): (event: { type: string; data?: any }) => void {
  const { requestId, eventType, busyMessage = '正在处理...', progressMessage = '正在处理...', onChunkComplete, onCompleted } = config;

  let busyStarted = false;

  return (event: { type: string; data?: any }): void => {
    // 处理进度事件，发送给精灵
    if (event.type === 'progress' && event.data) {
      const { percentage, message } = event.data;
      if (percentage !== undefined) {
        sendAppBusyProgress(percentage, message || progressMessage);
      }

      // 在第一个进度事件时发送开始信号
      if (!busyStarted) {
        sendAppBusyStart(0, busyMessage);
        busyStarted = true;
      }
    }

    // 在完成时结束繁忙状态
    if (event.type === 'completed' || event.type === 'done' || event.type === 'error') {
      sendAppBusyEnd();
    }

    // 在 chunk-complete 时调用回调
    if (event.type === 'chunk-complete' && onChunkComplete) {
      Promise.resolve(onChunkComplete(event.data)).catch((err) => {
        console.error(`[${eventType}] chunk-complete 回调失败:`, err);
      });
    }

    // 在完成时调用回调
    if ((event.type === 'completed' || event.type === 'done') && onCompleted) {
      Promise.resolve(onCompleted(event.data)).catch((err) => {
        console.error(`[${eventType}] completed 回调失败:`, err);
      });
    }

    // 发送消息到渲染进程
    BrowserWindow.getAllWindows().forEach((w) => {
      if (!w.isDestroyed()) {
        try {
          w.webContents.send('renderer-message', {
            type: eventType,
            data: { requestId, ...event }
          });
        } catch (error) {
          console.error(`发送${eventType}消息失败:`, error);
        }
      }
    });
  };
}
