# Quest: `workspace.create` — 引导用户创建第一个工作空间

> **所属系统**：[Onboarding System](./README.md)
> **状态**：已按固定新手 Quest 流程落地
> **预设 Routine ID**：`onboarding.workspace.create`
> **Purpose Kind**：`onboarding.workspace.create`
> **Routine Goal**：`workspace.exists`（至少存在一个未删除工作空间，阻断式入口会先评估该目标）
> **Purpose Priority**：70（高于 daily.care.reminder=55；启动期 onboarding focus 会暂停 daily care 并压制环境发言）
> **开发试跑入口**：机能扩展 → AI 目标规划 / 目的规划器 → 观测 → 工作空间引导预设
> **任务展示入口**：助手右键菜单 → 任务 → 新手任务“创建你的第一个工作空间”

## 1. 用户故事

> 第一次启动应用的用户没有工作空间，桌面助手应该：
>
> 1. 启动时如果没有 workspace，主进程立即进入 onboarding focus。
> 2. daily care 自动提醒、welcome 文案、idle 随机文案都先让路。
> 3. Quest 启动 `onboarding.workspace.create` purpose，但不调用 LLM，也不直接弹创建窗口。
> 4. 角色挥手，并定时用气泡提示"你还没有建立工作空间哦，点这里立即创建吧。"
> 5. 气泡保留"立即创建/去创建"按钮；用户点击按钮后打开或聚焦创建窗口。
> 6. 创建过程中角色走到 `workspaceWizard` 窗口旁边陪同。
> 7. 创建窗口打开期间，角色说固定辅助介绍：工作空间的作用、快速创建/默认目录可以先开始。
> 8. 如果用户关掉向导但没有创建，角色马上提示"还没有创建"，继续展示去创建按钮。
> 9. 用户创建成功 → 清掉引导气泡，角色播 celebrate 动画，说"恭喜完成！现在右键我可以做更多了"。
> 10. 发奖励：XP +20、好感度 +3、成就 `first-workspace`，且奖励 source 幂等。
> 11. 同一任务会出现在任务列表窗口里，展示当前状态、进度和奖励；未完成时可从任务列表点击“开始引导/继续引导”。

这个流程是固定新手任务，不属于 AI 目标规划生成。创建工作空间只是第一种 Quest，后续新手任务沿用同一模式：固定前置条件、固定启动方式、固定 preset routine、固定完成事件、固定奖励。

`workspace.create` 的启动方式是启动期自动检测：命中 `APP_STARTED` 后，如果没有 workspace 且任务未完成，QuestEngine 自动启动引导。任务列表和未来 AI 也可以显式启动它，但显式启动仍会先检查是否已经创建过 workspace。

## 2. Quest 定义

```ts
import type { OnboardingQuestDefinition } from './types';

export const workspaceCreateQuest: OnboardingQuestDefinition = {
  id: 'workspace.create',
  title: '建立你的第一个工作空间',
  description: '为 Chobits 选择一个用来放资源/文件/对话历史的工作目录。',
  category: 'onboarding',

  precondition: {
    id: 'no-workspace-exists',
    evaluate: async () => {
      const count = await countWorkspaces();
      return count <= 0;
    }
  },

  completion: {
    id: 'workspace-created-event',
    evaluate: async (ctx) => {
      if (ctx.event === 'WORKSPACE_CREATED') return true;
      const count = await countWorkspaces();
      return count > 0;
    }
  },

  triggerEvents: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED', 'APP_STARTED'],
  autoStartEvents: ['APP_STARTED'],
  explicitStartSources: ['task-list', 'ai', 'recommendation'],
  retriable: true,
  retryEvents: ['APP_STARTED'],

  recommendation: {
    questId: 'first-file-drop',
    delayMs: 5000,
    prompt: '要不要接着试试把第一个文件拖给我？',
    confirmLabel: '继续'
  },

  toPurposeRequest: () => ({
    kind: 'onboarding.workspace.create',
    presetId: 'onboarding.workspace.create',
    title: '引导创建工作空间',
    reason: '首次使用，未检测到工作空间',
    source: 'system-event',
    priority: 70,
    interruptPolicy: 'urgent',
    coalesceKey: 'onboarding.workspace.create',
    plannerMode: 'preset-only'
  }),

  reward: {
    xp: 20,
    favor: 3,
    achievementId: 'first-workspace'
  },
  rewardSource: 'quest:workspace.create'
};
```

