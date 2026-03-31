# AI Agent 优化参考方案

> 当前 `packages/ai` 实现，整理出值得借鉴的架构模式与优化方向。
>
> 更新时间：2026-03-31

---

## 目录

1. [总览：差距与优先级](#1-总览差距与优先级)
2. [Agent 循环架构](#2-agent-循环架构)
3. [上下文管理（Context Engineering）](#3-上下文管理context-engineering)
4. [工具系统](#4-工具系统)
5. [工具编排与并发](#5-工具编排与并发)
6. [流式工具执行](#6-流式工具执行)
7. [重试与韧性](#7-重试与韧性)
8. [成本与 Token 追踪](#8-成本与-token-追踪)
9. [权限与 Hook 系统](#9-权限与-hook-系统)
10. [依赖注入与可测试性](#10-依赖注入与可测试性)
11. [实施路线图](#11-实施路线图)

---

## 1. 总览：差距与优先级

### 当前 Chobits AI 模块的核心能力

- 多 Provider 注册与密钥管理（已完善）
- 流式对话与取消（通过 Pi runtime 实现）
- 工具调用（依赖 Pi coding agent）
- 会话持久化（ChatRepo）
- Profile 系统（chat / assistant / coder）

### Claude Code 有而 Chobits 缺少/薄弱的能力

| 能力             | Claude Code                                  | Chobits 现状           | 优先级 |
| ---------------- | -------------------------------------------- | ---------------------- | ------ |
| 自研 Agent 循环  | `queryLoop` while(true) + State              | 依赖外部 Pi 包         | ⭐⭐⭐ |
| 多层上下文压缩   | snip → microcompact → collapse → autocompact | 仅保留最近 6 条        | ⭐⭐⭐ |
| 工具 Schema 校验 | Zod inputSchema + validateInput              | Pi 内部处理            | ⭐⭐   |
| 工具并发编排     | isConcurrencySafe 分区 + 并行批次            | Pi 内部处理            | ⭐⭐   |
| 流式工具执行     | StreamingToolExecutor（边流边跑）            | Pi 内部处理            | ⭐⭐   |
| 结构化重试       | withRetry（指数退避 + 限流 + fallback）      | 无                     | ⭐⭐⭐ |
| 成本追踪         | 按模型聚合 + 会话级持久化                    | usage 字段预留但未实现 | ⭐⭐   |
| 工具 Hook 系统   | Pre/Post Hook + 权限决策 + 结果拦截          | 无                     | ⭐     |
| 依赖注入         | QueryDeps（可替换 callModel/compact 等）     | 无                     | ⭐⭐   |
| 模型 Fallback    | FallbackTriggeredError → 自动换模型          | 无                     | ⭐⭐   |

### 核心策略

**不是"替换 Pi runtime"，而是在 Pi runtime 之上/之外，补齐自研能力层**：

1. **Phase 1**：补齐基础设施（重试、成本追踪、上下文管理）—— 这些不依赖是否使用 Pi
2. **Phase 2**：抽象 Agent 循环接口，使 Pi coding agent 成为可选后端之一
3. **Phase 3**：实现自研 Agent 循环，支持自定义工具编排、Hook 系统

---

## 2. Agent 循环架构

### Claude Code 的设计（`src/query.ts` → `queryLoop`）

Claude Code 的核心是一个 `while(true)` 状态机，每轮迭代：

```
上下文压缩 → 调模型（流式） → 检查 tool_use → 执行工具 → 拼回消息 → continue
```

关键设计：

```typescript
// Claude Code 的 State 结构（简化）
type QueryState = {
  messages: Message[];
  toolUseContext: ToolUseContext;
  autoCompactTracking: CompactTracking;
  maxOutputTokensRecoveryCount: number;
  hasAttemptedReactiveCompact: boolean;
  turnCount: number;
  transition: { reason: string };
};

// 主循环（概念性伪代码）
async function* queryLoop(params, initialState): AsyncGenerator<SDKMessage> {
  let state = initialState;
  while (true) {
    // 1. 上下文工程
    const messagesForQuery = await prepareContext(state.messages);

    // 2. 调模型
    let needsFollowUp = false;
    const toolUseBlocks = [];
    for await (const event of callModel(messagesForQuery)) {
      yield event;
      if (event.type === 'tool_use') {
        needsFollowUp = true;
        toolUseBlocks.push(event);
      }
    }

    // 3. 不需要工具调用 → 可能结束
    if (!needsFollowUp) {
      // 检查 stop hooks、token budget continuation 等
      return;
    }

    // 4. 执行工具，收集结果
    const toolResults = [];
    for await (const result of runTools(toolUseBlocks, state.toolUseContext)) {
      yield result;
      toolResults.push(result.message);
    }

    // 5. 拼回消息，进入下一轮
    state.messages = [...messagesForQuery, ...assistantMessages, ...toolResults];
    state.turnCount++;
    continue;
  }
}
```

### Chobits 当前的对比

当前 Chobits 的 Agent 循环完全由 Pi coding agent 的 `AgentSession` 管理，`chat-service.ts` 只做：

- 请求准备 → 发给 Pi → 收流式事件 → 持久化

**缺少的自主控制**：

- 无法自定义上下文压缩策略
- 无法控制工具执行顺序和并发
- 无法在循环中插入自定义逻辑（如 Hook、cost check）
- 难以实现模型 Fallback

### 推荐方案：抽象 AgentLoop 接口

```typescript
// packages/ai/agent/types.ts

import { z } from 'zod';

/** Agent 循环的可变状态 */
export interface AgentLoopState {
  messages: AgentMessage[];
  turnCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  aborted: boolean;
}

/** Agent 循环的不可变参数 */
export interface AgentLoopParams {
  systemPrompt: string;
  tools: ToolDefinition[];
  model: ModelConfig;
  maxTurns: number;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

/** Agent 循环事件 */
export type AgentEvent =
  | { type: 'turn_start'; turn: number }
  | { type: 'model_response_start' }
  | { type: 'delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_call'; name: string; args: unknown; callId: string }
  | { type: 'tool_result'; callId: string; result: unknown }
  | { type: 'turn_end'; turn: number; reason: string }
  | { type: 'cost_update'; usage: TokenUsage }
  | { type: 'error'; error: Error }
  | { type: 'done'; finalMessage: AgentMessage };

/** Agent 循环的抽象接口 */
export interface AgentLoop {
  run(params: AgentLoopParams, initialMessages: AgentMessage[]): AsyncGenerator<AgentEvent>;
  abort(): void;
}
```

**实现层次**：

```
AgentLoop (interface)
├── PiAgentLoop          ← 包装现有 Pi coding agent（向后兼容）
├── SimpleAgentLoop      ← 自研简单循环（Phase 2）
└── AdvancedAgentLoop    ← 带完整上下文管理的循环（Phase 3）
```

---

## 3. 上下文管理（Context Engineering）

### Claude Code 的多层策略

Claude Code 在每轮循环开始时，按顺序对消息做多层处理：

```
原始消息
  ↓
① applyToolResultBudget    ── 工具结果体量预算（大结果替换为引用）
  ↓
② snipCompactIfNeeded      ── 历史剪裁（保留近期 + boundary 摘要）
  ↓
③ microcompact             ── 微压缩（去除冗余空白、简化格式）
  ↓
④ contextCollapse          ── 折叠旧的工具调用细节为摘要
  ↓
⑤ autocompact              ── 超阈值时整段摘要压缩
  ↓
发送给模型的消息
```

### Chobits 当前问题

```typescript
// chat-service.ts 第 389-396 行 —— 硬截断
private selectRecentMessages(messages?: ChatMessage[]): ChatMessage[] | undefined {
  const systemMessages = messages.filter((message) => message.role === 'system');
  const dialogMessages = messages.filter((message) => message.role !== 'system');
  return [...systemMessages, ...dialogMessages.slice(-6)];
}
```

只保留最近 6 条非 system 消息，丢失所有历史上下文。

### 推荐方案：分层上下文管理器

```typescript
// packages/ai/agent/context-manager.ts

export interface ContextManagerConfig {
  /** 模型最大上下文窗口（tokens） */
  maxContextTokens: number;
  /** 预留给输出的 tokens */
  reservedOutputTokens: number;
  /** 工具结果最大字符数（超过则替换为摘要） */
  toolResultBudgetChars: number;
  /** 是否启用自动摘要压缩 */
  enableAutoCompact: boolean;
  /** 自动压缩的阈值（占 maxContextTokens 的比例） */
  autoCompactThreshold: number; // e.g. 0.8
  /** 估算 token 数的函数 */
  estimateTokens: (text: string) => number;
  /** 执行摘要的函数（调 AI） */
  summarize?: (messages: AgentMessage[]) => Promise<string>;
}

export class ContextManager {
  private config: ContextManagerConfig;
  private compactBoundaryIndex = 0;

  constructor(config: ContextManagerConfig) {
    this.config = config;
  }

  /**
   * 对消息列表进行上下文工程，返回可发给模型的消息
   *
   * 处理顺序：
   * 1. 工具结果预算 —— 大结果替换为摘要/引用
   * 2. 历史剪裁 —— 保留 system + 最近 N 轮 + boundary 摘要
   * 3. 自动压缩 —— 超阈值时调 AI 做摘要
   */
  async prepare(messages: AgentMessage[]): Promise<{
    messages: AgentMessage[];
    estimatedTokens: number;
    wasCompacted: boolean;
  }> {
    let processed = [...messages];
    let wasCompacted = false;

    // Step 1: 工具结果预算
    processed = this.applyToolResultBudget(processed);

    // Step 2: Token 估算
    let estimatedTokens = this.estimateTotal(processed);

    // Step 3: 如果超阈值且有 summarize 函数，执行自动压缩
    const threshold = this.config.maxContextTokens * this.config.autoCompactThreshold;
    if (this.config.enableAutoCompact && estimatedTokens > threshold && this.config.summarize) {
      processed = await this.autoCompact(processed);
      estimatedTokens = this.estimateTotal(processed);
      wasCompacted = true;
    }

    // Step 4: 硬性裁剪保底（确保不超过上下文窗口）
    const budget = this.config.maxContextTokens - this.config.reservedOutputTokens;
    if (estimatedTokens > budget) {
      processed = this.hardTruncate(processed, budget);
      estimatedTokens = this.estimateTotal(processed);
    }

    return { messages: processed, estimatedTokens, wasCompacted };
  }

  /** 工具结果预算：大结果替换为截断版 */
  private applyToolResultBudget(messages: AgentMessage[]): AgentMessage[] {
    return messages.map((msg) => {
      if (msg.role === 'tool' && msg.content.length > this.config.toolResultBudgetChars) {
        return {
          ...msg,
          content: msg.content.slice(0, this.config.toolResultBudgetChars) + `\n\n[... truncated, original was ${msg.content.length} chars]`
        };
      }
      return msg;
    });
  }

  /** 自动压缩：将旧消息总结为摘要 */
  private async autoCompact(messages: AgentMessage[]): Promise<AgentMessage[]> {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const dialogMessages = messages.filter((m) => m.role !== 'system');

    // 保留最近 N 轮（确保近期上下文完整）
    const recentCount = Math.min(dialogMessages.length, 10);
    const oldMessages = dialogMessages.slice(0, -recentCount);
    const recentMessages = dialogMessages.slice(-recentCount);

    if (oldMessages.length === 0) return messages;

    const summary = await this.config.summarize!(oldMessages);
    const boundaryMessage: AgentMessage = {
      role: 'system',
      content: `[Previous conversation summary]\n${summary}`,
      metadata: { isCompactBoundary: true }
    };

    return [...systemMessages, boundaryMessage, ...recentMessages];
  }

  /** 硬性裁剪：从最旧的非 system 消息开始移除 */
  private hardTruncate(messages: AgentMessage[], budget: number): AgentMessage[] {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const dialogMessages = messages.filter((m) => m.role !== 'system');

    let totalTokens = systemMessages.reduce((sum, m) => sum + this.config.estimateTokens(m.content), 0);

    const kept: AgentMessage[] = [];
    // 从最新的开始保留
    for (let i = dialogMessages.length - 1; i >= 0; i--) {
      const tokens = this.config.estimateTokens(dialogMessages[i].content);
      if (totalTokens + tokens > budget) break;
      totalTokens += tokens;
      kept.unshift(dialogMessages[i]);
    }

    return [...systemMessages, ...kept];
  }

  private estimateTotal(messages: AgentMessage[]): number {
    return messages.reduce((sum, m) => sum + this.config.estimateTokens(m.content), 0);
  }
}
```

### 快速 Token 估算

```typescript
// packages/ai/agent/token-estimator.ts

/**
 * 快速 token 估算（无需 tiktoken 依赖）
 * 中文约 1 char ≈ 0.6-1 token，英文约 1 word ≈ 1.3 token
 * 这里用保守估算：中文 1 char ≈ 1 token，英文 4 chars ≈ 1 token
 */
export function estimateTokens(text: string): number {
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
  const cjkCount = (text.match(cjkPattern) || []).length;
  const nonCjkLength = text.length - cjkCount;
  return Math.ceil(cjkCount * 1.0 + nonCjkLength / 4);
}
```

---

## 4. 工具系统

### Claude Code 的工具定义（`src/Tool.ts`）

Claude Code 的工具定义非常严谨：

```typescript
// Claude Code 的 Tool 接口（简化）
interface Tool<Input extends z.ZodType = z.ZodType, Output = unknown> {
  name: string;
  description: string;
  inputSchema: Input; // Zod schema
  inputJSONSchema?: object; // MCP 用 JSON Schema

  call(args: z.infer<Input>, context: ToolUseContext, canUseTool: CanUseToolFn, parentMessage: Message, onProgress?: (p: ProgressMessage) => void): Promise<ToolResult<Output>>;

  validateInput?(input: z.infer<Input>, context: ToolUseContext): ValidationResult;
  isConcurrencySafe(input: z.infer<Input>): boolean; // 是否可并行
  isReadOnly: boolean; // 是否只读
  isDestructive?: boolean; // 是否破坏性

  mapToolResultToToolResultBlockParam(result: ToolResult<Output>): ToolResultBlockParam;
  renderToolUseMessage(input: z.infer<Input>): string; // UI 展示
  maxResultSizeChars?: number; // 结果大小限制
}

interface ToolResult<T = unknown> {
  data: T;
  newMessages?: Message[];
  contextModifier?: (ctx: ToolUseContext) => ToolUseContext;
}
```

### Chobits 当前的工具定义

当前工具通过 Pi runtime 注册，格式与 `@mariozechner/pi-coding-agent` 的 `ToolDefinition` 绑定：

```typescript
// packages/ai/runtime/pi/tools/index.ts
export const PI_CUSTOM_TOOL_FACTORIES: Record<string, ToolFactory> = {
  'query-resources': createResourceQueryTool,
  'push-card': createPushCardTool
  // ...
};
```

### 推荐方案：自研工具定义体系

```typescript
// packages/ai/agent/tool-types.ts

import { z } from 'zod';

/** 工具执行上下文 */
export interface ToolContext {
  workspaceId?: string;
  workspaceRoot?: string;
  abortSignal: AbortSignal;
  messages: AgentMessage[];
  onProgress?: (progress: ToolProgress) => void;
}

/** 工具进度事件 */
export interface ToolProgress {
  toolCallId: string;
  message: string;
  percentage?: number;
}

/** 工具执行结果 */
export interface ToolResult<T = unknown> {
  data: T;
  /** 可选：需要追加到消息列表的额外消息 */
  newMessages?: AgentMessage[];
  /** 是否为错误结果 */
  isError?: boolean;
}

/** 工具定义 */
export interface ToolDefinition<TInput extends z.ZodType = z.ZodType, TOutput = unknown> {
  /** 工具唯一标识 */
  name: string;
  /** 工具描述（给 AI 看） */
  description: string;
  /** 输入参数的 Zod schema */
  inputSchema: TInput;
  /** 分类标签 */
  category?: string;

  /** 执行工具 */
  call(args: z.infer<TInput>, context: ToolContext): Promise<ToolResult<TOutput>>;

  /** 额外输入校验（Zod schema 之外的业务规则） */
  validateInput?(input: z.infer<TInput>, context: ToolContext): { valid: boolean; message?: string };

  /** 是否可与其他工具并行执行 */
  isConcurrencySafe?(input: z.infer<TInput>): boolean;

  /** 是否只读（不修改状态） */
  isReadOnly?: boolean;

  /** 结果最大字符数 */
  maxResultChars?: number;

  /** 将结果格式化为发送给模型的文本 */
  formatResult?(result: ToolResult<TOutput>): string;

  /** 将调用格式化为 UI 展示文本 */
  formatCall?(input: z.infer<TInput>): string;
}

/** 工具注册表 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** 转为 OpenAI function calling 格式 */
  toOpenAITools(): Array<{
    type: 'function';
    function: { name: string; description: string; parameters: object };
  }> {
    return this.getAll().map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: zodToJsonSchema(tool.inputSchema)
      }
    }));
  }

  /** 转为 Anthropic tool 格式 */
  toAnthropicTools(): Array<{
    name: string;
    description: string;
    input_schema: object;
  }> {
    return this.getAll().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.inputSchema)
    }));
  }
}
```

### 工具定义示例

```typescript
// packages/ai/agent/tools/resource-query.ts

import { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from '../tool-types';

const inputSchema = z.object({
  query: z.string().describe('搜索关键词'),
  type: z.enum(['video', 'audio', 'document', 'image', 'all']).optional().describe('资源类型过滤'),
  limit: z.number().min(1).max(50).default(10).describe('返回数量')
});

export const resourceQueryTool: ToolDefinition<typeof inputSchema> = {
  name: 'query-resources',
  description: '搜索和查询工作区中的资源文件（视频、音频、文档、图片等）',
  inputSchema,
  category: 'resource',
  isReadOnly: true,

  isConcurrencySafe: () => true,

  async call(args, context): Promise<ToolResult> {
    // 实际实现调用 ResourcesRepo
    const results = await queryResources(args, context.workspaceId);
    return { data: results };
  },

  formatResult(result) {
    const items = result.data as any[];
    if (!items.length) return '未找到匹配的资源。';
    return items.map((r) => `- ${r.title} (${r.type})`).join('\n');
  },

  formatCall(input) {
    return `搜索资源: "${input.query}"${input.type ? ` (类型: ${input.type})` : ''}`;
  }
};
```

---

## 5. 工具编排与并发

### Claude Code 的 partitionToolCalls 模式

Claude Code 把工具调用分为批次：

```
[read_file, read_file, write_file, read_file, read_file]
     ↓
Batch 1: [read_file, read_file]   ← 并行（都是 concurrencySafe）
Batch 2: [write_file]              ← 串行（非 concurrencySafe）
Batch 3: [read_file, read_file]   ← 并行
```

### 推荐方案：工具编排器

```typescript
// packages/ai/agent/tool-orchestrator.ts

interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

interface Batch {
  calls: ToolCall[];
  concurrent: boolean;
}

export class ToolOrchestrator {
  private registry: ToolRegistry;
  private maxConcurrency: number;

  constructor(registry: ToolRegistry, maxConcurrency = 5) {
    this.registry = registry;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * 将工具调用列表分区为批次
   * 连续的 concurrencySafe 工具合成一批并行，否则单独串行
   */
  partition(calls: ToolCall[]): Batch[] {
    const batches: Batch[] = [];

    for (const call of calls) {
      const tool = this.registry.get(call.name);
      const isSafe = this.checkConcurrencySafe(tool, call);

      const lastBatch = batches[batches.length - 1];
      if (lastBatch?.concurrent && isSafe) {
        lastBatch.calls.push(call);
      } else {
        batches.push({
          calls: [call],
          concurrent: isSafe
        });
      }
    }

    return batches;
  }

  /**
   * 执行所有批次，按批次顺序串行，批次内可并行
   */
  async *execute(calls: ToolCall[], context: ToolContext): AsyncGenerator<ToolCallResult> {
    const batches = this.partition(calls);

    for (const batch of batches) {
      if (context.abortSignal.aborted) break;

      if (batch.concurrent && batch.calls.length > 1) {
        yield* this.executeConcurrently(batch.calls, context);
      } else {
        for (const call of batch.calls) {
          if (context.abortSignal.aborted) break;
          yield await this.executeSingle(call, context);
        }
      }
    }
  }

  private async *executeConcurrently(calls: ToolCall[], context: ToolContext): AsyncGenerator<ToolCallResult> {
    const promises = calls.map((call) => this.executeSingle(call, context));

    // 用 Promise.allSettled 确保全部完成
    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'fulfilled') {
        yield result.value;
      } else {
        yield {
          callId: 'unknown',
          toolName: 'unknown',
          result: { data: null, isError: true },
          error: result.reason
        };
      }
    }
  }

  private async executeSingle(call: ToolCall, context: ToolContext): Promise<ToolCallResult> {
    const tool = this.registry.get(call.name);
    if (!tool) {
      return {
        callId: call.id,
        toolName: call.name,
        result: { data: `Unknown tool: ${call.name}`, isError: true }
      };
    }

    try {
      // 1. Zod 校验
      const parsed = tool.inputSchema.safeParse(call.args);
      if (!parsed.success) {
        return {
          callId: call.id,
          toolName: call.name,
          result: {
            data: `Input validation error: ${parsed.error.message}`,
            isError: true
          }
        };
      }

      // 2. 业务校验
      if (tool.validateInput) {
        const validation = tool.validateInput(parsed.data, context);
        if (!validation.valid) {
          return {
            callId: call.id,
            toolName: call.name,
            result: {
              data: validation.message || 'Input validation failed',
              isError: true
            }
          };
        }
      }

      // 3. 执行
      const result = await tool.call(parsed.data, context);

      // 4. 结果大小限制
      if (tool.maxResultChars) {
        const formatted = tool.formatResult ? tool.formatResult(result) : JSON.stringify(result.data);
        if (formatted.length > tool.maxResultChars) {
          result.data = formatted.slice(0, tool.maxResultChars) + `\n[truncated, original ${formatted.length} chars]`;
        }
      }

      return { callId: call.id, toolName: call.name, result };
    } catch (error) {
      return {
        callId: call.id,
        toolName: call.name,
        result: {
          data: `Tool execution error: ${(error as Error).message}`,
          isError: true
        },
        error: error as Error
      };
    }
  }

  private checkConcurrencySafe(tool: ToolDefinition | undefined, call: ToolCall): boolean {
    if (!tool) return false;
    if (!tool.isConcurrencySafe) return tool.isReadOnly ?? false;
    try {
      const parsed = tool.inputSchema.safeParse(call.args);
      return parsed.success ? tool.isConcurrencySafe(parsed.data) : false;
    } catch {
      return false;
    }
  }
}
```

---

## 6. 流式工具执行

### Claude Code 的 StreamingToolExecutor

Claude Code 在模型流式输出过程中，一旦收到完整的 `tool_use` 块就立即开始执行工具，无需等待模型输出完毕。这样可以将工具执行时间与模型生成时间重叠。

```
模型流式输出:  [text...][tool_use_1][text...][tool_use_2][end_turn]
工具执行:              |--tool_1--|        |--tool_2--|
                       ↑ 收到就开始执行
```

### 推荐方案：StreamingToolExecutor

```typescript
// packages/ai/agent/streaming-tool-executor.ts

export class StreamingToolExecutor {
  private registry: ToolRegistry;
  private context: ToolContext;
  private pending = new Map<string, Promise<ToolCallResult>>();
  private completed: ToolCallResult[] = [];
  private maxConcurrency: number;

  constructor(registry: ToolRegistry, context: ToolContext, maxConcurrency = 5) {
    this.registry = registry;
    this.context = context;
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * 在流式过程中添加一个工具调用
   * 如果工具是 concurrencySafe 且有空间，立即开始执行
   */
  addToolCall(call: ToolCall): void {
    const tool = this.registry.get(call.name);
    const isSafe = this.checkSafe(tool, call);

    if (isSafe && this.pending.size < this.maxConcurrency) {
      this.startExecution(call);
    } else {
      // 非并发安全或已满，排队等待
      this.pending.set(call.id, this.executeLater(call));
    }
  }

  /** 获取已完成的结果（不阻塞） */
  getCompletedResults(): ToolCallResult[] {
    const results = [...this.completed];
    this.completed = [];
    return results;
  }

  /** 等待所有剩余结果 */
  async *getRemainingResults(): AsyncGenerator<ToolCallResult> {
    for (const [id, promise] of this.pending) {
      const result = await promise;
      this.pending.delete(id);
      yield result;
    }
    for (const result of this.completed) {
      yield result;
    }
    this.completed = [];
  }

  private startExecution(call: ToolCall): void {
    const promise = this.executeSingle(call).then((result) => {
      this.pending.delete(call.id);
      this.completed.push(result);
      return result;
    });
    this.pending.set(call.id, promise);
  }

  // ... executeSingle 逻辑同 ToolOrchestrator
}
```

---

## 7. 重试与韧性

### Claude Code 的 withRetry（`src/services/api/withRetry.ts`）

Claude Code 的重试策略非常精细：

- **指数退避**：`BASE_DELAY * 2^(attempt-1)`，封顶 32s，加 25% jitter
- **Retry-After**：优先使用服务端返回的 `Retry-After` 头
- **429 限流**：区分前台/后台请求，后台可能直接放弃
- **529 过载**：计数达上限触发 FallbackTriggeredError → 换模型
- **401 认证**：自动刷新 token / 清缓存
- **模型 Fallback**：主模型失败 → 自动切到备选模型
- **心跳**：长等待时定期 yield 系统消息，避免 UI 认为断开

### Chobits 当前问题

当前无任何重试逻辑。Provider adapter 的 `chat()` 失败后直接返回错误。

### 推荐方案：通用重试服务

```typescript
// packages/ai/agent/retry.ts

export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 基础延迟（ms） */
  baseDelayMs: number;
  /** 最大延迟（ms） */
  maxDelayMs: number;
  /** 抖动比例（0-1） */
  jitterRatio: number;
  /** 可选的备选模型 */
  fallbackModel?: ModelConfig;
  /** 是否重试的判断函数 */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** 重试时的回调（用于通知 UI） */
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 32000,
  jitterRatio: 0.25
};

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly lastError: Error,
    public readonly attempts: number
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export class FallbackTriggeredError extends Error {
  constructor(
    public readonly originalError: Error,
    public readonly fallbackModel: ModelConfig
  ) {
    super(`Fallback triggered: ${originalError.message}`);
    this.name = 'FallbackTriggeredError';
  }
}

/**
 * 通用重试包装器
 *
 * 参考 Claude Code 的 withRetry 设计：
 * - 指数退避 + jitter
 * - 尊重 Retry-After
 * - 区分可重试/不可重试错误
 * - 支持模型 Fallback
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, config: Partial<RetryConfig> = {}): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let consecutiveOverloaded = 0;

  for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error as Error;

      // 是否可以重试？
      const canRetry = attempt <= cfg.maxRetries && (cfg.shouldRetry ? cfg.shouldRetry(lastError, attempt) : isRetryable(lastError));

      if (!canRetry) {
        // 检查是否应该 Fallback
        if (cfg.fallbackModel && isOverloadedError(lastError)) {
          consecutiveOverloaded++;
          if (consecutiveOverloaded >= 2) {
            throw new FallbackTriggeredError(lastError, cfg.fallbackModel);
          }
        }
        break;
      }

      // 计算延迟
      const retryAfterMs = extractRetryAfter(lastError);
      const exponentialDelay = Math.min(cfg.baseDelayMs * Math.pow(2, attempt - 1), cfg.maxDelayMs);
      const baseDelay = retryAfterMs ?? exponentialDelay;
      const jitter = baseDelay * cfg.jitterRatio * Math.random();
      const delayMs = Math.round(baseDelay + jitter);

      cfg.onRetry?.(attempt, delayMs, lastError);
      await sleep(delayMs);

      // 过载计数
      if (isOverloadedError(lastError)) {
        consecutiveOverloaded++;
      } else {
        consecutiveOverloaded = 0;
      }
    }
  }

  throw new RetryError(`All ${cfg.maxRetries + 1} attempts failed`, lastError!, cfg.maxRetries + 1);
}

/** 判断错误是否可重试 */
function isRetryable(error: Error): boolean {
  const status = (error as any).status;
  if (status) {
    // 429 限流、5xx 服务端错误、408 超时
    if ([429, 408, 409, 500, 502, 503, 529].includes(status)) return true;
  }
  // 网络错误
  const code = (error as any).code;
  if (['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND'].includes(code)) return true;
  // 消息中包含 overloaded
  if (error.message?.toLowerCase().includes('overloaded')) return true;
  return false;
}

function isOverloadedError(error: Error): boolean {
  const status = (error as any).status;
  return status === 529 || status === 503 || error.message?.toLowerCase().includes('overloaded');
}

function extractRetryAfter(error: Error): number | null {
  const headers = (error as any).headers;
  const retryAfter = headers?.get?.('retry-after') ?? headers?.['retry-after'];
  if (retryAfter) {
    const seconds = parseFloat(retryAfter);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

---

## 8. 成本与 Token 追踪

### Claude Code 的实现（`src/cost-tracker.ts`）

- **按模型聚合**：每个模型单独统计 input/output/cache tokens
- **会话级持久化**：`saveCurrentSessionCosts` 把总价和分模型数据写入项目配置
- **实时更新**：流式过程中每个 usage delta 都即时累加
- **展示**：包含总费用、API 耗时、增删行数、分模型明细

### Chobits 当前状态

`ChatResponse.usage` 有 `inputTokens`、`outputTokens`、`cost` 字段，但未在任何地方聚合或持久化。

### 推荐方案：CostTracker

```typescript
// packages/ai/agent/cost-tracker.ts

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ModelUsageEntry {
  model: string;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  requestCount: number;
  costUSD: number;
}

export interface SessionCostSummary {
  sessionId: string;
  startedAt: number;
  totalCostUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  durationMs: number;
  modelUsage: Record<string, ModelUsageEntry>;
}

/** 每百万 token 的价格（USD） */
type PricingTable = Record<
  string,
  {
    inputPerMillion: number;
    outputPerMillion: number;
    cacheReadPerMillion?: number;
    cacheWritePerMillion?: number;
  }
>;

const DEFAULT_PRICING: PricingTable = {
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'claude-sonnet-4-20250514': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'deepseek-chat': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'qwen-plus': { inputPerMillion: 0.8, outputPerMillion: 2 }
};

export class CostTracker {
  private sessionId: string;
  private startedAt: number;
  private modelUsage = new Map<string, ModelUsageEntry>();
  private pricing: PricingTable;
  private onChange?: (summary: SessionCostSummary) => void;

  constructor(options?: { sessionId?: string; pricing?: PricingTable; onChange?: (summary: SessionCostSummary) => void }) {
    this.sessionId = options?.sessionId || crypto.randomUUID();
    this.startedAt = Date.now();
    this.pricing = { ...DEFAULT_PRICING, ...options?.pricing };
    this.onChange = options?.onChange;
  }

  /** 记录一次 API 调用的 token 使用 */
  addUsage(model: string, providerId: string, usage: TokenUsage): void {
    const key = `${providerId}:${model}`;
    const existing = this.modelUsage.get(key) ?? {
      model,
      providerId,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      requestCount: 0,
      costUSD: 0
    };

    existing.inputTokens += usage.inputTokens;
    existing.outputTokens += usage.outputTokens;
    existing.cacheReadTokens += usage.cacheReadTokens ?? 0;
    existing.cacheWriteTokens += usage.cacheWriteTokens ?? 0;
    existing.requestCount += 1;
    existing.costUSD = this.calculateCost(model, existing);

    this.modelUsage.set(key, existing);
    this.onChange?.(this.getSummary());
  }

  /** 获取当前会话的费用摘要 */
  getSummary(): SessionCostSummary {
    const modelUsage = Object.fromEntries(this.modelUsage);
    let totalCostUSD = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalRequests = 0;

    for (const entry of this.modelUsage.values()) {
      totalCostUSD += entry.costUSD;
      totalInputTokens += entry.inputTokens;
      totalOutputTokens += entry.outputTokens;
      totalRequests += entry.requestCount;
    }

    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      totalCostUSD,
      totalInputTokens,
      totalOutputTokens,
      totalRequests,
      durationMs: Date.now() - this.startedAt,
      modelUsage
    };
  }

  /** 重置追踪 */
  reset(): void {
    this.modelUsage.clear();
    this.startedAt = Date.now();
  }

  private calculateCost(model: string, entry: ModelUsageEntry): number {
    const price = this.findPricing(model);
    if (!price) return 0;

    return (
      (entry.inputTokens / 1_000_000) * price.inputPerMillion +
      (entry.outputTokens / 1_000_000) * price.outputPerMillion +
      (entry.cacheReadTokens / 1_000_000) * (price.cacheReadPerMillion ?? 0) +
      (entry.cacheWriteTokens / 1_000_000) * (price.cacheWritePerMillion ?? 0)
    );
  }

  private findPricing(model: string) {
    // 精确匹配
    if (this.pricing[model]) return this.pricing[model];
    // 前缀匹配
    for (const [key, value] of Object.entries(this.pricing)) {
      if (model.startsWith(key)) return value;
    }
    return null;
  }
}
```

### 集成到 ChatService

```typescript
// 在 chat-service.ts 的 chatStream 中集成

// 监听 Pi 流式事件中的 usage 信息
if (event.type === 'message_completed' && event.data?.usage) {
  this.costTracker.addUsage(resolvedModel, resolvedProvider, event.data.usage);
}

// 通过 IPC 暴露给 UI
ipcMain.handle('ai:getSessionCosts', () => this.costTracker.getSummary());
ipcMain.handle('ai:getConversationCosts', (_, { conversationId }) => this.getConversationCosts(conversationId));
```

---

## 9. 权限与 Hook 系统

### Claude Code 的设计

Claude Code 在工具执行前后有完整的 Hook 链：

```
PreToolUseHook → 权限检查(canUseTool) → tool.call() → PostToolUseHook
                                                      → PostToolUseFailureHook (on error)
```

Hook 可以：

- **阻止**工具执行
- **修改**工具输入
- **追加**上下文消息
- **阻止后续**工具调用（`preventContinuation`）
- 在工具**失败后**追加修复提示

### 推荐方案：轻量 Hook 系统

```typescript
// packages/ai/agent/hooks.ts

export interface ToolHookContext {
  toolName: string;
  toolArgs: unknown;
  messages: AgentMessage[];
  abortSignal: AbortSignal;
}

export type PreToolHookResult = {
  /** 'allow' | 'deny' | 'modify' */
  action: 'allow' | 'deny' | 'modify';
  /** deny 时的原因 */
  reason?: string;
  /** modify 时的新参数 */
  modifiedArgs?: unknown;
  /** 额外追加的消息 */
  appendMessages?: AgentMessage[];
};

export type PostToolHookResult = {
  /** 是否阻止后续工具调用 */
  preventContinuation?: boolean;
  /** 额外追加的消息 */
  appendMessages?: AgentMessage[];
};

export type PreToolHook = (ctx: ToolHookContext) => Promise<PreToolHookResult>;
export type PostToolHook = (ctx: ToolHookContext & { result: ToolResult }) => Promise<PostToolHookResult>;
export type PostToolFailureHook = (ctx: ToolHookContext & { error: Error }) => Promise<{ appendMessages?: AgentMessage[] }>;

export class HookManager {
  private preHooks: PreToolHook[] = [];
  private postHooks: PostToolHook[] = [];
  private failureHooks: PostToolFailureHook[] = [];

  addPreHook(hook: PreToolHook): () => void {
    this.preHooks.push(hook);
    return () => {
      this.preHooks = this.preHooks.filter((h) => h !== hook);
    };
  }

  addPostHook(hook: PostToolHook): () => void {
    this.postHooks.push(hook);
    return () => {
      this.postHooks = this.postHooks.filter((h) => h !== hook);
    };
  }

  addFailureHook(hook: PostToolFailureHook): () => void {
    this.failureHooks.push(hook);
    return () => {
      this.failureHooks = this.failureHooks.filter((h) => h !== hook);
    };
  }

  async runPreHooks(ctx: ToolHookContext): Promise<PreToolHookResult> {
    let currentArgs = ctx.toolArgs;
    const allMessages: AgentMessage[] = [];

    for (const hook of this.preHooks) {
      const result = await hook({ ...ctx, toolArgs: currentArgs });
      if (result.action === 'deny') {
        return result;
      }
      if (result.action === 'modify' && result.modifiedArgs) {
        currentArgs = result.modifiedArgs;
      }
      if (result.appendMessages) {
        allMessages.push(...result.appendMessages);
      }
    }

    return {
      action: 'allow',
      modifiedArgs: currentArgs,
      appendMessages: allMessages.length ? allMessages : undefined
    };
  }

  async runPostHooks(ctx: ToolHookContext & { result: ToolResult }): Promise<PostToolHookResult> {
    let preventContinuation = false;
    const allMessages: AgentMessage[] = [];

    for (const hook of this.postHooks) {
      const result = await hook(ctx);
      if (result.preventContinuation) preventContinuation = true;
      if (result.appendMessages) allMessages.push(...result.appendMessages);
    }

    return {
      preventContinuation,
      appendMessages: allMessages.length ? allMessages : undefined
    };
  }

  async runFailureHooks(ctx: ToolHookContext & { error: Error }): Promise<{ appendMessages?: AgentMessage[] }> {
    const allMessages: AgentMessage[] = [];
    for (const hook of this.failureHooks) {
      const result = await hook(ctx);
      if (result.appendMessages) allMessages.push(...result.appendMessages);
    }
    return { appendMessages: allMessages.length ? allMessages : undefined };
  }
}
```

### 内置 Hook 示例

```typescript
// 文件安全 Hook：防止 AI 操作敏感路径
const fileSecurityHook: PreToolHook = async (ctx) => {
  if (!['file-write', 'file-edit', 'shell-exec'].includes(ctx.toolName)) {
    return { action: 'allow' };
  }

  const dangerousPaths = ['.env', 'credentials', 'secrets', 'private_key'];
  const args = ctx.toolArgs as any;
  const targetPath = args.path || args.command || '';

  for (const dangerous of dangerousPaths) {
    if (targetPath.toLowerCase().includes(dangerous)) {
      return {
        action: 'deny',
        reason: `Security: operation on sensitive path "${dangerous}" is blocked`
      };
    }
  }

  return { action: 'allow' };
};

// 费用限制 Hook：超预算时阻止继续
const costLimitHook =
  (costTracker: CostTracker, maxUSD: number): PreToolHook =>
  async () => {
    const summary = costTracker.getSummary();
    if (summary.totalCostUSD > maxUSD) {
      return {
        action: 'deny',
        reason: `Cost limit exceeded: $${summary.totalCostUSD.toFixed(4)} > $${maxUSD}`
      };
    }
    return { action: 'allow' };
  };
```

---

## 10. 依赖注入与可测试性

### Claude Code 的 QueryDeps 模式

```typescript
// Claude Code: src/query/deps.ts
export type QueryDeps = {
  callModel: typeof queryModelWithStreaming;
  microcompact: typeof microcompactMessages;
  autocompact: typeof autoCompactIfNeeded;
  uuid: () => string;
};

export function productionDeps(): QueryDeps {
  return {
    callModel: queryModelWithStreaming,
    microcompact: microcompactMessages,
    autocompact: autoCompactIfNeeded,
    uuid: randomUUID
  };
}
```

这使得测试时可以注入 mock 实现，无需真正调用 AI API。

### 推荐方案：Agent 依赖注入

```typescript
// packages/ai/agent/deps.ts

export interface AgentDeps {
  /** 调用模型（流式） */
  callModel: (messages: AgentMessage[], tools: ToolDefinition[], config: ModelConfig, signal: AbortSignal) => AsyncGenerator<ModelEvent>;

  /** 估算 token 数 */
  estimateTokens: (text: string) => number;

  /** 执行上下文摘要（用于 autocompact） */
  summarize: (messages: AgentMessage[]) => Promise<string>;

  /** 生成 UUID */
  uuid: () => string;
}

/** 生产环境依赖 */
export function createProductionDeps(providerId: string, apiKey: string): AgentDeps {
  return {
    callModel: createProviderCallModel(providerId, apiKey),
    estimateTokens,
    summarize: createProviderSummarize(providerId, apiKey),
    uuid: () => crypto.randomUUID()
  };
}

/** 测试用 mock 依赖 */
export function createMockDeps(responses: string[] = ['Mock response']): AgentDeps {
  let callIndex = 0;
  return {
    callModel: async function* () {
      const text = responses[callIndex++ % responses.length];
      yield { type: 'delta', text };
      yield { type: 'message_complete', text, usage: { inputTokens: 10, outputTokens: 5 } };
    },
    estimateTokens: (text) => Math.ceil(text.length / 4),
    summarize: async (msgs) => `Summary of ${msgs.length} messages`,
    uuid: () => `mock-${Date.now()}-${Math.random()}`
  };
}
```

---

## 11. 实施路线图

### Phase 1：基础设施补齐（不影响现有功能）

**目标**：在不改动现有 Pi runtime 的前提下，补齐横切关注点。

| 序号 | 任务                                                 | 预估工作量 | 文件                                   |
| ---- | ---------------------------------------------------- | ---------- | -------------------------------------- |
| 1.1  | 实现 `CostTracker` 并集成到 `ChatService`            | 1-2 天     | `packages/ai/agent/cost-tracker.ts`    |
| 1.2  | 实现 `withRetry` 并包装 Provider adapter 的 `chat()` | 1 天       | `packages/ai/agent/retry.ts`           |
| 1.3  | 实现 `ContextManager` 替换 `selectRecentMessages`    | 2-3 天     | `packages/ai/agent/context-manager.ts` |
| 1.4  | 实现快速 Token 估算                                  | 0.5 天     | `packages/ai/agent/token-estimator.ts` |
| 1.5  | 在 UI 中展示费用和 token 用量                        | 1-2 天     | `src/features/chat/`                   |
| 1.6  | 添加重试状态的流式事件类型                           | 0.5 天     | `packages/ai/types.ts`                 |

**验收标准**：

- 对话中实时显示 token 用量和费用估算
- Provider API 报错后自动重试，UI 显示重试状态
- 长对话不再丢失中间上下文（用摘要替代硬截断）

### Phase 2：自研工具体系（与 Pi 并行）

**目标**：建立自研工具定义、校验、编排能力，可与 Pi 工具共存。

| 序号 | 任务                                        | 预估工作量 | 文件                                           |
| ---- | ------------------------------------------- | ---------- | ---------------------------------------------- |
| 2.1  | 定义 `ToolDefinition` 类型 + `ToolRegistry` | 1 天       | `packages/ai/agent/tool-types.ts`              |
| 2.2  | 实现 `ToolOrchestrator`（分区 + 并发）      | 2 天       | `packages/ai/agent/tool-orchestrator.ts`       |
| 2.3  | 实现 `HookManager`                          | 1 天       | `packages/ai/agent/hooks.ts`                   |
| 2.4  | 迁移现有 Pi tools 为 `ToolDefinition` 格式  | 3-5 天     | `packages/ai/agent/tools/`                     |
| 2.5  | 实现 `StreamingToolExecutor`                | 2 天       | `packages/ai/agent/streaming-tool-executor.ts` |
| 2.6  | 实现 Pi ↔ ToolDefinition 桥接层            | 2 天       | `packages/ai/agent/pi-bridge.ts`               |

**验收标准**：

- 工具有 Zod schema 校验，非法输入不会到达 tool.call()
- 只读工具（如 query-resources）可自动并行
- Hook 可拦截危险操作

### Phase 3：自研 Agent 循环（可选，长期目标）

**目标**：实现不依赖 Pi 的完整 Agent 循环，Pi 成为可选后端之一。

| 序号 | 任务                                      | 预估工作量 | 文件                                    |
| ---- | ----------------------------------------- | ---------- | --------------------------------------- |
| 3.1  | 定义 `AgentLoop` 接口 + `AgentLoopState`  | 1 天       | `packages/ai/agent/types.ts`            |
| 3.2  | 实现 `AgentDeps` 依赖注入                 | 1 天       | `packages/ai/agent/deps.ts`             |
| 3.3  | 实现 `SimpleAgentLoop`（基础 while 循环） | 3-5 天     | `packages/ai/agent/simple-loop.ts`      |
| 3.4  | 实现 `PiAgentLoop`（包装 Pi Session）     | 2 天       | `packages/ai/agent/pi-loop.ts`          |
| 3.5  | 集成模型 Fallback                         | 1-2 天     | `packages/ai/agent/simple-loop.ts`      |
| 3.6  | 实现完整的上下文工程管线                  | 3-5 天     | `packages/ai/agent/context-pipeline.ts` |
| 3.7  | 编写测试（使用 mock deps）                | 2-3 天     | `test/agent/`                           |

**验收标准**：

- 可以在不安装 Pi 包的情况下运行完整的 Agent 对话
- Agent 循环自动管理上下文窗口
- 模型失败时自动 Fallback 到备选模型
- 工具执行有完整的校验 → Hook → 执行 → 结果处理链

---

## 附录 A：Claude Code 关键文件索引

| 文件                                      | 作用         | 值得参考的模式                                 |
| ----------------------------------------- | ------------ | ---------------------------------------------- |
| `src/query.ts`                            | Agent 主循环 | while(true) + State 状态机、needsFollowUp 判断 |
| `src/QueryEngine.ts`                      | 会话引擎     | submitMessage 生命周期、消息持久化时机         |
| `src/Tool.ts`                             | 工具类型定义 | Zod schema、isConcurrencySafe、ToolResult      |
| `src/tools.ts`                            | 工具注册     | getAllBaseTools、feature 开关裁剪              |
| `src/services/tools/toolOrchestration.ts` | 工具编排     | partitionToolCalls、并发限制                   |
| `src/services/tools/toolExecution.ts`     | 工具执行     | 完整的校验 → 权限 → 执行 → Hook 链             |
| `src/services/api/claude.ts`              | API 调用     | 流式处理、usage 累加、多模态限制               |
| `src/services/api/withRetry.ts`           | 重试策略     | 指数退避、529 计数、Fallback 触发              |
| `src/cost-tracker.ts`                     | 费用追踪     | 按模型聚合、会话级持久化                       |
| `src/utils/hooks.ts`                      | Hook 系统    | Pre/Post 工具 Hook、Stop Hook                  |
| `src/query/deps.ts`                       | 依赖注入     | QueryDeps、productionDeps                      |

## 附录 B：推荐的目录结构

```
packages/ai/
├── agent/                          ← 新增：自研 Agent 能力层
│   ├── types.ts                    # AgentLoop 接口、AgentEvent、AgentMessage
│   ├── deps.ts                     # AgentDeps 依赖注入
│   ├── context-manager.ts          # 分层上下文管理
│   ├── token-estimator.ts          # Token 估算
│   ├── cost-tracker.ts             # 费用追踪
│   ├── retry.ts                    # 重试与韧性
│   ├── tool-types.ts               # ToolDefinition、ToolRegistry
│   ├── tool-orchestrator.ts        # 工具编排（分区 + 并发）
│   ├── streaming-tool-executor.ts  # 流式工具执行器
│   ├── hooks.ts                    # Hook 管理器
│   ├── simple-loop.ts              # 自研 Agent 循环（Phase 3）
│   ├── pi-loop.ts                  # Pi 包装的 Agent 循环
│   ├── pi-bridge.ts                # Pi ↔ ToolDefinition 桥接
│   └── tools/                      # 自研格式的工具定义
│       ├── resource-query.ts
│       ├── push-card.ts
│       ├── web-search.ts
│       └── ...
├── runtime/pi/                     ← 现有：Pi runtime（保持不变）
├── providers/                      ← 现有：Provider 系统（保持不变）
├── chat-service.ts                 ← 现有：对话服务（逐步集成新能力）
├── types.ts                        ← 现有：类型定义（扩展新事件类型）
└── ...
```

## 附录 C：StreamEvent 扩展建议

在 `types.ts` 的 `StreamEvent` 中新增以下事件类型，以支持新功能：

```typescript
// 新增事件类型
| { type: 'retry'; data: { attempt: number; delayMs: number; error: string } }
| { type: 'cost_update'; data: SessionCostSummary }
| { type: 'context_compacted'; data: { originalTokens: number; compactedTokens: number } }
| { type: 'tool_progress'; data: ToolProgress }
| { type: 'model_fallback'; data: { from: string; to: string; reason: string } }
| { type: 'turn_start'; data: { turn: number } }
| { type: 'turn_end'; data: { turn: number; reason: string } }
```

---

> **使用本文档**：本文档是优化参考方案，不是必须一次性实施的。建议按 Phase 顺序逐步推进，每个 Phase 完成后评估效果再决定是否继续。Phase 1 的改动最小但收益最大，建议优先实施。
