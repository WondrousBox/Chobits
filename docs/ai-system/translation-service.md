# TranslationService 翻译服务文档

## 概述

`TranslationService` 是一个通用的 AI 驱动字幕翻译服务，支持：
- 大批量文本分块并行翻译
- 流式输出与实时进度
- 上下文传递（每块的 summary 传给下一块）
- 术语表/热词匹配
- 自动重试与取消机制

## 架构流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              调用方 (ipc-main.ts)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  1. 获取 AI Provider                                                 │    │
│  │  2. 加载 secrets                                                     │    │
│  │  3. 构造 chatFn                                                      │    │
│  │  4. 调用 TranslationService.translateSubtitles()                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TranslationService                                    │
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                 │
│  │   Chunk 0    │────▶│   Chunk 1    │────▶│   Chunk N    │                 │
│  │              │     │              │     │              │                 │
│  │ 1.等待上块   │     │ 1.等待上块   │     │ 1.等待上块   │                 │
│  │   summary    │     │   summary    │     │   summary    │                 │
│  │ 2.构造prompt │     │ 2.构造prompt │     │ 2.构造prompt │                 │
│  │   +glossary  │     │   +glossary  │     │   +glossary  │                 │
│  │ 3.调用chatFn │     │ 3.调用chatFn │     │ 3.调用chatFn │                 │
│  │ 4.流式解析   │     │ 4.流式解析   │     │ 4.流式解析   │                 │
│  │ 5.发送事件   │     │ 5.发送事件   │     │ 5.发送事件   │                 │
│  └──────────────┘     └──────────────┘     └──────────────┘                 │
│         │                    │                    │                          │
│         └────────────────────┼────────────────────┘                          │
│                              │                                               │
│                              ▼                                               │
│                    ┌──────────────────┐                                      │
│                    │  并发控制器       │                                      │
│                    │  maxConcurrency  │                                      │
│                    │  (默认: 3)       │                                      │
│                    └──────────────────┘                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              事件发射 (emit)                                 │
│                                                                              │
│   connected → progress → chunk-start → parsed/parseProgress → summary       │
│                              ↓                                               │
│                       chunk-complete                                         │
│                              ↓                                               │
│                    completed → done                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 核心类型

### ChatFunction

调用者需要传入的聊天函数类型：

```typescript
type ChatFunction = (
  prompt: string,           // 提示词内容
  onEvent: ChatStreamCallback,  // 流式事件回调
  abortSignal?: AbortSignal     // 中止信号
) => Promise<void>;
```

### ChatStreamEvent

聊天流式事件：

```typescript
interface ChatStreamEvent {
  type: 'delta' | 'message_completed' | 'error';
  data?: {
    text?: string;     // delta 时的增量文本
    message?: string;  // error 时的错误消息
  };
}
```

### TranslationRequest

翻译请求参数：

```typescript
interface TranslationRequest {
  requestId: string;         // 请求 ID（用于跟踪和取消）
  chatFn: ChatFunction;      // 聊天函数（执行实际 AI 调用）
  taskLabel?: string;        // 任务标签（如 'openai/gpt-4'）
  segments: AimSegments[];   // 待翻译的片段数组
  targetLanguage: string;    // 目标语言编码
  languageNames?: Record<string, string>;  // 语言名称映射
  sourceLanguage?: string;   // 源语言编码（可选）
  metadata?: Record<string, any>;  // 元数据
  options?: TranslationOptions;    // 配置选项
}
```

### TranslationOptions

翻译配置选项：

```typescript
interface TranslationOptions {
  maxConcurrency?: number;   // 最大并发数（默认 3）
  chunkSize?: number;        // 分块大小（默认 1000 字符）
  maxRetries?: number;       // 重试次数（默认 2）
  promptTemplate?: string;   // 自定义提示词模板
  generateSummary?: boolean; // 是否生成 summary（默认 true）
  glossary?: GlossaryInput;  // 术语表/热词词典
}
```

