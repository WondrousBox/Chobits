# Sprite AI 自发说话设计文档

> **状态**: 全部实现（Phase 1-4 均已落地）
> **最后更新**: 2026-04-23

---

## 1. 概述

桌面精灵在闲置小动作触发时，会通过 AI 生成一句有触动感的主动表达（提醒、鼓励、感悟、幽默等），配合动作和语音说出来，并记录为可追踪的历史。

### 触发链路

```
BehaviorEngine idle-action 触发
  → default-behaviors.ts 编排层
  → SpriteSpontaneousUtteranceExecutor 注入接口
  → SpriteSpontaneousUtteranceService (主进程)
  → 上下文装配 → Ephemeral AI 生成 → 结构化解析
  → SpriteManager.trigger(action) + SpriteManager.speak(text)
  → JSONL 历史记录
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `packages/sprite-core/manager/types.ts` | `SpriteSpontaneousUtteranceExecutor` 接口定义 |
| `packages/sprite-core/manager/sprite-manager.ts` | 持有注入的 executor |
| `packages/sprite-core/manager/default-behaviors.ts` | `idle-action` 行为调用 executor |
| `electron/main/handlers/sprite/spontaneous-utterance-service.ts` | 主进程 AI 编排服务 |
| `electron/main/handlers/memory/retrieval-db-deps.ts` | 记忆检索依赖注入 |

---

## 2. 架构决策

### 2.1 `sprite-core` 不直连 AI

`sprite-core` 只定义 `SpriteSpontaneousUtteranceExecutor` 接口，由 Electron main 进程注入实现。这保持了 `sprite-core` 的纯逻辑层定位。

### 2.2 显式装配上下文，不依赖 enrichers

自发说话走 `persist: false` 的 ephemeral 生成，现有 enrichers 在此模式下会跳过。因此上下文必须由 `SpriteSpontaneousUtteranceService` 显式拼装。

### 2.3 失败无害降级

AI 生成当前由 activity-aware timeout controller 控制，绝对最长上限为 3 分钟（实现常量 `MAX_GENERATION_TIMEOUT_MS`）；若生成失败、超时或被中断，会直接回退为仅播放随机小动作，不阻塞行为主链路。

---

## 3. 上下文装配

生成输入为结构化的 `IdleActionUtteranceRequest`：

| 上下文来源 | 获取方式 | 截取策略 |
|-----------|----------|----------|
| 用户画像 | `USER_PERSONA.md` → `extractSnapshot()` + `extractTopFacts()` | snapshot + 最多 6 条 topFacts |
| 助手角色 | `role.json` + `buildCharacterPersonaPrompt()` + preset `systemPrompt` | 角色摘要 |
| 最近聊天 | `ChatRepo.listMessages()` | 最近 12-20 条，过滤工具噪音 |
| 持久记忆 | `MemoryRetrievalService` + `MEMORY.md` | 轻量目标检索，3-5 条相关 note |
| 重要对话 | 最近高信号片段 + 高重要度 note | 摘要格式 |
| 精灵状态 | `BehaviorContext` + `SpriteManager` | mood / favor / level / idleDuration |

---

## 4. 输出 Schema

```json
{
  "text": "先把今天最重要的一件事做完，心就会慢慢安静下来。",
  "intentCategory": "reminder",
  "tone": "gentle",
  "emotion": "warm",
  "recommendedAction": "nod",
  "whyThisFits": "用户最近在任务切换和焦虑之间摇摆"
}
```

| 字段 | 值域 | 说明 |
|------|------|------|
| `text` | 8-36 汉字 | 唯一对外说出的内容 |
| `intentCategory` | philosophy / encouragement / playful / reminder / planning / empathy / reflection | 意图类别 |
| `tone` | gentle / playful / calm / firm / curious / tender | 口气 |
| `emotion` | warm / hopeful / amused / thoughtful / soothing / bright | 情绪 |
| `recommendedAction` | 映射到现有动作池 | 建议配合动作 |
| `whyThisFits` | 自由文本 | 仅日志用 |

---

## 5. 说话与动作协同

执行顺序：**先生成，再动作+发声**。

1. `idle-action` 触发
2. 调用 `generateForIdleAction()`
3. 成功：取 `recommendedAction` → `mgr.trigger(action)` → `mgr.speak(text)`
4. 失败/超时：回退为仅 `mgr.trigger(randomAction)`

先生成再动作，保证动作与语气一致。

---

## 6. 限频与降噪

| 控制层 | 默认值 |
|--------|--------|
| 全局冷却 | 20 分钟 |
| 每日上限 | 8 次 |
| 文案去重 | 最近 20 条完全相同拒绝；最近 5 条同 intentCategory 降概率 |

---

## 7. 日志

存储位置：`<workspace>/memory/logs/sprite-spontaneous-utterances-YYYY-MM-DD.jsonl`

每条日志包含：timestamp、workspaceId、behaviorId、providerId、model、latencyMs、spriteState、contextDigest、result、executedAction、spoken、fallbackUsed。

失败时也记录（skipped: true + reason）。

主进程日志前缀：`[SpriteAIUtterance]`
