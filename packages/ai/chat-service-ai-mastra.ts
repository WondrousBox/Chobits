/**
 * Mastra Chat 服务
 *
 * 提供与 Electron IPC 集成的聊天服务
 * 保持与旧 AI 模块的 API 兼容性
 */

import { Agent } from '@mastra/core/agent';
import { BrowserWindow, ipcMain } from 'electron';

import { getAgent } from './agents/index';
import { InstancesStore } from './instances-store';
import { createModel, getProviderConfig } from './models/index';
import { getAllSecrets, getFirstApiKey } from './settings-store';
import type { ChatRequest, ChatResponse } from './types';

// ============================================================================
// Chat 服务类
// ============================================================================

export class MastraChatService {
  private controllers = new Map<string, AbortController>();
  private defaultWin?: BrowserWindow;

  constructor(defaultWin?: BrowserWindow) {
    this.defaultWin = defaultWin;
  }

  /**
   * 注册 IPC 处理器
   */
  registerIpc(): void {
    ipcMain.handle('ai:chat', async (e, req: ChatRequest) => this.chat(BrowserWindow.fromWebContents(e.sender) || this.defaultWin, req));
  }

  /**
   * 合并实例配置
   */
  private async withInstance(req: ChatRequest): Promise<ChatRequest> {
    if (!req.providerInstanceId) return req;

    const inst = InstancesStore.get(req.providerInstanceId);
    if (!inst) return req;

    // 获取实例的 secrets
    const { getAllInstanceSecrets } = await import('./settings-store');
    const instSecrets = await getAllInstanceSecrets(req.providerInstanceId);

    // 合并配置
    return {
      ...req,
      providerId: inst.providerId,
      extras: {
        ...(req.extras || {}),
        model: inst.model || req.extras?.model,
        systemPrompt: inst.systemPrompt || req.extras?.systemPrompt,
        secrets: { ...(inst.config || {}), ...instSecrets, ...(req.extras?.secrets || {}) }
      }
    };
  }

  /**
   * 获取配置好的 Agent
   */
  private async getConfiguredAgent(req: ChatRequest): Promise<Agent | undefined> {
    const agentId = req.agentId || 'assistant';
    const agent = getAgent(agentId);
    if (!agent) return undefined;

    // 获取 provider 配置
    const providerId = req.providerId || 'openai';
    const providerConfig = getProviderConfig(providerId);
    if (!providerConfig) return agent;

    // 获取 secrets
    const keys = providerConfig.fields.map((f) => f.key);
    const secrets = await getAllSecrets(providerId, keys);
    const apiKey = getFirstApiKey(secrets.apiKey);

    if (!apiKey && providerConfig.fields.some((f) => f.key === 'apiKey' && f.required)) {
      console.warn(`Provider ${providerId} 未配置 API Key`);
      return agent;
    }

    // 创建模型实例并配置 Agent
    try {
      const modelConfig = {
        apiKey: apiKey || '',
        baseUrl: secrets.baseUrl as string,
        model: (req.extras?.model as string) || providerConfig.defaultModel
      };
      const model = createModel(providerId, modelConfig);

      agent.model = model;
      return agent;
    } catch (error) {
      console.error('创建模型失败:', error);
      return agent;
    }
  }

  /**
   * 非流式聊天
   */
  async chat(_win: BrowserWindow | undefined, req: ChatRequest): Promise<ChatResponse> {
    const resolved = await this.withInstance(req);
    const agent = await this.getConfiguredAgent(resolved);

    if (!agent) {
      return { message: { role: 'assistant', content: 'Agent 不可用' } };
    }

    try {
      // 构建消息：使用最后一条用户消息作为输入
      // Mastra Agent 会自动处理上下文
      const lastUserMessage = resolved.messages.filter((m) => m.role === 'user').pop();
      const userInput = lastUserMessage?.content || '';

      // 调用 Agent（使用字符串输入）
      const response = await agent.generate(userInput, {
        maxSteps: 10
      });

      return {
        message: {
          role: 'assistant',
          content: response.text || '',
          createdAt: Date.now()
        },
        providerId: resolved.providerId,
        agentId: resolved.agentId
      };
    } catch (error) {
      console.error('Chat 错误:', error);
      return {
        message: {
          role: 'assistant',
          content: `错误: ${error instanceof Error ? error.message : String(error)}`
        }
      };
    }
  }
}