### GlossaryInput

术语表支持三种输入格式：

```typescript
// 格式 1: 数组形式
const glossary: GlossaryEntry[] = [
  { source: 'machine learning', target: '机器学习' },
  { source: 'neural network', target: '神经网络', note: '深度学习术语' }
];

// 格式 2: 简单对象映射
const glossary: Record<string, string> = {
  'machine learning': '机器学习',
  'neural network': '神经网络'
};

// 格式 3: 带说明的对象
const glossary: Record<string, { target: string; note?: string }> = {
  'machine learning': { target: '机器学习' },
  'neural network': { target: '神经网络', note: '深度学习术语' }
};
```

## 事件类型详解

### 1. connected
连接成功，翻译开始。

```typescript
{ type: 'connected' }
```

### 2. progress
进度更新事件。

```typescript
{
  type: 'progress',
  data: {
    message: string;      // 进度消息
    percentage?: number;  // 百分比 (0-100)
    startIndex?: number;  // 当前片段开始索引
    endIndex?: number;    // 当前片段结束索引
    prevSummary?: string; // 上一段总结
    displayInfo?: {...};  // 展示信息
  }
}
```

### 3. chunk-start
分块翻译开始。

```typescript
{
  type: 'chunk-start',
  data: {
    chunkIndex: number;           // 当前分块索引
    totalChunks: number;          // 总分块数
    previousSegments: AimSegments[]; // 已翻译片段
    startIndex: number;           // 分块开始索引
    endIndex: number;             // 分块结束索引
    prevSummary?: string;         // 上一段总结
  }
}
```

### 4. parsed
解析出新的翻译片段（实时）。

```typescript
{
  type: 'parsed',
  data: AimSegments[]  // 新解析的片段（带 summary、startIndex、endIndex）
}
```

### 5. parseProgress
解析进度（用于显示正在解析中的片段）。

```typescript
{
  type: 'parseProgress',
  data: AimSegments[]  // 正在解析的片段
}
```

### 6. summary
获得分块总结。

```typescript
{
  type: 'summary',
  data: {
    chunkIndex: number;  // 分块索引
    summary: string;     // 总结内容
    startIndex: number;  // 分块开始索引
    endIndex: number;    // 分块结束索引
  }
}
```

### 7. chunk-complete
分块翻译完成。

```typescript
{
  type: 'chunk-complete',
  data: {
    chunkIndex: number;       // 分块索引
    totalChunks: number;      // 总分块数
    startIndex: number;       // 分块开始索引
    endIndex: number;         // 分块结束索引
    segments: AimSegments[];  // 该分块所有片段
    summary?: string;         // 分块总结
  }
}
```

### 8. completed
翻译全部完成。

```typescript
{
  type: 'completed',
  data: {
    translations: string[];      // 所有翻译结果
    originalTranslation: string; // 合并后的原始文本
    segments: AimSegments[];     // 所有解析后的片段
    displayInfo?: {...};         // 展示信息
  }
}
```

### 9. error
翻译错误。

```typescript
{
  type: 'error',
  data: {
    message: string;      // 错误消息
    code?: string;        // 错误码 (如 'BUSY')
    chunkIndex?: number;  // 失败的分块索引
  }
}
```

### 10. done
流程结束（无论成功或失败）。

```typescript
{ type: 'done' }
```

## 使用示例

### 基础用法

```typescript
import { TranslationService } from './translation-service';

// 构造 chatFn（通常在 ipc-main.ts 中完成）
const chatFn = async (prompt, onEvent, abortSignal) => {
  await provider.chat(
    { messages: [{ role: 'user', content: prompt }], stream: true },
    (event) => {
      if (event.type === 'delta') {
        onEvent({ type: 'delta', data: { text: event.data.text } });
      } else if (event.type === 'message_completed') {
        onEvent({ type: 'message_completed' });
      }
    },
    abortSignal
  );
};

// 调用翻译
const result = await TranslationService.translateSubtitles(
  {
    requestId: 'unique-id',
    chatFn,
    taskLabel: 'openai/gpt-4',
    segments: subtitleSegments,
    targetLanguage: 'zh',
    languageNames: { zh: '中文' },
    options: {
      maxConcurrency: 3,
      chunkSize: 1000,
      glossary: {
        'API': 'API 接口',
        'machine learning': '机器学习'
      }
    }
  },
  (event) => {
    console.log('Event:', event.type, event.data);
  }
);
```

