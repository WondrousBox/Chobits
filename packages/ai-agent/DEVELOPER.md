# 开发者指南

> 如何扩展和定制 AI Agent Core

---

## 目录

1. [创建自定义工具](#1-创建自定义工具)
2. [实现 LLM 适配器](#2-实现-llm-适配器)
3. [实现记忆适配器](#3-实现记忆适配器)
4. [自定义错误处理](#4-自定义错误处理)
5. [高级模式](#5-高级模式)
6. [测试策略](#6-测试策略)
7. [性能优化](#7-性能优化)
8. [最佳实践](#8-最佳实践)

---

## 1. 创建自定义工具

### 1.1 基础工具

```typescript
import { Tool } from '@packages/ai-agent';

export const CalculatorTool: Tool = {
  name: 'calculator',
  description: '执行数学计算',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: '数学表达式（例如: "2 + 2"）'
      }
    },
    required: ['expression']
  },
  async execute(params: any) {
    try {
      // ⚠️ 生产环境应使用安全的表达式求值库
      const result = eval(params.expression);
      return { result, expression: params.expression };
    } catch (error) {
      throw new Error(`计算失败: ${error.message}`);
    }
  }
};
```

### 1.2 带验证的工具

```typescript
export const WeatherTool: Tool = {
  name: 'get_weather',
  description: '获取天气信息',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称'
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        default: 'celsius'
      }
    },
    required: ['city']
  },
  async execute(params: any) {
    // 1. 参数验证
    if (!params.city || typeof params.city !== 'string') {
      throw new Error('城市名称无效');
    }

    // 2. 调用外部 API
    const response = await fetch(`https://api.weather.com/v1/current?city=${encodeURIComponent(params.city)}&unit=${params.unit || 'celsius'}`);

    if (!response.ok) {
      throw new Error(`天气 API 返回错误: ${response.status}`);
    }

    const data = await response.json();

    // 3. 返回结构化数据
    return {
      city: params.city,
      temperature: data.temperature,
      condition: data.condition,
      humidity: data.humidity,
      timestamp: new Date().toISOString()
    };
  }
};
```

### 1.3 异步工具（长时间运行）

```typescript
export const VideoTranscodeTool: Tool = {
  name: 'transcode_video',
  description: '转码视频文件',
  parameters: {
    type: 'object',
    properties: {
      inputPath: { type: 'string', description: '输入文件路径' },
      outputFormat: {
        type: 'string',
        enum: ['mp4', 'webm', 'mov'],
        description: '输出格式'
      }
    },
    required: ['inputPath', 'outputFormat']
  },
  async execute(params: any) {
    // 1. 启动转码任务
    const taskId = await startTranscodeTask(params.inputPath, params.outputFormat);

    // 2. 返回任务 ID（不等待完成）
    return {
      taskId,
      status: 'pending',
      message: '转码任务已启动，可使用 task_id 查询进度'
    };
  }
};

// 配套的查询工具
export const CheckTaskTool: Tool = {
  name: 'check_task',
  description: '查询任务状态',
  parameters: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: '任务 ID' }
    },
    required: ['taskId']
  },
  async execute(params: any) {
    const task = await getTaskStatus(params.taskId);
    return {
      taskId: params.taskId,
      status: task.status,
      progress: task.progress,
      result: task.result
    };
  }
};
```

### 1.4 注册工具

```typescript
import { RegistryToolProvider } from '@packages/ai-agent/tools';

const toolProvider = new RegistryToolProvider();

// 注册多个工具
toolProvider.register(CalculatorTool);
toolProvider.register(WeatherTool);
toolProvider.register(VideoTranscodeTool);
toolProvider.register(CheckTaskTool);

// 列出所有工具
const allTools = toolProvider.list();
console.log(`已注册 ${allTools.length} 个工具`);
```

---

## 2. 实现 LLM 适配器

### 2.1 基础适配器

```typescript
import { LLMProvider, LLMRequest, LLMChunk } from '@packages/ai-agent';

export class CustomLLMAdapter implements LLMProvider {
  constructor(
    private config: {
      apiKey: string;
      endpoint: string;
      model: string;
    }
  ) {}

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    // 1. 构建请求
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: request.messages,
        tools: request.tools,
        temperature: request.temperature ?? 0.7,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API 错误: ${response.status}`);
    }

    // 2. 解析流
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));

          // 3. 转换为标准格式
          if (data.type === 'text') {
            yield { type: 'text', text: data.content };
          } else if (data.type === 'tool_call') {
            yield {
              type: 'tool_call',
              call: {
                id: data.id,
                name: data.name,
                params: data.arguments
              }
            };
          }
        }
      }
    }

    yield { type: 'done' };
  }
}
```

### 2.2 Vercel AI SDK 适配器

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { LLMProvider, LLMRequest, LLMChunk } from '@packages/ai-agent';

export class VercelAIAdapter implements LLMProvider {
  private model: any;

  constructor(config: { provider: 'openai' | 'anthropic' | 'google'; model: string; apiKey?: string }) {
    // 根据配置选择模型
    switch (config.provider) {
      case 'openai':
        this.model = openai(config.model, { apiKey: config.apiKey });
        break;
      case 'anthropic':
        this.model = anthropic(config.model, { apiKey: config.apiKey });
        break;
      default:
        throw new Error(`不支持的 Provider: ${config.provider}`);
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const { textStream, toolCalls } = await streamText({
      model: this.model,
      messages: request.messages,
      tools: this.convertTools(request.tools || []),
      temperature: request.temperature,
      maxTokens: request.maxTokens
    });

    // 发射文本流
    for await (const text of textStream) {
      yield { type: 'text', text };
    }

    // 发射工具调用
    if (toolCalls) {
      for await (const call of toolCalls) {
        yield {
          type: 'tool_call',
          call: {
            id: call.toolCallId,
            name: call.toolName,
            params: call.args
          }
        };
      }
    }

    yield { type: 'done' };
  }

  private convertTools(tools: ToolDefinition[]) {
    return tools.reduce(
      (acc, tool) => {
        acc[tool.name] = {
          description: tool.description,
          parameters: tool.parameters
        };
        return acc;
      },
      {} as Record<string, any>
    );
  }
}
```

---

## 3. 实现记忆适配器

### 3.1 SQLite 记忆

```typescript
import { MemoryProvider, MemoryOptions } from '@packages/ai-agent';
import Database from 'better-sqlite3';

export class SQLiteMemoryProvider implements MemoryProvider {
  private session = new Map<string, { value: any; expiry: number }>();
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initDatabase();
    this.startCleanup();
  }

  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_memory (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        ttl INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_created_at ON agent_memory(created_at);
    `);
  }

  async get(key: string): Promise<unknown> {
    // 1. 先查会话记忆
    const sessionValue = this.session.get(key);
    if (sessionValue && sessionValue.expiry > Date.now()) {
      return sessionValue.value;
    }

    // 2. 再查持久记忆
    const row = this.db.prepare('SELECT value, created_at, ttl FROM agent_memory WHERE key = ?').get(key) as any;

    if (!row) return null;

    // 3. 检查过期
    if (row.ttl && Date.now() - row.created_at > row.ttl * 1000) {
      this.db.prepare('DELETE FROM agent_memory WHERE key = ?').run(key);
      return null;
    }

    const value = JSON.parse(row.value);

    // 4. 提升到会话记忆
    this.session.set(key, {
      value,
      expiry: Date.now() + 3600000
    });

    return value;
  }

  async set(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    const ttl = options?.ttl ?? 3600;

    // 1. 写入会话记忆
    this.session.set(key, {
      value,
      expiry: Date.now() + ttl * 1000
    });

    // 2. 如果需要持久化
    if (options?.persist) {
      this.db
        .prepare(
          `
          INSERT OR REPLACE INTO agent_memory (key, value, created_at, ttl)
          VALUES (?, ?, ?, ?)
        `
        )
        .run(key, JSON.stringify(value), Date.now(), ttl);
    }
  }

  async clear(sessionId: string): Promise<void> {
    // 清理会话记忆
    for (const [key] of this.session) {
      if (key.startsWith(`session:${sessionId}`)) {
        this.session.delete(key);
      }
    }

    // 清理持久记忆
    this.db.prepare('DELETE FROM agent_memory WHERE key LIKE ?').run(`session:${sessionId}%`);
  }

  private startCleanup(): void {
    setInterval(() => {
      const now = Date.now();

      // 清理会话记忆
      for (const [key, value] of this.session) {
        if (value.expiry <= now) {
          this.session.delete(key);
        }
      }

      // 清理持久记忆
      this.db.prepare('DELETE FROM agent_memory WHERE ttl IS NOT NULL AND created_at + ttl * 1000 < ?').run(now);
    }, 60000); // 每分钟
  }
}
```

### 3.2 Redis 记忆

```typescript
import { MemoryProvider, MemoryOptions } from '@packages/ai-agent';
import { Redis } from 'ioredis';

export class RedisMemoryProvider implements MemoryProvider {
  private redis: Redis;

  constructor(config: { host: string; port: number; password?: string }) {
    this.redis = new Redis(config);
  }

  async get(key: string): Promise<unknown> {
    const value = await this.redis.get(`agent:${key}`);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: unknown, options?: MemoryOptions): Promise<void> {
    const ttl = options?.ttl ?? 3600;
    await this.redis.setex(`agent:${key}`, ttl, JSON.stringify(value));
  }

  async clear(sessionId: string): Promise<void> {
    const keys = await this.redis.keys(`agent:session:${sessionId}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async search(query: string, limit = 5): Promise<any[]> {
    // Redis 不原生支持语义搜索
    // 需要使用 Redis Search 或向量模块
    throw new Error('Redis 语义搜索需要额外配置');
  }
}
```

---

## 4. 自定义错误处理

### 4.1 扩展错误类型

```typescript
import { AgentError, ErrorCategory } from '@packages/ai-agent/errors';

// 自定义错误类别
export enum CustomErrorCategory {
  NETWORK_ERROR = 'network_error',
  AUTH_ERROR = 'auth_error',
  RATE_LIMIT_ERROR = 'rate_limit_error'
}

// 创建错误
export function createNetworkError(message: string): AgentError {
  return {
    category: CustomErrorCategory.NETWORK_ERROR as any,
    message,
    recoverable: true,
    suggestion: '请检查网络连接后重试'
  };
}
```

### 4.2 自定义恢复策略

```typescript
import { RecoveryStrategy, RECOVERY_STRATEGIES } from '@packages/ai-agent/errors';

// 扩展恢复策略
export const CUSTOM_RECOVERY_STRATEGIES: Record<string, RecoveryStrategy> = {
  ...RECOVERY_STRATEGIES,

  [CustomErrorCategory.NETWORK_ERROR]: {
    retryable: true,
    maxRetries: 5,
    backoff: 'exponential',
    fallback: 'use_cache'
  },

  [CustomErrorCategory.AUTH_ERROR]: {
    retryable: false,
    fallback: 'prompt_for_credentials',
    notify: true
  },

  [CustomErrorCategory.RATE_LIMIT_ERROR]: {
    retryable: true,
    maxRetries: 3,
    backoff: 'exponential',
    fallback: 'use_alternative_provider'
  }
};
```

---

## 5. 高级模式

### 5.1 工具链（Tool Chaining）

```typescript
/**
 * 创建工具链：自动组合多个工具
 */
export function createToolChain(tools: Tool[], name: string): Tool {
  return {
    name,
    description: `执行一系列操作：${tools.map((t) => t.name).join(' → ')}`,
    parameters: {
      type: 'object',
      properties: tools[0].parameters.properties
    },
    async execute(params: any) {
      let result = params;

      for (const tool of tools) {
        result = await tool.execute(result);
      }

      return result;
    }
  };
}

// 使用示例
const downloadAndTranscodeTool = createToolChain([DownloadTool, TranscodeTool], 'download_and_transcode');
```

### 5.2 并行工具执行

**基础并行模式**:

```typescript
/**
 * 步骤 1: 定义单个搜索函数
 */
async function searchInSource(source: string, query: string) {
  switch (source) {
    case 'web':
      return await searchWeb(query);
    case 'local':
      return await searchLocal(query);
    case 'database':
      return await searchDatabase(query);
    default:
      throw new Error(`未知来源: ${source}`);
  }
}

/**
 * 步骤 2: 创建并行搜索工具
 */
export const ParallelSearchTool: Tool = {
  name: 'parallel_search',
  description: '并行搜索多个来源',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      sources: {
        type: 'array',
        items: { type: 'string', enum: ['web', 'local', 'database'] }
      }
    },
    required: ['query', 'sources']
  },
  async execute(params: any) {
    const { query, sources } = params;

    // 并行执行所有搜索
    const results = await Promise.allSettled(sources.map((source: string) => searchInSource(source, query)));

    // 过滤成功的结果
    const successful = results.filter((r) => r.status === 'fulfilled').map((r: any) => r.value);

    // 记录失败的来源
    const failed = results.filter((r) => r.status === 'rejected').map((r: any, i) => ({ source: sources[i], error: r.reason }));

    return {
      query,
      total: successful.length,
      results: successful,
      failures: failed // 提供失败信息便于调试
    };
  }
};
```

**更简单的例子 - 并行获取数据**:

```typescript
export const FetchMultipleTool: Tool = {
  name: 'fetch_multiple',
  description: '同时获取多个 URL',
  parameters: {
    type: 'object',
    properties: {
      urls: { type: 'array', items: { type: 'string' } }
    }
  },
  async execute(params: any) {
    const responses = await Promise.all(params.urls.map((url: string) => fetch(url)));
    return await Promise.all(responses.map((r) => r.json()));
  }
};
```

### 5.3 工具权限控制

```typescript
/**
 * 带权限检查的工具提供者
 */
export class SecureToolProvider extends RegistryToolProvider {
  constructor(private permissions: Map<string, Set<string>>) {
    super();
  }

  async execute(name: string, params: unknown): Promise<ToolResult> {
    // 1. 检查权限
    const requiredPerms = this.permissions.get(name);
    if (requiredPerms && !this.hasPermissions(requiredPerms)) {
      return {
        success: false,
        error: `工具 '${name}' 需要权限: ${Array.from(requiredPerms).join(', ')}`
      };
    }

    // 2. 执行工具
    return super.execute(name, params);
  }

  private hasPermissions(required: Set<string>): boolean {
    // 实现权限检查逻辑
    return true;
  }
}
```

---

## 6. 测试策略

### 6.1 单元测试工具

**基础工具测试**:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { CalculatorTool } from './calculator-tool';

describe('CalculatorTool', () => {
  it('should calculate correctly', async () => {
    const result = await CalculatorTool.execute({ expression: '2 + 2' });
    expect(result).toEqual({ result: 4, expression: '2 + 2' });
  });

  it('should throw error for invalid expression', async () => {
    await expect(CalculatorTool.execute({ expression: 'invalid' })).rejects.toThrow('计算失败');
  });

  it('should handle complex expressions', async () => {
    const result = await CalculatorTool.execute({ expression: '(10 + 5) * 2' });
    expect(result.result).toBe(30);
  });
});
```

**测试 ToolProvider**:

```typescript
import { RegistryToolProvider } from '@packages/ai-agent/tools';

describe('RegistryToolProvider', () => {
  let provider: RegistryToolProvider;

  beforeEach(() => {
    provider = new RegistryToolProvider();
  });

  it('should register and list tools', () => {
    provider.register(CalculatorTool);
    const tools = provider.list();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('calculator');
  });

  it('should execute registered tool', async () => {
    provider.register(CalculatorTool);
    const result = await provider.execute('calculator', { expression: '1+1' });

    expect(result.success).toBe(true);
    expect(result.data.result).toBe(2);
  });

  it('should return error for unknown tool', async () => {
    const result = await provider.execute('unknown_tool', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
```

**测试核心 Runtime**:

```typescript
import { DefaultAgentRuntime } from '@packages/ai-agent/runtime';
import { MockLLMProvider, MockToolProvider } from './mocks';

describe('DefaultAgentRuntime', () => {
  it('should execute and emit events', async () => {
    const runtime = new DefaultAgentRuntime();
    const events: any[] = [];

    const mockLLM = new MockLLMProvider([{ type: 'text', text: 'Hello' }, { type: 'done' }]);

    for await (const event of runtime.run({ messages: [{ role: 'user', content: 'Hi' }] }, { sessionId: '123', llm: mockLLM, tools: new MockToolProvider() })) {
      events.push(event);
    }

    expect(events).toContainEqual({ type: 'delta', text: 'Hello' });
    expect(events).toContainEqual({ type: 'done', success: true });
  });

  it('should handle abort', async () => {
    const runtime = new DefaultAgentRuntime();
    const task = runtime.run(input, context);

    // 立即中止
    runtime.abort();

    const events = [];
    for await (const event of task) {
      events.push(event);
    }

    expect(events.length).toBeLessThan(10); // 应该提前终止
  });
});
```

### 6.2 Mock LLM Provider

```typescript
import { LLMProvider, LLMChunk } from '@packages/ai-agent';

export class MockLLMProvider implements LLMProvider {
  constructor(private responses: LLMChunk[]) {}

  async *stream(): AsyncIterable<LLMChunk> {
    for (const chunk of this.responses) {
      yield chunk;
    }
  }
}

// 使用示例
const mockLLM = new MockLLMProvider([{ type: 'text', text: 'Hello' }, { type: 'tool_call', call: { id: '1', name: 'test', params: {} } }, { type: 'done' }]);
```

### 6.3 集成测试

```typescript
import { describe, it, expect } from 'vitest';
import { DefaultAgentRuntime } from '@packages/ai-agent';
import { MockLLMProvider } from './mocks';

describe('Agent Integration', () => {
  it('should execute tool and return result', async () => {
    const mockLLM = new MockLLMProvider([{ type: 'tool_call', call: { id: '1', name: 'calculator', params: { expression: '2+2' } } }, { type: 'text', text: '结果是 4' }, { type: 'done' }]);

    const mockTools = new RegistryToolProvider();
    mockTools.register(CalculatorTool);

    const runtime = new DefaultAgentRuntime();
    const events = [];

    for await (const event of runtime.run({ messages: [{ role: 'user', content: '计算 2+2' }] }, { sessionId: '123', llm: mockLLM, tools: mockTools })) {
      events.push(event);
    }

    expect(events).toContainEqual({
      type: 'tool_result',
      result: { success: true, data: { result: 4, expression: '2+2' } }
    });
  });
});
```

---

## 7. 性能优化

### 7.1 工具结果缓存

```typescript
export class CachedToolProvider extends RegistryToolProvider {
  private cache = new Map<string, { result: ToolResult; expiry: number }>();
  private cacheTTL = 60000; // 1 分钟

  async execute(name: string, params: unknown): Promise<ToolResult> {
    const cacheKey = `${name}:${JSON.stringify(params)}`;

    // 1. 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    // 2. 执行工具
    const result = await super.execute(name, params);

    // 3. 缓存成功结果
    if (result.success) {
      this.cache.set(cacheKey, {
        result,
        expiry: Date.now() + this.cacheTTL
      });
    }

    return result;
  }
}
```

### 7.2 并发控制

```typescript
import pLimit from 'p-limit';

export class RateLimitedToolProvider extends RegistryToolProvider {
  private limiter = pLimit(5); // 最多同时执行 5 个工具

  async execute(name: string, params: unknown): Promise<ToolResult> {
    return this.limiter(() => super.execute(name, params));
  }
}
```

---

## 8. 最佳实践

### 8.1 工具设计原则

✅ **做**:

- 工具名称使用 snake_case
- 提供详细的 description（LLM 依赖此信息）
- 参数使用 JSON Schema 严格定义
- 返回结构化数据
- 优雅处理错误

❌ **不做**:

- 工具内部调用其他工具
- 工具内部维护状态
- 工具执行时间过长（> 30s）
- 返回过大的数据（> 1MB）

### 8.2 错误处理原则

```typescript
// ✅ 好的错误处理
async execute(params: any) {
  try {
    return await doSomething(params);
  } catch (error) {
    throw new Error(`操作失败: ${error.message}`);
  }
}

// ❌ 不好的错误处理
async execute(params: any) {
  return await doSomething(params); // 错误会直接抛出
}
```

### 8.3 记忆使用原则

```typescript
// ✅ 正确使用记忆
await memory.set('user:prefs', prefs, { persist: true, ttl: 86400 });
await memory.set('temp:data', data); // 临时数据不持久化

// ❌ 错误使用
await memory.set('large:data', hugeObject, { persist: true }); // 不要存储大对象
```

---

**文档结束**
