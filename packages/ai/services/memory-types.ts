/**
 * Memory System TypeScript 类型定义
 * 定义 Frontmatter、提取输出、检索结果等核心接口。
 */

// ━━ Memory Note Frontmatter ━━

export interface MemoryNoteEntity {
  name: string;
  type: 'person' | 'product' | 'technology' | 'organization' | 'concept' | 'location' | 'event' | 'other';
}

export interface MemoryNoteMessageRange {
  conversationId: string;
  seqStart: number;
  seqEnd: number;
}

export interface MemoryNoteTimeRange {
  start: number; // 毫秒时间戳
  end: number;
}

export interface MemoryNoteFrontmatter {
  // 身份
  id: string;
  version: number;

  // 归属
  workspaceId: string;
  date: string; // YYYY-MM-DD
  timeRange?: MemoryNoteTimeRange;

  // 主题与分类
  topics: string[]; // 至少 1 个
  parentTopicId?: string;
  relatedTopicIds?: string[];

  // 关键词与实体
  keywords: string[]; // 至少 3 个
  aliases?: string[];
  entities?: MemoryNoteEntity[];

  // 摘要
  summary: string;

  // 溯源
  sourceConversationIds: string[];
  sourceMessageRange?: MemoryNoteMessageRange[];

  // 权重与稳定度
  importance: number; // 0.0 ~ 1.0
  stability: number; // 0.0 ~ 1.0

  // 生命周期
  createdAt: number; // 毫秒时间戳
  updatedAt: number;
}

// ━━ Section Index ━━

export interface MemoryNoteSectionIndex {
  noteId: string;
  heading: string; // 标题路径，如 "Key Facts > 技术选型"
  headingLevel: number; // 2 | 3
  summary: string; // 段落摘要
  keywords: string[]; // 段落级关键词
  lineStart: number; // 起始行号 (1-based)
  lineEnd: number; // 结束行号 (1-based)
  charCount: number;
}

// ━━ LLM Extraction Output ━━

/** LLM 主题拆分输出 */
export interface TopicCluster {
  topicLabel: string;
  topicSlug: string;
  description: string;
  messageRanges: Array<{
    conversationId: string;
    seqStart: number;
    seqEnd: number;
  }>;
  estimatedImportance: number;
}

export interface TopicSplitOutput {
  topicClusters: TopicCluster[];
}

/** LLM 结构化提取输出（单个主题） */
export interface MemoryExtractionOutput {
  topicLabel: string;
  topicSlug: string;
  summary: string;
  importance: number;
  stability: number;
  keywords: string[];
  aliases?: string[];
  entities?: MemoryNoteEntity[];
  relatedTopics?: string[];
  sections: {
    overview: string;
    keyFacts?: string;
    decisions?: string;
    openLoops?: string;
    evidence?: string;
    relatedTopicsDetail?: string;
  };
}

// ━━ Merge Result ━━

export interface MergedNote {
  action: 'create' | 'update';
  noteId: string;
  frontmatter: MemoryNoteFrontmatter;
  sections: Map<string, string>; // heading → markdown content
  filePath: string; // workspace-relative path
}

// ━━ Write Result ━━

export interface WriteStats {
  notesCreated: number;
  notesUpdated: number;
  topicsCreated: number;
  edgesCreated: number;
  keywordsCreated: number;
}

// ━━ Collect Phase ━━

export interface CollectInput {
  conversationIds: string[];
  /** 增量模式：只取 seq > watermark 的消息 */
  watermarks?: Map<string, number>;
}

export interface CollectedMessage {
  role: 'user' | 'assistant';
  content: string;
  seq: number;
  createdAt: number;
}

export interface CollectedConversation {
  conversationId: string;
  title?: string;
  messages: CollectedMessage[];
}

export interface CollectOutput {
  conversations: CollectedConversation[];
  totalMessageCount: number;
  dateRange: { start: string; end: string };
}

// ━━ Extraction Job ━━

export type MemorySyncJobType = 'daily_extraction' | 'conversation_close' | 'manual_reindex' | 'file_change_reindex';

export interface ExtractionJobParams {
  jobType: MemorySyncJobType;
  workspaceId: string;
  targetDate?: string;
  targetConversationIds: string[];
}

export interface ExtractionProgress {
  stage: 'collect' | 'split' | 'extract' | 'merge' | 'write';
  current: number;
  total: number;
  currentTopic?: string;
  message?: string;
}

export interface ExtractionResult {
  succeeded: Array<{ topicSlug: string; noteId: string }>;
  failed: Array<{ topicSlug: string; error: string }>;
  stats: WriteStats;
}

// ━━ Extraction Config ━━

export interface MemoryExtractionConfig {
  /** 是否启用自动记忆提取 */
  enabled: boolean;
  /** 触发提取的最少新增消息数 */
  minNewMessages: number; // default: 4
  /** 会话结束触发的最小间隔（毫秒） */
  minTriggerInterval: number; // default: 30 * 60 * 1000
  /** 单次提取的最大 token 预算 */
  maxTokensPerExtraction: number; // default: 20000
  /** 使用的 AI provider 和 model */
  providerId?: string;
  model?: string;
}

export const DEFAULT_EXTRACTION_CONFIG: MemoryExtractionConfig = {
  enabled: true,
  minNewMessages: 4,
  minTriggerInterval: 30 * 60 * 1000,
  maxTokensPerExtraction: 20000
};

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
}

// ━━ Chat function type for LLM calls ━━

export type MemoryChatFn = (prompt: string, signal?: AbortSignal) => Promise<string>;