### 自定义提示词模板

```typescript
const customTemplate = `你是专业翻译。请将以下内容翻译成{targetLanguage}。
{glossary}{context}
原文:
{content}`;

await TranslationService.translateSubtitles({
  // ...
  options: {
    promptTemplate: customTemplate,
    generateSummary: false  // 不需要 summary
  }
}, emit);
```

### 繁忙检查与强制启动

在 IPC 调用层（`ipc-main.ts`），会检查相同 taskLabel 是否有正在进行的任务：

```typescript
// 前端调用
const result = await window.YUA.ai.translate({
  providerId: 'openai',
  model: 'gpt-4',
  segments: [...],
  targetLanguage: 'zh',
  languageNames: { zh: '中文' },
  force: false  // 默认不强制启动
});

// 如果繁忙，返回 busy: true
if (result.busy) {
  console.log('服务商繁忙，活跃任务:', result.activeRequests);
  // 可以提示用户是否强制启动
  const forceStart = await confirmDialog('服务商繁忙，是否强制启动？');
  if (forceStart) {
    await window.YUA.ai.translate({ ...params, force: true });
  }
}
```

### 取消翻译

```typescript
// 取消指定任务
TranslationService.cancelTranslation(requestId);

// 查询任务状态
const tasks = TranslationService.getAllActiveTranslations();
const taskInfo = TranslationService.getTaskInfo(requestId);

// 根据标签查询活跃请求
const activeIds = TranslationService.getActiveRequestsByLabel('openai/gpt-4');
```

## 术语表匹配规则

1. **按长度优先**: 长词优先匹配，避免短词覆盖长词
2. **大小写不敏感**: 匹配时忽略大小写
3. **单词边界**: 
   - 英文词使用单词边界匹配 (`\b`)
   - 中文/日文直接包含匹配
4. **去重**: 相同 source 只匹配一次

示例:
```typescript
// 文本: "This machine learning model uses neural networks"
// 术语表: { 'machine': '机器', 'machine learning': '机器学习' }
// 匹配结果: ['machine learning'] (优先匹配长词)
```

## 并发控制机制

```
时间 ──────────────────────────────────────────────────▶

并发槽 1: [Chunk 0 ████████████] [Chunk 3 ██████] [Chunk 6 ...]
并发槽 2: [Chunk 1 ██████████████████] [Chunk 4 ...] 
并发槽 3: [Chunk 2 ████████] [Chunk 5 ███████████...]

约束: 
- Chunk N 必须等待 Chunk N-1 的 summary 完成后才能开始
- 最多 maxConcurrency 个并发请求
```

## 错误处理

1. **自动重试**: 每个分块失败后自动重试，最多 `maxRetries` 次
2. **取消传播**: 外部 `abortSignal` 或 `cancelTranslation()` 会中止所有进行中的请求
3. **错误事件**: 非 `Aborted` 错误会触发 `error` 事件

## API 参考

### TranslationService

| 方法 | 描述 |
|------|------|
| `translateSubtitles(request, emit, signal?)` | 执行翻译 |
| `cancelTranslation(requestId)` | 取消任务 |
| `getAllActiveTranslations()` | 获取所有活跃任务 |
| `getTranslatedSegments(requestId)` | 获取已翻译片段 |
| `getActiveRequestsByLabel(taskLabel)` | 按标签获取活跃请求 |
| `getTaskInfo(requestId)` | 获取任务信息 |
| `hasActiveTranslations()` | 检查是否有活跃任务 |
