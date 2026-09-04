/**
 * Agent 循环事件负载类型定义
 */

// ━━ Agent Loop Complete Payload ━━

export interface AgentLoopToolCallInfo {
  callId: string;
  name: string;
  args?: any;
  result?: any;
}

/**
 * Agent 工具调用循环结束后发出的事件负载。
 * 参考 Claude Code 的 handleStopHooks 机制：
 * 只在模型最终回复（无后续 tool_use）时触发。
 */
export interface AgentLoopCompletePayload {
  conversationId: string;
  /** 本轮 agent 循环中的所有工具调用 */
  toolCalls: AgentLoopToolCallInfo[];
  /** 是否包含工具调用（快捷判断） */
  hasToolCalls: boolean;
  /** 助手最终回复的文本长度（用于判断信息密度） */
  assistantContentLength: number;
  /** 运行时类型 */
  runtime: 'pi' | 'openai' | 'other';
  /** 本轮是否持久化了消息 */
  persisted: boolean;
  /** agent / profile ID */
  agentId?: string;
  /** 本轮实际使用的 provider */
  providerId?: string;
  /** 本轮实际使用的 provider preset */
  providerPresetId?: string;
}
