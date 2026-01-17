# API 参考文档

> AI Agent Core 完整 API 参考

---

## 目录

1. [核心接口](#1-核心接口)
2. [类型定义](#2-类型定义)
3. [适配器 API](#3-适配器-api)
4. [工具系统 API](#4-工具系统-api)
5. [记忆系统 API](#5-记忆系统-api)
6. [错误处理 API](#6-错误处理-api)
7. [事件类型](#7-事件类型)

---

## 1. 核心接口

### 1.1 AgentRuntime

```typescript
interface AgentRuntime {
  run(input: AgentInput, context: RuntimeContext): AsyncIterable<AgentEvent>;
  abort(): void;
}
```

#### run()

**签名**: `run(input: AgentInput, context: RuntimeContext): AsyncIterable<AgentEvent>`

**描述**: 执行 Agent 任务，返回异步事件流。

**参数**:

- `input: AgentInput` - 用户输入
  ```typescript
  interface AgentInput {
    messages: Message[];
    systemPrompt?: string;
  }
  ```
- `context: RuntimeContext` - 运行上下文（依赖注入容器）

**返回**: `AsyncIterable<AgentEvent>` - 事件流

**示例**:

```typescript
const runtime = new DefaultAgentRuntime();

for await (const event of runtime.run({ messages: [{ role: 'user', content: '你好' }] }, context)) {
  if (event.type === 'delta') {
    console.log(event.text);
  }
}
```

#### abort()

**签名**: `abort(): void`

**描述**: 中止正在执行的任务。

**示例**:

```typescript
const runtime = new DefaultAgentRuntime();
const task = runtime.run(input, context);

// 5 秒后中止
setTimeout(() => runtime.abort(), 5000);
```

---

### 1.2 RuntimeContext

```typescript
interface RuntimeContext {
  sessionId: string;
  userId?: string;
  llm: LLMProvider;
  tools: ToolProvider;
  memory?: MemoryProvider;
  logger?: LoggerProvider;
  options?: RuntimeOptions;
}
```

**字段说明**:

| 字段        | 类型             | 必需 | 描述               |
| ----------- | ---------------- | ---- | ------------------ |
| `sessionId` | `string`         | ✅   | 会话唯一标识符     |
| `userId`    | `string`         | ❌   | 用户 ID（可选）    |
| `llm`       | `LLMProvider`    | ✅   | LLM 提供者         |
| `tools`     | `ToolProvider`   | ✅   | 工具提供者         |
| `memory`    | `MemoryProvider` | ❌   | 记忆提供者（可选） |
| `logger`    | `LoggerProvider` | ❌   | 日志提供者（可选） |
| `options`   | `RuntimeOptions` | ❌   | 运行时配置         |

**示例**:

```typescript
const context: RuntimeContext = {
  sessionId: crypto.randomUUID(),
  userId: 'user-123',
  llm: new VercelAIAdapter({ provider: 'openai', model: 'gpt-4o' }),
  tools: new RegistryToolProvider(),
  memory: new SimpleMemoryProvider(kvStore),
  options: {
    maxIterations: 10,
    timeout: 30000
  }
};
```

---

### 1.3 RuntimeOptions

```typescript
interface RuntimeOptions {
  maxIterations?: number;
  timeout?: number;
  enableMemory?: boolean;
  maxHistoryMessages?: number;
}
```

**字段说明**:

| 字段                 | 类型      | 默认值  | 描述                             |
| -------------------- | --------- | ------- | -------------------------------- |
| `maxIterations`      | `number`  | `10`    | 最大工具调用轮次                 |
| `timeout`            | `number`  | `60000` | 超时时间（毫秒）                 |
| `enableMemory`       | `boolean` | `true`  | 是否启用记忆系统                 |
| `maxHistoryMessages` | `number`  | `100`   | 历史消息最大条数（不含系统消息） |

---

## 2. 类型定义

### 2.1 Message

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  name?: string;
}
```

**示例**:

```typescript
// 用户消息
{ role: 'user', content: '转码这个视频' }

// 助手消息
{ role: 'assistant', content: '好的，我来帮你转码' }

// 工具调用结果
{
  role: 'tool',
  content: JSON.stringify({ success: true }),
  toolCallId: 'call-123'
}
```

---

### 2.2 ToolCall

```typescript
interface ToolCall {
  id: string;
  name: string;
  params: unknown;
}
```

**示例**:

```typescript
{
  id: 'call-abc123',
  name: 'get_time',
  params: { format: 'iso' }
}
```

---

### 2.3 ToolResult

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
```

**示例**:

```typescript
// 成功
{
  success: true,
  data: { time: '2026-01-16T10:00:00Z' }
}

// 失败
{
  success: false,
  error: 'Tool not found'
}
```

---

## 3. 适配器 API

### 3.1 LLMProvider

```typescript
interface LLMProvider {
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;
  generate?(request: LLMRequest): Promise<LLMResponse>;
}
```

#### stream()

**签名**: `stream(request: LLMRequest): AsyncIterable<LLMChunk>`

**描述**: 流式生成响应（推荐使用）。

**参数**:

```typescript
interface LLMRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}
```

**返回**: `AsyncIterable<LLMChunk>`

```typescript
type LLMChunk = { type: 'text'; text: string } | { type: 'tool_call'; call: ToolCall } | { type: 'done'; usage?: TokenUsage };
```

**示例**:

```typescript
class MyLLMProvider implements LLMProvider {
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    // 调用 API
    const response = await fetch('https://api.example.com/chat', {
      method: 'POST',
      body: JSON.stringify(request)
    });

    // 解析流
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = new TextDecoder().decode(value);
      yield { type: 'text', text };
    }

    yield { type: 'done' };
  }
}
```

#### generate() (可选)

**签名**: `generate(request: LLMRequest): Promise<LLMResponse>`

**描述**: 非流式生成（一次性返回）。

**返回**:

```typescript
interface LLMResponse {
  message: Message;
  usage?: TokenUsage;
}
```

---

### 3.2 Vercel AI SDK 适配器

```typescript
class VercelAIAdapter implements LLMProvider {
  constructor(config: VercelAIConfig);
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk>;
}

interface VercelAIConfig {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  apiKey?: string;
}
```

**示例**:

```typescript
import { VercelAIAdapter } from '@packages/ai-agent/adapters/llm';

const llm = new VercelAIAdapter({
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY
});
```

---

## 4. 工具系统 API

### 4.1 ToolProvider

```typescript
interface ToolProvider {
  list(): ToolDefinition[];
  execute(name: string, params: unknown): Promise<ToolResult>;
  validate?(name: string, params: unknown): ValidationResult;
}
```

#### list()

**签名**: `list(): ToolDefinition[]`

**描述**: 列出所有可用工具。

**返回**: 工具定义数组

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}
```

**示例**:

```typescript
const tools = toolProvider.list();
// [
//   { name: 'get_time', description: '获取当前时间', ... },
//   { name: 'search', description: '搜索资源', ... }
// ]
```

#### execute()

**签名**: `execute(name: string, params: unknown): Promise<ToolResult>`

**描述**: 执行指定工具。

**参数**:

- `name: string` - 工具名称
- `params: unknown` - 工具参数（需符合工具的 JSON Schema）

**返回**: `Promise<ToolResult>`

**示例**:

```typescript
const result = await toolProvider.execute('get_time', { format: 'iso' });
// { success: true, data: { time: '2026-01-16T...' } }
```

---

### 4.2 RegistryToolProvider

```typescript
class RegistryToolProvider implements ToolProvider {
  register(tool: Tool): void;
  unregister(name: string): void;
  list(): ToolDefinition[];
  execute(name: string, params: unknown): Promise<ToolResult>;
}
```

#### register()

**签名**: `register(tool: Tool): void`

**描述**: 注册工具。

**参数**:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: unknown): Promise<unknown>;
}
```

**示例**:

```typescript
const toolProvider = new RegistryToolProvider();

toolProvider.register({
  name: 'calculator',
  description: '执行数学计算',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: '数学表达式' }
    },
    required: ['expression']
  },
  async execute(params: any) {
    return { result: eval(params.expression) };
  }
});
```

#### unregister()

**签名**: `unregister(name: string): void`

**描述**: 取消注册工具。

---

### 4.3 Tool 接口

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  execute(params: unknown): Promise<unknown>;
}
```

**完整示例**:

```typescript
export const WeatherTool: Tool = {
  name: 'get_weather',
  description: '获取指定城市的天气信息',
  parameters: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: '城市名称（中文或英文）'
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: '温度单位',
        default: 'celsius'
      }
    },
    required: ['city']
  },
  async execute(params: any) {
    const { city, unit = 'celsius' } = params;

    // 调用天气 API
    const response = await fetch(`https://api.weather.com/v1/${city}?unit=${unit}`);

    const data = await response.json();

    return {
      city,
      temperature: data.temperature,
      condition: data.condition,
      humidity: data.humidity
    };
  }
};
```

---

## 5. 记忆系统 API

### 5.1 MemoryProvider

```typescript
interface MemoryProvider {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: MemoryOptions): Promise<void>;
  search?(query: string, limit?: number): Promise<MemoryItem[]>;
  clear?(sessionId: string): Promise<void>;
}
```

#### get()

**签名**: `get(key: string): Promise<unknown>`

**描述**: 获取记忆。

**示例**:

```typescript
const userPrefs = await memory.get('user:prefs');
// { language: 'zh-CN', theme: 'dark' }
```

#### set()

**签名**: `set(key: string, value: unknown, options?: MemoryOptions): Promise<void>`

**描述**: 设置记忆。

**参数**:

```typescript
interface MemoryOptions {
  persist?: boolean; // 是否持久化（默认 false）
  ttl?: number; // 过期时间（秒，默认 3600）
}
```

**示例**:

```typescript
// 临时记忆（会话级）
await memory.set('temp:data', { foo: 'bar' });