## 2.1 任务列表展示

`workspace.create` 在 `questList` 窗口中作为第一条新手引导任务展示：

- 分类：`onboarding`
- 标题：`创建你的第一个工作空间`
- 描述：`建立资源、文件、对话和记忆索引的基础空间。`
- 奖励：XP +20、好感 +3、成就 `first-workspace`
- 未开始：显示“开始引导”
- 进行中：显示“继续引导”
- 已完成：隐藏操作按钮，显示完成状态

任务列表按钮不会裸开 `workspaceWizard`。它调用 `quest:start({ id: 'workspace.create' })`，由 QuestEngine 检查是否仍需要引导，再启动 `onboarding.workspace.create` preset-only purpose。右键菜单等需要 workspace 的入口也不会自己查完后裸开向导，而是复用 preset goal `workspace.exists`：未达成时启动同一个 Quest 并阻断原动作。这样从任务窗口或业务入口触发都会保持气泡按钮、角色走到窗口旁、窗口讲解、关闭未创建后继续提示和成功奖励的完整固定流程。

## 3. Preset Routine

放在 `packages/sprite-core/quest/onboarding-presets.ts`（或直接合入 `routine-presets.ts`）：

```ts
import { getCharacterRoutineText } from '../messages/character';
import type { SpritePurpose, SpriteRoutineStep } from '../purpose/types';

export function createWorkspaceCreateRoutineSteps(_: SpritePurpose): SpriteRoutineStep[] {
  return [
    { id: 'attention-wave', type: 'playAnimation', trigger: 'wave', durationMs: 1200, waitFor: 'duration', silent: true },
    {
      id: 'invite-notice',
      type: 'showNotice',
      messageId: 'onboarding.workspace.create.invite',
      content: getCharacterRoutineText('onboarding.workspace.create.invite', undefined, '先创建工作空间吧'),
      level: 'info',
      persistent: true,
      buttons: [{ id: 'focus-wizard', label: '立即创建', variant: 'default', purposeAction: 'open-wizard' }],
      speak: true
    },
    {
      id: 'workspace-onboarding-loop',
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: 'WORKSPACE_CREATED',
      maxDurationMs: 30 * 60 * 1000,
      assignTo: 'workspaceCreatedEvent',
      body: [
        {
          id: 'wait-create-bubble-event',
          type: 'loopUntil',
          source: 'purpose-event',
          untilEvent: ['bubble:action', 'bubble:dismissed'],
          match: { messageId: 'onboarding.workspace.create.invite' },
          maxDurationMs: 30 * 60 * 1000,
          assignTo: 'workspaceBubbleEvent',
          ignoreHistory: true,
          body: [{ id: 'wait-create-bubble-event-pause', type: 'wait', durationMs: 1000 }]
        },
        {
          id: 'handle-bubble-event',
          type: 'branch',
          by: 'workspaceBubbleEvent.event.event',
          cases: {
            'bubble:action': [
              {
                id: 'open-wizard-after-click',
                type: 'branch',
                by: 'workspaceBubbleEvent.event.payload.purposeAction',
                cases: {
                  'open-wizard': [
                    { id: 'clear-invite-after-click', type: 'clearMessage', messageId: 'onboarding.workspace.create.invite', messageType: 'notice' },
                    { id: 'open-wizard', type: 'openWindow', window: 'workspaceWizard', timeoutMs: 10000 },
                    {
                      id: 'guide-near-wizard',
                      type: 'parallel',
                      body: [
                        { id: 'walk-near-wizard', type: 'walkTo', target: { window: 'workspaceWizard', placement: 'right', offset: 16 }, speed: 130, timeoutMs: 10000 },
                        {
                          id: 'await-wizard-result',
                          type: 'loopUntil',
                          source: 'app-event',
                          untilEvent: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED'],
                          ignoreHistory: true,
                          maxDurationMs: 30 * 60 * 1000,
                          assignTo: 'workspaceWizardResult',
                          body: [
                            {
                              id: 'speak-workspace-intro',
                              type: 'speak',
                              text: getCharacterRoutineText('onboarding.workspace.create.workspace-intro', undefined, '工作空间会存放所有重要的数据。'),
                              bubbleDuration: 5200,
                              cooldownKey: 'onboarding.workspace.create.workspace-intro',
                              cooldownMs: 5 * 60 * 1000
                            },
                            { id: 'workspace-intro-breath', type: 'wait', durationMs: 800 },
                            {
                              id: 'speak-workspace-quickstart-tip',
                              type: 'speak',
                              text: getCharacterRoutineText('onboarding.workspace.create.quickstart-tip', undefined, '快速开始会默认创建到文档中'),
                              bubbleDuration: 4200,
                              cooldownKey: 'onboarding.workspace.create.quickstart-tip',
                              cooldownMs: 5 * 60 * 1000
                            },
                            { id: 'await-wizard-result-pause', type: 'wait', durationMs: 1000 }
                          ]
                        }
                      ]
                    },
                    {
                      id: 'wizard-result-branch',
                      type: 'branch',
                      by: 'workspaceWizardResult.event.event',
                      cases: {
                        WORKSPACE_WIZARD_CLOSED: [
                          {
                            id: 'closed-without-create',
                            type: 'showNotice',
                            messageId: 'onboarding.workspace.create.invite',
                            content: getCharacterRoutineText('onboarding.workspace.create.closed-without-create', undefined, '还没有创建工作空间哦。'),
                            level: 'warning',
                            persistent: true,
                            buttons: [{ id: 'focus-wizard', label: '去创建', variant: 'default', purposeAction: 'open-wizard' }],
                            speak: true
                          }
                        ]
                      },
                      default: []
                    }
                  ]
                },
                default: []
              }
            ],
            'bubble:dismissed': [
              { id: 'dismissed-mandatory-reprompt-pause', type: 'wait', durationMs: 5_000 },
              {
                id: 'invite-notice-after-dismiss',
                type: 'showNotice',
                messageId: 'onboarding.workspace.create.invite',
                content: getCharacterRoutineText('onboarding.workspace.create.invite', undefined, '先创建工作空间吧'),
                level: 'info',
                persistent: true,
                buttons: [{ id: 'focus-wizard', label: '立即创建', variant: 'default', purposeAction: 'open-wizard' }],
                speak: true
              }
            ]
          },
          default: []
        }
      ]
    },
    {
      id: 'branch-result',
      type: 'branch',
      by: 'workspaceCreatedEvent.event.event',
      cases: {
        WORKSPACE_CREATED: [
          { id: 'clear-invite-notice', type: 'clearMessage', messageId: 'onboarding.workspace.create.invite', messageType: 'notice' },
          { id: 'play-celebrate', type: 'playAnimation', trigger: 'celebrate', durationMs: 1400, waitFor: 'duration', silent: true },
          {
            id: 'speak-done',
            type: 'speak',
            text: getCharacterRoutineText('onboarding.workspace.create.done', undefined, '工作空间建好啦！我可以做更多事情啦。'),
            bubbleDuration: 3600
          }
        ]
      },
      default: []
    }
  ];
}
```

