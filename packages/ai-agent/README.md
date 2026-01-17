# AI Agent Core

> 一个轻量级、高度解耦的 AI Agent 运行时引擎

**版本**: 1.0.0  
**日期**: 2026-01-16  
**设计原则**: 依赖反转 | 单一职责 | 可测试性优先

---

## 目录

1. [核心概念](#1-核心概念)
2. [架构设计](#2-架构设计)
3. [核心接口](#3-核心接口)
4. [执行模型](#4-执行模型)
5. [工具系统](#5-工具系统)
6. [记忆系统](#6-记忆系统)
7. [错误处理](#7-错误处理)
8. [可观测性](#8-可观测性)
9. [技术选型](#9-技术选型)
10. [实施路线](#10-实施路线)

---

## 1. 核心概念

### 1.1 设计哲学

```
┌─────────────────────────────────────────────────────────┐
│  Agent = 决策引擎,不是执行器                      │
│  职责: 编排 LLM 调用、工具选择、状态管理              │
│  非职责: 具体业务逻辑、数据存储、API 调用            │
└─────────────────────────────────────────────────────────┘
```

**四大原则**:

1. **依赖反转**: Agent 不依赖具体实现,通过接口注入能力
2. **无状态核心**: Agent 本身无状态,状态外置于 Context
3. **可测试性**: 所有依赖可 Mock,支持单元测试
4. **事件驱动**: 通过事件流暴露执行过程,支持流式 UI

### 1.2 核心组件

```typescript
// Agent 只做三件事:
1. 接收用户输入
2. 调用 LLM 决策(工具选择)
3. 协调工具执行并返回结果

// 不做:
❌ 直接访问数据库
❌ 调用业务 API
❌ 管理文件系统
❌ 实现具体工具逻辑
```

---

## 2. 架构设计

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                    AI Agent Core                             │
│                  (独立 npm 包)                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌────────────────────────────────────────────────────┐   │
│   │             AgentRuntime                           │   │
│   │  ┌──────────────────────────────────────────────┐ │   │
│   │  │  1. 接收输入                                  │ │   │
│   │  │  2. 调用 LLM(工具选择)                        │ │   │
│   │  │  3. 执行工具                                  │ │   │
│   │  │  4. 循环直到完成                              │ │   │
│   │  │  5. 发射事件流                                │ │   │
│   │  └──────────────────────────────────────────────┘ │   │
│   └────────────────────────────────────────────────────┘   │
│                           │                                  │
│              依赖注入(构造函数)                              │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐                │
│         ▼                 ▼                 ▼                │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐         │
│   │   LLM    │      │  Tools   │      │  Memory  │         │
│   │ Provider │      │ Provider │      │ Provider │         │
│   └──────────┘      └──────────┘      └──────────┘         │
│         ▲                 ▲                 ▲                │
└─────────┼─────────────────┼─────────────────┼────────────────┘
          │                 │                 │
          │          外部实现(注入)            │
          │                 │                 │
    ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
    │ OpenAI    │    │ Workflow  │    │  SQLite   │
    │ Anthropic │    │ FileOps   │    │  Redis    │
    │ Gemini    │    │ Search    │    │  Memory   │
    └───────────┘    └───────────┘    └───────────┘
```

### 2.2 模块分层

```
packages/ai-agent/
├── src/
│   ├── runtime/              # 核心运行时
│   │   ├── agent-runtime.ts  # 主引擎
│   │   ├── execution-loop.ts # 工具调用循环
│   │   └── event-emitter.ts  # 事件发射器
│   │
│   ├── interfaces/           # 依赖接口(零实现)
│   │   ├── llm-provider.ts   # LLM 接口
│   │   ├── tool-provider.ts  # 工具接口
│   │   ├── memory-provider.ts# 记忆接口
│   │   └── logger-provider.ts# 日志接口
│   │
│   ├── types/                # 类型定义
│   │   ├── agent-types.ts
│   │   ├── tool-types.ts
│   │   └── event-types.ts
│   │
│   ├── errors/               # 错误处理
│   │   ├── agent-error.ts
│   │   └── recovery.ts
│   │
│   └── index.ts             # 公共 API
│
├── adapters/                # 可选适配器(独立)
│   ├── llm/
│   │   ├── vercel-ai-adapter.ts
│   │   └── langchain-adapter.ts
│   ├── memory/
│   │   ├── memory-store.ts
│   │   └── redis-adapter.ts
│   └── tools/
│       └── base-tool.ts
│
└── examples/                # 使用示例
    ├── basic-chat.ts
    └── with-tools.ts
```

### 2.3 依赖关系

```
ai-agent (核心)
  ├── 零外部依赖(除 TypeScript)
  └── 导出接口定义

ai-agent/adapters (可选)
  ├── 依赖: ai-agent
  └── 依赖: 具体实现库(如 ai、redis)

应用代码
  ├── 依赖: ai-agent
  ├── 依赖: ai-agent/adapters(可选)
  └── 实现自己的 Provider
```

---

## 3. 核心接口

### 3.1 AgentRuntime

```typescript
/**
 * Agent 运行时 - 核心接口
 */
export interface AgentRuntime {
  /**
   * 执行 Agent 任务
   * @param input - 用户输入
   * @param context - 运行上下文
   * @returns 异步迭代器,发射执行事件
   */
  run(input: AgentInput, context: RuntimeContext): AsyncIterable<AgentEvent>;

  /**
   * 中止执行
   */
  abort(): void;
}
```

### 3.2 RuntimeContext

```typescript
/**
 * 运行时上下文 - 依赖注入容器
 */
export interface RuntimeContext {
  /** 会话 ID */
  sessionId: string;

  /** 用户 ID(可选) */
  userId?: string;

  /** LLM 提供者(必需) */
  llm: LLMProvider;

  /** 工具提供者(必需) */
  tools: ToolProvider;

  /** 记忆提供者(可选) */
  memory?: MemoryProvider;

  /** 日志提供者(可选) */
  logger?: LoggerProvider;

  /** 配置选项 */
  options?: RuntimeOptions;
}

export interface RuntimeOptions {
  /** 最大工具调用轮次 */
  maxIterations?: number;

  /** 超时时间(毫秒) */
  timeout?: number;

  /** 是否启用记忆 */
  enableMemory?: boolean;

  /** 历史消息最大条数(不含系统消息) */
  maxHistoryMessages?: number;
}
```

### 3.3 LLMProvider

```typescript
/**
 * LLM 提供者接口
 */
export interface LLMProvider {
  /**
   * 流式生成
   */
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;

  /**
   * 非流式生成(可选)
   */
  generate?(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export type LLMChunk = { type: 'text'; text: string } | { type: 'tool_call'; call: ToolCall } | { type: 'done'; usage?: TokenUsage };
```

### 3.4 ToolProvider

```typescript
/**
 * 工具提供者接口
 */
export interface ToolProvider {
  /**
   * 列出所有可用工具
   */
  list(): ToolDefinition[];

  /**
   * 执行工具
   */
  execute(name: string, params: unknown): Promise<ToolResult>;

  /**
   * 验证工具参数(可选)
   */
  validate?(name: string, params: unknown): ValidationResult;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

### 3.5 MemoryProvider

```typescript
/**
 * 记忆提供者接口
 */
export interface MemoryProvider {
  /**
   * 获取记忆
   */
  get(key: string): Promise<unknown>;

  /**
   * 设置记忆
   */
  set(key: string, value: unknown, options?: MemoryOptions): Promise<void>;

  /**
   * 语义搜索(可选)
   */
  search?(query: string, limit?: number): Promise<MemoryItem[]>;

  /**
   * 清理会话(可选)
   */
  clear?(sessionId: string): Promise<void>;
}

export interface MemoryOptions {
  /** 是否持久化 */
  persist?: boolean;

  /** 过期时间(秒) */
  ttl?: number;
}
```

---

## 4. 执行模型

### 4.1 执行流程

```
用户输入 → AgentRuntime.run() → 执行循环 → 输出事件流
                                        ↓
                        ┌───────────────┴───────────────┐
                        │   Execution Loop              │
                        ├───────────────────────────────┤
                        │ 1. 检查记忆(可选)              │
                        │ 2. 调用 LLM 生成              │
                        │ 3. 处理 LLM 输出:              │
                        │    - 文本 → 发射 delta 事件   │
                        │    - 工具调用 → 执行工具      │
                        │ 4. 工具结果追加到上下文        │
                        │ 5. 继续循环(直到完成)          │
                        │ 6. 保存记忆(可选)              │
                        └───────────────────────────────┘
```

### 4.2 实现示例

```typescript
export class DefaultAgentRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;

  async *run(input: AgentInput, context: RuntimeContext): AsyncIterable<AgentEvent> {
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const messages: Message[] = [...input.messages];
    const maxIterations = context.options?.maxIterations ?? 10;
    let iteration = 0;

    try {
      // 1. 从记忆加载上下文(可选)
      if (context.memory) {
        const memoryContext = await context.memory.get(`session:${context.sessionId}`);
        if (memoryContext) {
          yield {
            type: 'metadata',
            data: { phase: 'memory_loaded', context: memoryContext }
          };
        }
      }

      // 2. 执行循环
      while (iteration < maxIterations && !signal.aborted) {
        yield {
          type: 'metadata',
          data: { phase: 'iteration_start', iteration }
        };

        let hasToolCall = false;

        // 3. 调用 LLM
        for await (const chunk of context.llm.stream({
          messages,
          tools: context.tools.list(),
          temperature: 0.7
        })) {
          if (signal.aborted) break;

          if (chunk.type === 'text') {
            yield { type: 'delta', text: chunk.text };
          } else if (chunk.type === 'tool_call') {
            hasToolCall = true;
            yield { type: 'tool_call', call: chunk.call };

            // 4. 执行工具
            const result = await context.tools.execute(chunk.call.name, chunk.call.params);

            yield { type: 'tool_result', result };

            // 5. 追加工具结果到消息历史
            messages.push({
              role: 'tool',
              content: JSON.stringify(result),
              toolCallId: chunk.call.id
            });
          } else if (chunk.type === 'done') {
            yield {
              type: 'metadata',
              data: { phase: 'llm_done', usage: chunk.usage }
            };
          }
        }

        // 6. 如果没有工具调用,说明任务完成
        if (!hasToolCall) {
          break;
        }

        iteration++;
      }

      // 7. 保存到记忆(可选)
      if (context.memory) {
        await context.memory.set(`session:${context.sessionId}`, { messages, timestamp: Date.now() }, { persist: false, ttl: 3600 });
      }

      yield { type: 'done', success: true };
    } catch (error) {
      yield {
        type: 'error',
        error: this.normalizeError(error)
      };
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  private normalizeError(error: unknown): AgentError {
    // 错误标准化逻辑
    return {
      category: 'execution',
      message: error instanceof Error ? error.message : String(error),
      recoverable: false
    };
  }
}
```

---

## 5. 工具系统

### 5.1 工具定义

```typescript
/**
 * 工具定义遵循 OpenAI Function Calling 标准
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
  };
}
```

### 5.2 ToolProvider 实现示例

```typescript
/**
 * 基于注册表的工具提供者
 */
export class RegistryToolProvider implements ToolProvider {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  async execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' not found`
      };
    }

    try {
      // 参数验证
      const validation = this.validate(name, params);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid parameters: ${validation.error}`
        };
      }

      // 执行
      const result = await tool.execute(params);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  validate(name: string, params: unknown): ValidationResult {
    const tool = this.tools.get(name);
    if (!tool) {
      return { valid: false, error: 'Tool not found' };
    }

    // 使用 JSON Schema 验证
    // 实际实现可以使用 ajv 等库
    return { valid: true };
  }
}

/**
 * 工具接口
 */
export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: unknown): Promise<unknown>;
}
```

### 5.3 工具示例

```typescript
/**
 * 示例: 获取当前时间工具
 */
export const GetTimeTool: Tool = {
  name: 'get_time',
  description: '获取当前时间和日期',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['iso', 'unix', 'readable'],
        description: '返回格式'
      }
    },
    required: []
  },
  async execute(params: any) {
    const now = new Date();
    const format = params?.format || 'iso';

    switch (format) {
      case 'iso':
        return { time: now.toISOString() };
      case 'unix':
        return { time: Math.floor(now.getTime() / 1000) };
      case 'readable':
        return { time: now.toLocaleString('zh-CN') };
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }
};
```

---

## 6. 记忆系统

### 6.1 两层记忆架构

```
┌──────────────────────────────────────────────────┐
│          Memory Provider                         │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │    会话记忆(Session Memory)               │  │
│  │  - 临时存储,会话结束自动清理               │  │
│  │  - 存储: 对话历史、临时变量               │  │
│  │  - TTL: 1-2 小时                          │  │
│  └──────────────────────────────────────────┘  │
│                     ▲                            │
│                     │ 提升                      │
│                     │                            │
│  ┌──────────────────────────────────────────┐  │
│  │   持久记忆(Persistent Memory)             │  │
│  │  - 跨会话存储                             │  │
│  │  - 存储: 用户偏好、学习结果               │  │
│  │  - TTL: 可配置(天/周/永久)                │  │
│  └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 6.2 实现示例

```typescript
/**
 * 简单的内存 + 持久化记忆提供者
 */
export class SimpleMemoryProvider implements MemoryProvider {
  private session = new Map<string, { value: unknown; expiry: number }>();
  private persistent: KVStore; // 抽象 KV 存储接口

  constructor(persistent: KVStore) {
    this.persistent = persistent;
  }

  async get(key: string): Promise<unknown> {
    // 1. 先查会话记忆
    const sessionValue = this.session.get(key);
    if (sessionValue && sessionValue.expiry > Date.now()) {
      return sessionValue.value;
    }

    // 2. 再查持久记忆
    const persistentValue = await this.persistent.get(key);
    if (persistentValue) {
      // 提升到会话记忆
      this.session.set(key, {
        value: persistentValue,
        expiry: Date.now() + 3600000 // 1 小时
      });
    }

    return persistentValue;
  }

  async set(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    const ttl = options?.ttl ?? 3600; // 默认 1 小时

    // 1. 写入会话记忆
    this.session.set(key, {
      value,
      expiry: Date.now() + ttl * 1000
    });

    // 2. 如果需要持久化
    if (options?.persist) {
      await this.persistent.set(key, value, ttl);
    }
  }

  async clear(sessionId: string): Promise<void> {
    // 清理会话记忆(仅删除该会话相关)
    for (const [key] of this.session) {
      if (key.startsWith(`session:${sessionId}`)) {
        this.session.delete(key);
      }
    }
  }

  // 定期清理过期记忆
  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.session) {
        if (value.expiry <= now) {
          this.session.delete(key);
        }
      }
    }, 60000); // 每分钟清理一次
  }
}

/**
 * KV 存储接口(需要外部实现)
 */
export interface KVStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

---

## 7. 错误处理

### 7.1 错误分类

```typescript
export enum ErrorCategory {
  /** LLM API 错误(网络、限额等) */
  LLM_ERROR = 'llm_error',

  /** 工具执行错误 */
  TOOL_ERROR = 'tool_error',

  /** 参数验证错误 */
  VALIDATION_ERROR = 'validation_error',

  /** 超时错误 */
  TIMEOUT_ERROR = 'timeout_error',

  /** 其他错误 */
  UNKNOWN_ERROR = 'unknown_error'
}

export interface AgentError {
  category: ErrorCategory;
  message: string;
  details?: unknown;
  recoverable: boolean;
  suggestion?: string;
}
```

### 7.2 错误恢复策略

```typescript
/**
 * 错误恢复策略矩阵
 */
export const RECOVERY_STRATEGIES: Record<ErrorCategory, RecoveryStrategy> = {
  [ErrorCategory.LLM_ERROR]: {
    retryable: true,
    maxRetries: 3,
    backoff: 'exponential', // 1s, 2s, 4s
    fallback: 'use_cache' // 使用缓存响应
  },

  [ErrorCategory.TOOL_ERROR]: {
    retryable: false, // 工具错误通常不可重试
    fallback: 'skip_tool', // 跳过该工具,继续执行
    notify: true // 通知用户
  },

  [ErrorCategory.VALIDATION_ERROR]: {
    retryable: false,
    fallback: 'ask_llm_to_fix', // 让 LLM 修正参数
    notify: true
  },

  [ErrorCategory.TIMEOUT_ERROR]: {
    retryable: true,
    maxRetries: 1,
    fallback: 'return_partial' // 返回部分结果
  },

  [ErrorCategory.UNKNOWN_ERROR]: {
    retryable: false,
    fallback: 'abort',
    notify: true
  }
};

export interface RecoveryStrategy {
  retryable: boolean;
  maxRetries?: number;
  backoff?: 'linear' | 'exponential';
  fallback?: string;
  notify?: boolean;
}
```

### 7.3 实现重试逻辑

```typescript
/**
 * 带重试的工具执行
 */
async function executeWithRetry(toolProvider: ToolProvider, name: string, params: unknown, strategy: RecoveryStrategy): Promise<ToolResult> {
  const maxRetries = strategy.maxRetries ?? 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await toolProvider.execute(name, params);
    } catch (error) {
      if (attempt === maxRetries - 1) {
        // 最后一次尝试失败
        return {
          success: false,
          error: `Failed after ${maxRetries} attempts: ${error}`
        };
      }

      // 计算退避时间
      const delay = strategy.backoff === 'exponential' ? Math.pow(2, attempt) * 1000 : 1000;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 不应该到达这里
  return { success: false, error: 'Unexpected error' };
}
```

---

## 8. 可观测性

### 8.1 事件流

```typescript
/**
 * Agent 事件类型
 */
export type AgentEvent =
  | { type: 'metadata'; data: Record<string, unknown> }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'tool_result'; result: ToolResult; callId?: string }
  | { type: 'error'; error: AgentError }
  | { type: 'done'; success: boolean };
```

### 8.2 LoggerProvider

```typescript
/**
 * 日志提供者接口
 */
export interface LoggerProvider {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * 简单的控制台日志实现
 */
export class ConsoleLogger implements LoggerProvider {
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`[DEBUG] ${message}`, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[INFO] ${message}`, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}`, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}`, meta);
  }
}
```

---

## 9. 技术选型

### 9.1 核心依赖

| 依赖       | 版本 | 用途       | 是否必需 |
| ---------- | ---- | ---------- | -------- |
| TypeScript | ^5.0 | 类型系统   | ✅ 是    |
| -          | -    | 无其他依赖 | -        |

### 9.2 可选适配器依赖

| 适配器        | 依赖             | 用途       |
| ------------- | ---------------- | ---------- |
| Vercel AI SDK | `ai`, `zod`      | LLM 适配器 |
| LangChain     | `langchain`      | LLM 适配器 |
| SQLite        | `better-sqlite3` | 持久化记忆 |
| Redis         | `ioredis`        | 分布式记忆 |

---

## 10. 实施路线

### Phase 1: 核心框架 (Week 1)

- [ ] 定义所有接口 (`interfaces/`)
- [ ] 实现 `AgentRuntime`
- [ ] 实现事件发射器
- [ ] 编写单元测试 (覆盖率 > 90%)

### Phase 2: 适配器实现 (Week 2)

- [ ] 实现 Vercel AI SDK 适配器
- [ ] 实现基础 ToolProvider
- [ ] 实现 SimpleMemoryProvider
- [ ] 编写集成测试

### Phase 3: 错误处理 (Week 3)

- [ ] 实现错误分类
- [ ] 实现重试逻辑
- [ ] 实现降级策略
- [ ] 编写错误场景测试

### Phase 4: 文档与示例 (Week 4)

- [ ] API 文档
- [ ] 使用示例
- [ ] 最佳实践指南
- [ ] 发布 1.0.0 版本

---

## 附录

### A. 与现有系统集成

```typescript
/**
 * 集成示例: 在 Electron 应用中使用
 */
import { DefaultAgentRuntime } from '@packages/ai-agent';
import { VercelAIAdapter } from '@packages/ai-agent/adapters/llm';
import { WorkflowToolProvider } from './tools/workflow-tool-provider';
import { SQLiteMemoryProvider } from './memory/sqlite-memory-provider';

// 1. 创建运行时
const runtime = new DefaultAgentRuntime();

// 2. 准备上下文(依赖注入)
const context: RuntimeContext = {
  sessionId: crypto.randomUUID(),
  userId: currentUserId,

  // 注入 LLM
  llm: new VercelAIAdapter({
    provider: 'openai',
    model: 'gpt-4o'
  }),

  // 注入工具
  tools: new WorkflowToolProvider(workflowEngine),

  // 注入记忆
  memory: new SQLiteMemoryProvider(db),

  // 配置
  options: {
    maxIterations: 10,
    timeout: 30000
  }
};

// 3. 执行
for await (const event of runtime.run(input, context)) {
  if (event.type === 'delta') {
    console.log(event.text);
  } else if (event.type === 'tool_call') {
    console.log('Calling tool:', event.call.name);
  }
}
```

### B. 测试示例

```typescript
/**
 * 单元测试: Mock 所有依赖
 */
import { describe, it, expect, vi } from 'vitest';
import { DefaultAgentRuntime } from '../runtime/agent-runtime';

describe('AgentRuntime', () => {
  it('should execute tools when LLM returns tool calls', async () => {
    // Mock LLM
    const mockLLM: LLMProvider = {
      async *stream(request) {
        yield { type: 'tool_call', call: { name: 'test_tool', params: {} } };
        yield { type: 'text', text: 'Done' };
        yield { type: 'done' };
      }
    };

    // Mock Tools
    const mockTools: ToolProvider = {
      list: () => [{ name: 'test_tool', description: 'Test', parameters: {} }],
      execute: vi.fn().mockResolvedValue({ success: true, data: 'result' })
    };

    // 执行
    const runtime = new DefaultAgentRuntime();
    const events = [];
    for await (const event of runtime.run({ messages: [{ role: 'user', content: 'Test' }] }, { sessionId: '123', llm: mockLLM, tools: mockTools })) {
      events.push(event);
    }

    // 验证
    expect(mockTools.execute).toHaveBeenCalledWith('test_tool', {});
    expect(events).toContainEqual({ type: 'tool_call', call: expect.any(Object) });
  });
});
```

---

**文档结束**