// 持久化记忆（跨会话）
await memory.set(
  'user:prefs',
  { language: 'zh-CN' },
  { persist: true, ttl: 86400 } // 1 天
);
```

#### search() (可选)

**签名**: `search(query: string, limit?: number): Promise<MemoryItem[]>`

**描述**: 语义搜索记忆（需要向量化支持）。

**示例**:

```typescript
const results = await memory.search('用户喜好', 5);
// [
//   { key: 'user:prefs', value: {...}, score: 0.95 },
//   { key: 'user:history', value: {...}, score: 0.87 }
// ]
```

---

### 5.2 SimpleMemoryProvider

```typescript
class SimpleMemoryProvider implements MemoryProvider {
  constructor(persistent: KVStore);
  async get(key: string): Promise<unknown>;
  async set(key: string, value: unknown, options?: MemoryOptions): Promise<void>;
  async clear(sessionId: string): Promise<void>;
}
```

**KVStore 接口**:

```typescript
interface KVStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

**示例**:

```typescript
import { SimpleMemoryProvider } from '@packages/ai-agent/adapters/memory';

// 使用 SQLite 作为持久化存储
const memory = new SimpleMemoryProvider(new SQLiteKVStore(db));

// 使用 Redis 作为持久化存储
const memory = new SimpleMemoryProvider(new RedisKVStore(redis));
```