## 4. 完成判定与奖励

- **完成事件**：`app-event` `WORKSPACE_CREATED`（已在 [electron/main/handlers/workspace/](../../electron/main/handlers/workspace/) 发出）
- **QuestEngine 行为**：
  ```ts
  EventBus.on('app-event:WORKSPACE_CREATED', async () => {
    if (activeQuestId === 'workspace.create') {
      setOnboardingFocus(false); // 恢复 daily care 与 welcome/behavior 环境发言
      mgr.emitPurposeEvent({ source: 'app-event', event: 'WORKSPACE_CREATED', payload: data });
      await persona.grantReward({
        xp: 20,
        favor: 3,
        achievementId: 'first-workspace',
        source: 'quest:workspace.create'
      });
      onboardingState.completedQuests.push('workspace.create');
      onboardingState.activeQuestId = undefined;
      tick(); // 触发后续 quest
    }
  });
  ```
- **幂等**：`grantReward` 入参 `source: 'quest:workspace.create'`，主进程在写入前查 `personaState.claimedRewards`，已存在则直接返回。
- **成功反馈**：routine 也等待同一个 `WORKSPACE_CREATED` purpose event，因此创建成功时可以清掉 notice、播放庆祝反馈并说恭喜文案；QuestEngine 只负责任务状态和奖励。
- **窗口陪同讲解**：点击创建后先清掉邀请 notice，避免按钮气泡压住说明文字；`await-wizard-result` 开始等待后，角色说工作空间用途和快速创建提示。普通台词气泡只展示当前台词，台词之间用 routine `wait` 控制节奏。这两段话有 5 分钟冷却，窗口持续打开时不会每秒重复，但关闭未创建后仍会继续回到强制创建提示。

