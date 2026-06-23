# Chat Model-First Refactor Plan

## 当前进度

已完成：

- 主聊天页、起始页、聊天发送链路切到 `model-first`
- 资源页主要 AI 入口切到 `model-first`
  - 翻译、总结、脑图、资源侧边聊天、标注补全、标签页、文件动作
- 录音页 AI 动作面板切到 `model-first`
- 编辑器 AI 续写配置切到 `model-first`
- 云端 ASR 配置入口改成“服务商 + 模型”选择，并在启动前解析隐藏 preset

仍保留：

- preset 继续作为隐藏的服务端配置载体
- 一些历史兼容状态仍会缓存 `presetId`，但不再作为主入口暴露给用户

## 背景

当前聊天主链路仍然是 `preset-first`：

- 聊天输入区要求用户先显式选择 `presetId`
- 发送请求时直接把该 `presetId` 作为 `providerPresetId`
- 用户切模型时，本质上仍然是在“预设下面选模型”

这和目标体验不一致。目标体验应该是：

- 用户关注“我想用哪个模型”
- 预设只承担密钥和服务端配置，不再成为聊天入口的主选择项
- 当用户切换模型时，系统根据模型所属 Provider 自动匹配可用预设

## 现状能力

当前代码已经具备改造所需的大部分底座：

1. 运行时已经支持“预设提供密钥，模型单独覆盖”
   - `ChatRequest.providerPresetId` 负责预设/密钥
   - `ChatRequest.extras.model` 可以覆盖实际调用模型
   - `packages/ai/runtime/pi/model-resolver.ts` 已按 `extras.model -> preset/provider/default` 的顺序解析模型

2. 聊天模型选择组件已经存在
   - `src/components/common/ProviderModelSelect.tsx`
   - 组件直接返回 `(providerId, modelId)`，不需要在前端自己维护模型到服务商的映射

3. 缺的不是运行时能力，而是聊天发送前的一层“隐藏预设解析”
   - 目前主进程只有 `hasUsablePreset(providerId)` 这种布尔判断
   - 还没有“给我返回这个 Provider 真正可用的 preset” 的接口

## 改造目标

本轮按“最小改造路径”推进，让各主要 AI 入口具备 model-first 能力：

1. 聊天主入口改成选择 `provider + model`
2. 聊天发送前自动解析可用 `preset`
3. 请求按 `providerId + resolved providerPresetId + extras.model` 发送
4. 设置页和预设存储模型暂时不重做

## 最小改造路径

### Phase 1: 主进程补一个可用预设解析器

新增能力：

- 输入：`providerId`
- 可选输入：`preferredPresetId`
- 输出：该 Provider 下一个“可实际发请求”的 `ProviderPresetRecord`

最小选择规则：

1. 如果 `preferredPresetId` 属于当前 Provider 且必填 secrets 完整，优先返回它
2. 否则遍历当前 Provider 的预设，返回第一个可用项
3. 如果没有可用预设，返回 `null`

接口形态：

- service: `resolveUsablePreset(providerId, preferredPresetId?)`
- IPC: `ai:resolveUsablePreset`
- renderer bridge: `window.YUA.ai.resolveUsablePreset()`

### Phase 2: 聊天选择状态切到 model-first

聊天页共享状态增加：

- `providerId`
- `modelId`
- 隐藏的 `presetId` 继续保留，作为“偏好预设 / 最近一次可用预设”的内部状态

这样可以做到：

- 主聊天 UI 不再展示 preset 选择器
- 旧的 preset-first 调用点暂时不被破坏
- 发送时仍可把隐藏的 `presetId` 作为 resolver 的优先候选

### Phase 3: 主聊天 UI 改成 ProviderModelSelect

优先改这两个入口：

- `src/components/chat/ChatInputWithService.tsx`
- `src/pages/ChatPage/StartPage.tsx`

改造后：

- 用户只选模型
- `ProviderModelSelect` 回传 `(providerId, modelId)`
- 隐藏 `presetId` 仅作为内部偏好值传给 resolver

### Phase 4: 聊天发送参数改造

发送前执行：

1. 根据 `providerId + preferredPresetId` 调 `resolveUsablePreset`
2. 若无可用预设，则阻止发送并提示用户去 AI 设置补配置
3. 若有可用预设，则发送：

```ts
window.YUA.ai.chatStream({
  providerId,
  providerPresetId: resolvedPreset.id,
  extras: {
    model: modelId
  },
  ...
})
```

这一步是整个 model-first 体验真正生效的关键。

## 本轮非目标

这次先不做下面这些事情：

- 不重构 AI 设置页的数据结构
- 不移除预设概念，预设仍然是密钥/配置载体
- 不做“全局模型注册表”或“模型反查 Provider”这类更大改造

## 验收标准

满足以下条件即可认为最小闭环成立：

1. 主聊天页和助手起始页只暴露模型选择，不再要求用户先选预设
2. 发送聊天时能自动为当前模型所属 Provider 解析到可用预设
3. 请求能带着 `providerPresetId + extras.model` 正常进入现有 runtime
4. 若 Provider 没有可用预设，能明确阻止发送并提示配置

## 后续扩展方向

最小闭环完成后，可继续推进：

1. 清理不再使用的历史预设选择器与兼容状态
2. 设置页增加“每个 Provider 的默认聊天预设”显式管理
3. 聊天会话级持久化 `modelId`，而不只持久化 `providerPresetId`