---

## 6. 错误处理 API

### 6.1 AgentError

```typescript
interface AgentError {
  category: ErrorCategory;
  message: string;
  details?: unknown;
  recoverable: boolean;
  suggestion?: string;
}

enum ErrorCategory {
  LLM_ERROR = 'llm_error',
  TOOL_ERROR = 'tool_error',
  VALIDATION_ERROR = 'validation_error',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}
```

**错误码对照表**:

| 错误类别           | 常见原因           | 可恢复 | 推荐处理           |
| ------------------ | ------------------ | ------ | ------------------ |
| `llm_error`        | API 限额、网络错误 | ✅ 是  | 重试 3 次          |
| `tool_error`       | 工具执行失败       | ❌ 否  | 跳过工具，继续执行 |
| `validation_error` | 参数格式错误       | ❌ 否  | 让 LLM 修正参数    |
| `timeout_error`    | 请求超时           | ✅ 是  | 返回部分结果       |
| `unknown_error`    | 未知错误           | ❌ 否  | 中止执行           |

**错误处理示例**:

```typescript
// 1. 基础错误捕获
for await (const event of runtime.run(input, context)) {
  if (event.type === 'error') {
    console.error(`[${event.error.category}] ${event.error.message}`);

    if (event.error.recoverable) {
      console.log('尝试恢复:', event.error.suggestion);
    } else {
      console.log('无法恢复，任务终止');
      break;
    }
  }
}

// 2. 错误分类处理
for await (const event of runtime.run(input, context)) {
  if (event.type === 'error') {
    switch (event.error.category) {
      case 'llm_error':
        // LLM 错误 - 重试
        await retryWithBackoff();
        break;

      case 'tool_error':
        // 工具错误 - 记录日志并继续
        logger.warn('工具执行失败', event.error.details);
        break;

      case 'validation_error':
        // 参数错误 - 提示用户
        notifyUser('参数格式错误: ' + event.error.message);
        break;

      case 'timeout_error':
        // 超时 - 返回部分结果
        return partialResults;

      default:
        // 未知错误 - 中止
        throw new Error(event.error.message);
    }
  }
}

// 3. 错误传播示例
async function executeWithErrorHandling() {
  try {
    for await (const event of runtime.run(input, context)) {
      if (event.type === 'error') {
        // 转换为业务错误
        throw new BusinessError(event.error.category, event.error.message, event.error.details);
      }
      // 处理正常事件...
    }
  } catch (error) {
    if (error instanceof BusinessError) {
      // 业务层处理
      await logToMonitoring(error);
      await notifyUser(error.getUserMessage());
    }
    throw error; // 继续向上传播
  }
}
```