## 5. 右键菜单守卫（关联 UI 改动）

quest 完成前 `wsList.length === 0`，[handleContextMenu](../../src/features/sprite-assistant/AIAssistant.tsx#L131) 直接 `return`，不弹菜单。完成后自然解禁。

## 6. 可选事件

| 事件                                  | 在哪里发                                                                                                           | 为什么需要                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `WORKSPACE_WIZARD_CLOSED` (app-event) | [src/pages/WorkspacePage/WorkspaceWizard.tsx](../../src/pages/WorkspacePage/WorkspaceWizard.tsx) 非成功 unmount 时 | 让 active routine 立刻提示"还没有创建"，并继续展示去创建按钮；也可继续扩展漏斗分析 |

当前关键完成路径只依赖 `WORKSPACE_CREATED`；关闭窗口不判定完成。`WORKSPACE_WIZARD_CLOSED` 不负责重新启动 quest，而是被当前 routine 消费，马上回到提示按钮。`APP_STARTED` 只用于跨启动恢复 active quest。

| `bubble:action` (purpose-event) | [src/features/sprite-assistant/message/MessageContext.tsx](../../src/features/sprite-assistant/message/MessageContext.tsx) 的 notice 按钮点击 | 解锁 routine，打开/聚焦 `workspaceWizard` |
| `bubble:dismissed` (purpose-event) | 同一消息层在用户手动关闭 notice 时派发 | 让 routine 知道气泡已不在；如果仍未创建，短暂缓冲后继续展示。关闭气泡不是放弃任务，气泡打开期间才不重复提示 |

## 6.1 已有 workspace 的开发机测试

不要删除本机已有 workspace 来测试这条链路。设置页提供一个手动入口：

```ts
window.YUA.sprite.startPurpose({
  kind: 'onboarding.workspace.create',
  presetId: 'onboarding.workspace.create',
  source: 'manual',
  priority: 72,
  interruptPolicy: 'urgent',
  coalesceKey: `workspace-onboarding-preset-test:${Date.now()}`,
  plannerMode: 'preset-only'
});
```

这个入口只验证 preset routine 的表现层：展示引导气泡、按钮打开/聚焦 `workspaceWizard`、角色走到窗口旁、窗口打开期间讲解工作空间作用和快速创建方式、关闭未创建后继续提示、等待 `WORKSPACE_CREATED` 后清理气泡并庆祝。它不会修改 `onboardingState`，也不会授予 `quest:workspace.create` 奖励。

## 7. 文案 i18n

新增 i18n key（位置：[src/features/sprite-assistant/message/catalog/zh-CN.ts](../../src/features/sprite-assistant/message/catalog/zh-CN.ts) + 对应 routine-text）：

```ts
'onboarding.workspace.create.invite': '先创建工作空间吧',
'onboarding.workspace.create.workspace-intro': '工作空间会存放所有重要的数据。',
'onboarding.workspace.create.quickstart-tip': '快速开始会默认创建到文档中',
'onboarding.workspace.create.done': '工作空间建好啦！我可以做更多事情啦。',
'onboarding.workspace.create.closed-without-create': '还没有创建工作空间哦。'
```

## 8. 测试用例

- ✅ 应用启动 → `useWorkspaceCheck` 不直接弹窗 → main-process QuestEngine 启动 `workspace.create` purpose
- ✅ 无 workspace → 启动期进入 onboarding focus，daily care / welcome / behavior 环境发言被压制
- ✅ Quest startPurpose → 启动固定 preset-only purpose，不调用 AI planner，不直接弹创建窗口
- ✅ 首次展示创建提示气泡和按钮；气泡仍打开时不重复提示、不重复朗读
- ✅ 用户关闭创建提示气泡但仍未创建 → 短暂缓冲后继续重新展示按钮，直到创建完成
- ✅ 点击"立即创建"按钮 → 打开/重新聚焦 `workspaceWizard`
- ✅ 创建过程中角色走到 `workspaceWizard` 旁边
- ✅ `workspaceWizard` 打开期间 → 角色解释工作空间作用，并提示可用快速创建/默认目录开始
- ✅ 已有 workspace 的开发机 → 设置页“工作空间引导预设”可直接执行现有 preset，无需删除真实空间
- ✅ 关闭窗口但未创建 → active routine 立刻提示并继续展示去创建按钮
- ✅ active 但未完成且重启应用 → `APP_STARTED` 会重新派发引导
- ✅ 任务列表窗口展示 `workspace.create` 状态、奖励和操作按钮
- ✅ 点击任务列表“开始引导/继续引导” → 走 `QuestEngine.startQuest`，不绕过固定 routine
- ✅ 创建成功 → grantReward 发放一次，重复触发 WORKSPACE_CREATED 不重复发奖
- ✅ 创建成功 → routine 收到 `WORKSPACE_CREATED`，清理 notice 并播放庆祝反馈
- ✅ 右键菜单在 quest 完成前被阻断；完成后正常工作

## 9. 实现 checklist

- [x] [packages/sprite-core/purpose/types.ts](../../packages/sprite-core/purpose/types.ts) 增加 `showNotice` / `clearMessage` step
- [x] [packages/sprite-core/purpose/routine-runner.ts](../../packages/sprite-core/purpose/routine-runner.ts) 实现 routine handler
- [x] [src/features/sprite-assistant/message/MessageContext.tsx](../../src/features/sprite-assistant/message/MessageContext.tsx) 桥接按钮 → purpose-event，并支持重新聚焦 wizard
- [x] `packages/sprite-core/quest/` 新建：types、registry、engine、onboarding-presets
- [x] preferences schema 增加 `onboardingState`
- [x] persona-state 增加 `claimedRewards` + `grantReward` 幂等
- [x] [src/hooks/useWorkspaceCheck.ts](../../src/hooks/useWorkspaceCheck.ts) 改为 no-op，由 main-process Quest 接管
- [x] [src/features/sprite-assistant/AIAssistant.tsx](../../src/features/sprite-assistant/AIAssistant.tsx) `handleContextMenu` 加 workspace 守卫
- [x] 启动期 onboarding focus gate 阻止 daily care 自动派发
- [x] active 未完成时按 `APP_STARTED` 重试，避免跨启动静默卡住
- [x] AI 目标规划设置页增加 `onboarding.workspace.create` preset 手动执行入口
- [x] `WORKSPACE_WIZARD_CLOSED` purpose event 由 routine 即时消费，未创建时继续展示去创建按钮；后续仍可扩展漏斗分析
- [x] `walkTo` 支持 `{ window, placement, offset }` 目标，创建时角色可走到窗口旁
- [x] onboarding purpose 使用 `plannerMode: 'preset-only'`，不受 AI planner 开关影响
- [x] 独立 `questList` 窗口展示新手任务、奖励和状态
- [x] `quest:list` / `quest:start` IPC 支持任务列表读取与显式启动 Quest
- [x] 测试：onboarding quest、persona reward 幂等、daily care gate