---

### 6.2 RecoveryStrategy

```typescript
interface RecoveryStrategy {
  retryable: boolean;
  maxRetries?: number;
  backoff?: 'linear' | 'exponential';
  fallback?: string;
  notify?: boolean;
}
```

**预定义策略**:

```typescript
export const RECOVERY_STRATEGIES: Record<ErrorCategory, RecoveryStrategy>;
```

**使用示例**:

```typescript
import { RECOVERY_STRATEGIES, ErrorCategory } from '@packages/ai-agent/errors';

const strategy = RECOVERY_STRATEGIES[ErrorCategory.LLM_ERROR];
// { retryable: true, maxRetries: 3, backoff: 'exponential', ... }
```

---

## 7. 事件类型

### 7.1 AgentEvent

```typescript
type AgentEvent = MetadataEvent | DeltaEvent | ToolCallEvent | ToolResultEvent | ErrorEvent | DoneEvent;
```

#### MetadataEvent

```typescript
interface MetadataEvent {
  type: 'metadata';
  data: Record<string, unknown>;
}
```

**示例**:

```typescript
{
  type: 'metadata',
  data: {
    phase: 'iteration_start',
    iteration: 2
  }
}
```

#### DeltaEvent

```typescript
interface DeltaEvent {
  type: 'delta';
  text: string;
}
```

**示例**:

```typescript
{
  type: 'delta',
  text: '我正在帮你'
}
```

#### ToolCallEvent

```typescript
interface ToolCallEvent {
  type: 'tool_call';
  call: ToolCall;
}
```

**示例**:

```typescript
{
  type: 'tool_call',
  call: {
    id: 'call-123',
    name: 'get_time',
    params: { format: 'iso' }
  }
}
```

#### ToolResultEvent

```typescript
interface ToolResultEvent {
  type: 'tool_result';
  result: ToolResult;
  callId?: string;
}
```

**示例**:

```typescript
{
  type: 'tool_result',
  result: {
    success: true,
    data: { time: '2026-01-16T10:00:00Z' }
  }
}
```

#### ErrorEvent

```typescript
interface ErrorEvent {
  type: 'error';
  error: AgentError;
}
```

**示例**:

```typescript
{
  type: 'error',
  error: {
    category: 'timeout_error',
    message: 'Request timeout after 30s',
    recoverable: true
  }
}
```

#### DoneEvent

```typescript
interface DoneEvent {
  type: 'done';
  success: boolean;
}
```

**示例**:

```typescript
{ type: 'done', success: true }
```

---

## 8. 实用工具

### 8.1 ConsoleLogger

```typescript
class ConsoleLogger implements LoggerProvider {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
```

**示例**:

```typescript
import { ConsoleLogger } from '@packages/ai-agent/utils';

const logger = new ConsoleLogger();
logger.info('Agent started', { sessionId: '123' });
// [INFO] Agent started { sessionId: '123' }
```

---

## 9. 完整示例

```typescript
import { DefaultAgentRuntime, type RuntimeContext, type AgentEvent } from '@packages/ai-agent';
import { VercelAIAdapter } from '@packages/ai-agent/adapters/llm';
import { RegistryToolProvider } from '@packages/ai-agent/tools';
import { SimpleMemoryProvider } from '@packages/ai-agent/adapters/memory';
import { GetTimeTool } from './tools/time';

// 1. 创建运行时
const runtime = new DefaultAgentRuntime();

// 2. 注册工具
const tools = new RegistryToolProvider();
tools.register(GetTimeTool);

// 3. 准备上下文
const context: RuntimeContext = {
  sessionId: crypto.randomUUID(),
  llm: new VercelAIAdapter({ provider: 'openai', model: 'gpt-4o' }),
  tools,
  memory: new SimpleMemoryProvider(kvStore),
  options: {
    maxIterations: 10,
    timeout: 30000
  }
};

// 4. 执行 Agent
for await (const event of runtime.run({ messages: [{ role: 'user', content: '现在几点了?' }] }, context)) {
  switch (event.type) {
    case 'delta':
      process.stdout.write(event.text);
      break;

    case 'tool_call':
      console.log('\n[Tool Call]', event.call.name);
      break;

    case 'tool_result':
      console.log('[Tool Result]', event.result.data);
      break;

    case 'error':
      console.error('[Error]', event.error.message);
      break;

    case 'done':
      console.log('\n✓ 完成');
      break;
  }
}
```

---

**文档结束**
