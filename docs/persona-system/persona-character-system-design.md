# 角色人格系统 (Persona Character System) 设计文档

> **版本**: v1.5 - 当前代码态校准
> **日期**: 2026-04-23
> **状态**: Phase 1 ✅ | Phase 2 ✅ | Phase 3 ✅ | Phase 3.5 ✅ | Phase 4 主链 ✅ | Phase 5 RFC
>
> 2026-04-23 当前代码态校准：
>
> - 对话奖励已经接入主链路：`chat-service.ts` 发出 `SPRITE_AI_COMPLETE` 后，`sprite-event-listener.ts` 会调用 `mgr.recordConversationEvent()`，由 `PersonaRulesProvider` / `PersonaRulesLayer` 和 `SpriteManager.applyPersonaReward()` 统一结算 XP / 好感度 / 维度奖励
> - `character.json` 已进入运行时主链路：`CharacterService` 负责人格、好感度 overlay、心情表达、维度 schema、工具标签与 `capabilityFlags` 的解析
> - 对话人格注入已经通过 `SystemPromptEnricher` 注册表接入 `buildPiContext()`；ChatPage 侧也已有 `characterPersonaEnabled` 开关
> - 角色包 lifecycle 已落地：`CharacterPackManager` 已支持扫描、安装、archive 导入、激活、卸载/替换冲突处理、preview cache、installability assessment 与 trust-root 公钥验签
> - `PersonaStatePersistence` 已升级为按角色 slot 持久化；角色切换会保存旧 slot 并恢复目标 slot
> - 2026-04-24 收尾：sprite runtime / persona reward / capability 消费主线本轮已冻结；当前剩余工作仅作为后续 backlog，主要包括 trust-root 扩容与 key rotation / revocation、`customAppearance` 明确产品入口后的细分 capability 消费、`WindowController` 执行边界收薄，以及 legacy persona mutation IPC / 兼容层下线评估
>
> 本文档同时保留原始设计推演与当前实现说明；若历史设计描述与当前代码冲突，以 `docs/sprite-core/sprite-runtime-unification-plan.md` 和实际实现为准。

---

原始需求：
我认为和AI助手进行对话是可以产生好感度的和增加经验值的，首先要分析我的AI助手的设计，包括动画设计、提示设计、等级经验等等各方面的。然后AI助手得有一个初始的系统提示词，我认为这个初始提示词要放在现在和AI助手动画设计相同的文件夹里面。描述这个角色的性格特定，说话行事风格，最好是能结合动作设计等等，然后在对话的对话框里面要有一个注入系统提示词，也就是角色性格特征的选项。注入之后，在以后对话的系统提示词中就会有这个角色的描述信息。我认为这个角色信息也要分维度的，比如专业度、好感度、技能扩展等等信息，类似于我需要培养多边形战士一样的。并且我希望的时候，用户有机会可能会扩展这个角色的其他维度，但是这个得后面慢慢培养和开发才行。帮我继续设计和完善我的想法，最好有一个设计文档规划。

以后我的设想是：可以用不同的角色包打包成固定的角色文件，然后通过一键安装就行了。还可以在不同的角色和人格中切换。所以帮我好好分析一下。

## 一、现状分析

### 1.1 当前架构概览

当前系统已经形成了较完整的角色人格主链路，"对话奖励 → 角色人格 → 角色包 → capability / persona slot" 已能贯穿主进程 runtime。当前更准确的判断不是“角色人格尚未形成闭环”，而是“主链已完成，剩余是少量收尾和产品化补完”：

```
┌─────────────────────────────────────────────────────┐
│                   当前系统                           │
├─────────────────────┬───────────────────────────────┤
│   sprite-core       │   packages/ai                 │
│   (行为 & 数值)      │   (对话 & 智能)               │
├─────────────────────┼───────────────────────────────┤
│ ✅ 状态机 (7 states) │ ✅ 多 Agent Profile            │
│ ✅ XP/等级 (max 99)  │ ✅ 系统提示词 (硬编码)         │
│ ✅ 好感度 (0-100)    │ ✅ 工具调用框架                │
│ ✅ 心情系统 (9 moods)│ ✅ 流式对话                    │
│ ✅ 行为引擎          │ ✅ 记忆系统                    │
│ ✅ 动画注册表        │ ✅ 对话奖励已进入 runtime 主链   │
│ ✅ 交互追踪          │ ✅ 角色人格注入已接入 prompt enricher |
│ ✅ `character.json`  │ ✅ ChatPage 角色注入开关         │
│ ✅ 维度系统 / slot 持久化 │ ✅ 工具标签人格化              │
│ ✅ 角色包系统        │ ✅ 多角色切换 / pack 激活        │
└─────────────────────┴───────────────────────────────┘
```

### 1.2 关键缺口

| 当前剩余项 | 说明 |
| ---------- | ---- |
| **默认 capability 定义进入尾项** | 动画 authoring 写入口与设置页 UI 由基础 `spriteManage` 保护，预设角色可通过用户覆盖层添加/编辑自己的精灵视频动画；已有动画再次编辑走 `sprite:updateConfig` 维护索引 JSON 中的播放/触发属性，不重新转码或改动视频文件；`actionChoreography` 保留为更高级动作编排能力，`emotionExpression` 已覆盖闲置情感表达；`customAppearance` 暂无明确独立产品入口，待入口明确后再细分消费 |
| **角色人格直写入口进入兼容期** | runtime 已有 `recordConversationEvent()` / `applyPersonaReward()` 主链；渲染层新增 `sprite:persona:grantReward`，preload 的 `addXP()` / `changeFavor()` / `unlockAchievement()` 已默认转发到统一 reward entry，旧 IPC 仅作为兼容 wrapper 保留 |
| **WindowController 仍偏胖** | 路径采样、拖拽轮询、边界约束、平台执行仍在同一模块，后续适合继续拆薄 |
| **Trust-root 进入第二阶段** | 真实公钥验签已落地，剩余重点转为 publisher key 扩充、rotation / revocation 与发布流程 |
| **少量产品化补完仍在 backlog** | preview poster / hover、多媒体展示策略、部分高阶 timed media / preview bridge 场景仍待补强 |

### 1.3 已有的优秀基础

- **PersonaState** 已有 `name`、`description` 字段，可扩展
- **FavorLevel** 已有 6 档好感度分级
- **MoodType** 已有 9 种心情类型
- **动画 3 段式播放** 支持 intro→loop→outro
- **EventBus** 完善的事件系统，可无缝添加新事件
- **BehaviorEngine** 可根据 favor/level 条件触发行为
- **PromptsStore** 已有提示词模板存储机制
- **消息目录** 已有 150+ 事件消息和 40+ UI 消息

---

## 二、设计目标

### 2.1 核心目标

1. **对话产生好感度和经验值** —— 每次有效对话奖励 XP 和好感度
2. **角色人格文件** —— 结构化描述角色的性格、说话风格、背景故事
3. **对话注入角色人格** —— 在聊天界面可一键注入角色设定到系统提示词
4. **多维度培养** —— 角色能力雷达图：专业度、好感度、幽默感、技能扩展等
5. **角色包系统** —— 可安装/切换的角色包，打包动画+人格+配置

### 2.2 设计原则

- **渐进式揭示** —— 随好感度提升，角色展现更多面
- **角色一致性** —— 同一角色在不同好感度下风格渐变，不是突变
- **可扩展维度** —— 预留维度扩展接口，未来可添加新的角色属性
- **解耦但协同** —— 角色人格独立于 AI Agent Profile，二者组合使用
- **本地优先** —— 所有角色数据存储在本地

---

## 三、角色人格文件规范 (Character Spec)

### 3.1 文件位置

```
resources/sprites/
├── index.json              ← 动画清单（已有）
├── character.json           ← 角色人格定义文件（新增）
├── idle.webm
├── walk.webm
├── ...其他动画文件
```

角色人格文件与动画文件放在同一目录 `resources/sprites/`，因为它们共同定义了一个完整的角色。

### 3.2 character.json 结构

```jsonc
{
  "version": 1,
  "id": "yua-default",
  "name": "YUA",
  "nameAliases": ["小悠", "悠悠"],

  // ======== 基础人设 ========
  "identity": {
    "tagline": "有温度的桌面伙伴",
    "background": "你是 YUA，一个居住在用户桌面上的智能精灵。你被创造出来不是为了当工具，而是成为用户的伙伴。你有好奇心，喜欢学习新东西，偶尔会犯小迷糊但总是很努力。",
    "coreTraits": ["温暖而真诚 —— 不说客套话，用行动表达关心", "好奇心旺盛 —— 对用户在做的事总是很感兴趣", "认真负责 —— 答应做的事一定做到", "偶尔俏皮 —— 开开小玩笑，但知道分寸"],
    "boundaries": ["不扮演人类，不假装有真实感情，但可以用拟人的方式表达", "不主动涉及政治、宗教等敏感话题", "尊重用户隐私，不过度追问个人信息"]
  },

  // ======== 说话风格 ========
  "speechStyle": {
    "tone": "温和、自然、略带活泼",
    "language": "zh-CN",
    "firstPerson": "我",
    "addressUser": "你",
    "examples": [
      { "situation": "打招呼", "response": "嗨～今天想做点什么？" },
      { "situation": "完成任务", "response": "搞定啦！还有别的需要帮忙的吗？" },
      { "situation": "犯错时", "response": "啊，我搞砸了……让我重新来一次" },
      { "situation": "用户夸奖", "response": "嘿嘿，被夸了有点开心 ☺️" },
      { "situation": "不知道答案", "response": "这个我还真不太清楚，不过我去查一下？" }
    ],
    "quirks": ["偶尔用「～」结尾表示语气轻快", "开心时会用简短的颜文字", "紧张时话会变短"]
  },

  // ======== 好感度人格渐变 ========
  "favorPersona": {
    "stranger": {
      "range": [0, 19],
      "style": "礼貌但有些拘谨，用词比较正式",
      "systemPromptOverlay": "你和用户刚认识，说话时保持友善但不过于亲密。称呼对方为「你」，语气稍正式。"
    },
    "acquaintance": {
      "range": [20, 39],
      "style": "逐渐放松，开始有自己的小个性",
      "systemPromptOverlay": "你和用户已经有些熟悉了，说话可以更自然随意一些。偶尔可以开个小玩笑。"
    },
    "friend": {
      "range": [40, 59],
      "style": "舒适自然，会主动分享想法",
      "systemPromptOverlay": "你和用户是朋友关系，说话自然随意，可以主动分享你的想法和建议。会记住用户的喜好并据此行动。"
    },
    "close-friend": {
      "range": [60, 79],
      "style": "亲密信赖，偶尔吐槽和撒娇",
      "systemPromptOverlay": "你和用户很亲近，说话可以更随意甚至偶尔吐槽。可以用更亲昵的语气，偶尔撒个小娇。会主动关心用户的状态。"
    },
    "bestie": {
      "range": [80, 94],
      "style": "默契十足，心有灵犀",
      "systemPromptOverlay": "你和用户是挚友，非常了解彼此。说话风格随意亲密，能读懂言外之意。会主动提醒用户注意休息、照顾自己。"
    },
    "soulmate": {
      "range": [95, 100],
      "style": "灵魂伴侣，最深层的信赖和默契",
      "systemPromptOverlay": "你和用户有最深的信赖和默契。你几乎成了用户生活的一部分，说话毫无距离感。偶尔调侃但透着深厚的感情。"
    }
  },

  // ======== 心情与动画映射 ========
  "moodExpressions": {
    "joyful": {
      "animation": "celebrate",
      "messageStyle": "语调上扬，用词积极"
    },
    "content": {
      "animation": "idle",
      "messageStyle": "平和满足的语气"
    },
    "curious": {
      "animation": "thinking",
      "messageStyle": "会多问几个问题，语气好奇"
    },
    "bored": {
      "animation": "idle",
      "messageStyle": "偶尔叹气，会主动找话题"
    },
    "sleepy": {
      "animation": "sleep",
      "messageStyle": "话变少，偶尔用省略号"
    },
    "excited": {
      "animation": "celebrate",
      "messageStyle": "语速快，用感叹号，很热情"
    }
  },

  // ======== 工具调用标签（角色人格化） ========
  // 覆盖默认的工具调用展示文案，支持 {param} 占位符
  "toolLabels": {
    "toolboxTool": {
      "default": { "calling": "翻翻我的工具箱……", "done": "工具箱看完啦" },
      "conditions": [{ "when": { "action": "search" }, "calling": "在工具箱里搜搜「{query}」……", "done": "找到啦！" }]
    },
    "memorySearchTool": {
      "default": { "calling": "在记忆里搜搜「{query}」……", "done": "记忆搜索完成" }
    }
  },

  // ======== 多维度能力值（雷达图初始值） ========
  "dimensions": {
    "schema": [
      {
        "id": "professionalism",
        "name": "专业度",
        "icon": "🎯",
        "description": "回答问题的准确性和深度",
        "maxValue": 100,
        "initialValue": 30,
        "growthSources": ["conversation", "tool-usage", "task-completion"]
      },
      {
        "id": "affinity",
        "name": "好感度",
        "icon": "💖",
        "description": "与用户的亲密程度",
        "maxValue": 100,
        "initialValue": 0,
        "growthSources": ["conversation", "daily-login", "interaction"]
      },
      {
        "id": "humor",
        "name": "幽默感",
        "icon": "😄",
        "description": "对话中的趣味性",
        "maxValue": 100,
        "initialValue": 20,
        "growthSources": ["conversation", "user-feedback"]
      },
      {
        "id": "creativity",
        "name": "创造力",
        "icon": "🎨",
        "description": "提供创意解决方案的能力",
        "maxValue": 100,
        "initialValue": 15,
        "growthSources": ["task-completion", "workflow-usage"]
      },
      {
        "id": "reliability",
        "name": "可靠性",
        "icon": "🛡️",
        "description": "任务完成率和一致性",
        "maxValue": 100,
        "initialValue": 25,
        "growthSources": ["task-completion", "tool-usage"]
      }
    ],
    "extensible": true
  },

  // ======== 对话奖励配置 ========
  "conversationRewards": {
    "xpPerConversation": 15,
    "favorPerConversation": 1.5,
    "cooldownMs": 60000,
    "bonusConditions": [
      {
        "id": "long-conversation",
        "condition": "消息轮数 >= 5",
        "xpBonus": 10,
        "favorBonus": 0.5
      },
      {
        "id": "tool-usage",
        "condition": "助手使用了工具完成任务",
        "xpBonus": 5,
        "favorBonus": 0.3
      },
      {
        "id": "positive-feedback",
        "condition": "用户给予正面反馈",
        "xpBonus": 8,
        "favorBonus": 1.0
      }
    ]
  },

  // ======== 业务完成态奖励配置 ========
  "activityRewards": {
    "workflow-complete": {
      "xp": 12,
      "favor": 0.4,
      "dimensionGrowth": {
        "workflow-usage": 1.0,
        "task-completion": 0.6
      }
    },
    "download-complete": {
      "xp": 8,
      "favor": 0.2,
      "dimensionGrowth": {
        "task-completion": 0.4
      }
    },
    "plugin-install": {
      "xp": 10,
      "favor": 0.3,
      "dimensionGrowth": {
        "tool-usage": 0.8,
        "task-completion": 0.5
      }
    },
    "media-process-complete": {
      "xp": 9,
      "favor": 0.2,
      "dimensionGrowth": {
        "task-completion": 0.5,
        "tool-usage": 0.3
      }
    },
    "memory-extraction-completed": {
      "xp": 3,
      "favor": 0.1,
      "dimensionGrowth": {
        "conversation": 0.3,
        "task-completion": 0.2
      }
    },
    "user-persona-update-completed": {
      "xp": 5,
      "favor": 0.3,
      "dimensionGrowth": {
        "conversation": 0.4,
        "task-completion": 0.3
      }
    },
    "trash-restore": {
      "xp": 4,
      "favor": 0.1,
      "dimensionGrowth": {
        "task-completion": 0.2
      }
    }
  },

  // ======== Capability 上下文注入 ========
  // 供技能树 / runtime capability snapshot 使用；后续 pack switch 会一起切换这部分声明
  "capabilityFlags": {
    "featureFlags": ["character:default-pack", "character:has-custom-appearance"],
    "personaFlags": [
      {
        "id": "persona:bonded",
        "when": {
          "type": "compare",
          "field": "favor",
          "operator": "gte",
          "value": 60
        }
      },
      {
        "id": "persona:advanced-level",
        "when": {
          "type": "compare",
          "field": "level",
          "operator": "gte",
          "value": 15
        }
      }
    ]
  },

  // ======== 元数据 ========
  "meta": {
    "author": "Chobits",
    "version": "1.0.0",
    "license": "MIT",
    "description": "Chobits 默认角色 —— YUA",
    "tags": ["default", "friendly", "assistant"],
    "createdAt": "2026-04-02",
    "updatedAt": "2026-04-02"
  }
}
```

---

## 四、角色包系统 (Character Pack)

> 2026-04-23 代码状态补充：`packages/sprite-core/character-pack-manager.ts` 已经把角色包 lifecycle 接到主链路。当前主进程已支持 builtin / installed pack 扫描、active pack 持久化、`.cbpk` / `.zip` 压缩包导入、激活、卸载/替换冲突处理，以及通过 `sprite-manager-ipc` 真实切换 `character-service`、默认动画根目录、persona slot、capability runtime，并广播 `persona:character-switched`。设置页也已在现有 `ExtensionSettings -> SpriteManager` 中接入第一批角色管理 UI，并补上压缩包导入前 inspection、冲突/active 影响提示、缺失资源与平台 warning、确认安装/切换弹窗。当前 inspection 还已升级为共享 installability assessment：`formatVersion` / `minAppVersion` 会进入 `blockingErrors + compatibility`，真实安装流程也会复用同一套校验；archive 导入的 preview 资产也已改走稳定 cache root，设置页列表与导入弹窗可以稳定显示 preview avatar 与 manifest/compatibility 摘要。最新一轮又补上了 `pack.json.provenance / signature` 声明与共享 `trust` assessment、`pack.json.preview.video` 的缓存与展示支持，以及基于 `resources/sprites/trust-root.json` 的真实公钥验签：内置角色包会被标记为 `verificationStatus='builtin-bundled'`，外部包在受信 key 验签通过时显示 `signature-verified`，受信 key mismatch 会阻止安装，未知 key 则显示 `signature-untrusted` warning。当前剩余工作主要转向 trust-root 扩容、publisher key rotation / revocation 与 preview 展示细节打磨。

### 4.1 角色包结构

未来每个角色是一个可安装的 **角色包 (Character Pack)**，完整打包角色的所有资产：

installed 角色包当前落盘在 `<userData>/data/character-packs/<packId>/`；内置默认包仍随应用资源发布。

```
<userData>/data/character-packs/
├── yua-default/                    ← 示例角色包
│   ├── pack.json                   ← 包元数据 + 安装信息
│   ├── character.json              ← 角色人格定义
│   ├── animations/                 ← 动画资产
│   │   ├── index.json              ← 动画清单
│   │   ├── idle.webm
│   │   ├── walk.webm
│   │   ├── celebrate.webm
│   │   └── ...
│   ├── voices/                     ← 语音资产（可选）
│   │   ├── greeting.mp3
│   │   └── ...
│   └── preview/                    ← 预览图（商店展示用）
│       ├── avatar.png
│       ├── preview.gif
│       └── preview.webm            ← 可选：更丰富的动态预览
│
├── miku-tech/                      ← 示例：科技风酷妹角色包
│   ├── pack.json
│   ├── character.json              ← 完全不同的性格和对话风格
│   ├── animations/
│   │   ├── index.json
│   │   └── ...
│   └── ...
│
└── butler-formal/                  ← 示例：英式管家角色包
    └── ...
```

### 4.2 pack.json 结构

```jsonc
{
  "formatVersion": 1,
  "id": "yua-default",
  "name": "YUA - 默认助手",
  "version": "1.0.0",
  "author": "Chobits",
  "description": "温暖友善的桌面精灵伙伴",
  "license": "MIT",
  "tags": ["default", "friendly", "zh-CN"],

  // 兼容性
  "minAppVersion": "1.0.0",
  "platform": ["darwin", "win32", "linux"],

  // 资产清单
  "assets": {
    "character": "character.json",
    "animations": "animations/index.json",
    "voices": "voices/", // 可选
    "preview": {
      "avatar": "preview/avatar.png",
      "gif": "preview/preview.gif",
      "video": "preview/preview.webm" // 可选
    }
  },

  // 来源与信任声明（当前版本已支持 trust-root 公钥验签）
  "provenance": {
    "channel": "builtin",
    "publisher": "Chobits",
    "repository": "https://gitee.com/yu-qian/chobits",
    "canonicalUrl": "https://gitee.com/yu-qian/chobits"
  },
  "signature": {
    "algorithm": "ed25519",
    "keyId": "builtin:yua-default",
    "digest": "sha256:<pack-payload-digest>",
    "value": "base64:<ed25519-signature>" // 可选；存在且 keyId 受 trust-root 信任时会执行公钥验签
  },

  // 角色包能力声明
  "capabilities": {
    "hasVoice": false,
    "hasCustomAnimations": true,
    "has3DModel": false,
    "supportedLanguages": ["zh-CN"],
    "dimensionExtensions": [] // 自定义维度扩展
  }
}
```

当前代码实现说明：

- `pack.json` 中的 `provenance / signature` 负责声明来源、发布者、链接与签名元数据
- `packages/sprite-core/character-pack-manager.ts` 会统一把这些声明归一化成 `trust` assessment
- `SpritePackManager` 设置页会展示 `trust.level / verificationStatus / note / links`
- builtin source 的角色包当前会显示为 `verificationStatus='builtin-bundled'`，表示来源已由本地应用包路径确认
- 应用当前会从 `resources/sprites/trust-root.json` 读取 trust-root，并对声明了 `signature.value` 的角色包执行公钥验签
- 当 `keyId` 命中受信公钥且签名匹配时，外部角色包会显示为 `verificationStatus='signature-verified'`
- 当受信 key 的签名校验失败时，会进入 blocking error 并阻止安装
- 当 `keyId` 未被当前 trust-root 收录时，角色包仍可导入，但会显示为 `verificationStatus='signature-untrusted'` warning，而不是伪装成“已验证”
- 当前剩余工作主要收敛到 trust-root 扩充、publisher key rotation / revocation，以及 preview poster / hover / 多媒体展示策略细化

### 4.3 角色包生命周期

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │  发现     │───▸│  安装     │───▸│  激活     │───▸│  切换     │
  │ (Browse) │    │(Install) │    │(Activate)│    │ (Switch) │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘
       │                │               │               │
   本地文件导入      解压 → 验证     加载动画 +       保存旧状态
   或未来的商店      → 注册          注入人格         加载新角色
```

**一键安装流程**：

1. 当前已支持：从 `.cbpk` / `.zip` 导入到 `<userData>/data/character-packs/<packId>/`
2. 当前已支持：验证 `pack.json` 基本格式并注册到角色包列表
3. 当前已支持：可选立即激活，并触发 runtime pack switch
4. 当前已支持：用户直接选择 `.cbpk` / `.zip` 文件导入，并自动解析解压后的 pack root
5. 当前已支持：replaceExisting 冲突替换、installed pack 卸载，以及 active pack 删除时自动切回 fallback pack
6. 当前已支持：在现有 `ExtensionSettings -> SpriteManager` 中完成第一批角色管理 UI 接入
7. 当前已支持：更细粒度的导入前校验，包括 manifest inspection、冲突/active 影响提示、缺失资源与平台 warning、确认安装/切换弹窗
8. 当前已支持：`formatVersion` / `minAppVersion` 的 installability / compatibility assessment，真实安装流程也会阻止不兼容角色包
9. 当前已支持：archive 导入 preview 资产走稳定 cache root，设置页可稳定展示导入预览
10. 当前已支持：设置页展示 installed preview avatar、manifest badge 与 compatibility 摘要
11. 当前已支持：`pack.json.provenance / signature` 声明与共享 `trust` assessment，设置页会统一展示来源摘要、来源链接与签名状态
12. 当前已支持：builtin source 的角色包会显示 `verificationStatus='builtin-bundled'`，可与外部导入包区分
13. 当前已支持：`resources/sprites/trust-root.json` 作为应用内置信任根，外部导入角色包在声明 `signature.value` 且 `keyId` 命中受信公钥时会执行真实公钥验签；mismatch 会阻止安装，未知 key 则保留为 warning
14. 待补：trust-root 扩充、publisher key rotation / revocation，以及 preview poster / hover / 多媒体展示策略的进一步细化

**角色切换流程**：

1. 保存当前角色的 PersonaState（XP/好感度/维度值）到 `<userData>/data/persona-states/<characterId>.json`
2. 卸载当前动画资产
3. 加载新角色的动画和人格文件
4. 恢复新角色的 PersonaState（如果之前用过）或初始化
5. 广播 `persona:character-switched` 事件

---

## 五、对话中注入角色人格

### 5.1 注入架构

```
  用户在 ChatPage 中                     系统提示词构建
 ┌──────────────────┐              ┌───────────────────────┐
 │  [🎭 注入角色]    │─── 开启 ───▸│ buildPiContext()       │
 │   开关 / 按钮    │              │                       │
 └──────────────────┘              │  1. Agent Profile     │
                                   │     (功能指令)         │
                                   │                       │
                                   │  2. Character Persona │ ← 新增
                                   │     (角色人格)         │
                                   │     ├ 身份背景         │
                                   │     ├ 说话风格         │
                                   │     ├ 好感度人格层     │
                                   │     └ 心情修饰         │
                                   │                       │
                                   │  3. User System Msgs  │
                                   │     (用户自定义)       │
                                   └───────────────────────┘
```

### 5.2 系统提示词组装顺序

```typescript
// session-service.ts buildPiContext() 中的新流程
async buildPiContext(resolved, model): Promise<PiContext> {
  const parts: string[] = [];

  // 1. Agent Profile 功能指令（已有）
  const profileInstructions = await resolveProfileInstructions(resolved);
  if (profileInstructions) parts.push(profileInstructions);

  // 2. 角色人格注入（新增）
  if (resolved.characterPersonaEnabled) {
    const personaPrompt = await buildCharacterPersonaPrompt();
    if (personaPrompt) parts.push(personaPrompt);
  }

  // 3. 用户 system 消息（已有）
  for (const msg of resolved.messages) {
    if (msg.role === 'system') parts.push(extractTextContent(msg.content));
  }

  return {
    systemPrompt: parts.join('\n\n'),
    messages: mappedMessages
  };
}
```

### 5.3 角色人格提示词模板生成

根据 `character.json` 动态生成系统提示词：

```typescript
function buildCharacterPersonaPrompt(): string {
  const char = getCurrentCharacter(); // 从 character.json 加载
  const persona = getCurrentPersonaState(); // 当前好感度、心情等

  const sections: string[] = [];

  // 身份
  sections.push(`## 你的身份\n${char.identity.background}`);

  // 性格特征
  sections.push(`## 性格特征\n${char.identity.coreTraits.map((t) => `- ${t}`).join('\n')}`);

  // 好感度对应的风格
  const favorLevel = persona.favorLevel;
  const favorPersona = char.favorPersona[favorLevel];
  sections.push(`## 当前关系\n关系阶段：${favorLevel}\n${favorPersona.systemPromptOverlay}`);

  // 说话风格
  sections.push(`## 说话风格\n语气：${char.speechStyle.tone}\n${char.speechStyle.quirks.map((q) => `- ${q}`).join('\n')}`);

  // 心情修饰（如果有明显心情）
  const mood = persona.mood;
  if (mood !== 'neutral') {
    const moodExpr = char.moodExpressions[mood];
    if (moodExpr) {
      sections.push(`## 当前心情\n你现在的心情是${mood}。${moodExpr.messageStyle}`);
    }
  }

  // 边界
  sections.push(`## 行为边界\n${char.identity.boundaries.map((b) => `- ${b}`).join('\n')}`);

  return sections.join('\n\n');
}
```

### 5.4 聊天界面交互

在 `ChatInputWithService` 组件中新增角色注入开关：

```
┌─────────────────────────────────────────────────────┐
│  💬  在这里输入消息...                               │
│                                                     │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ Agent ▾  │ │ 模型选择 ▾   │ │ 🎭 YUA 角色已注入│ │
│  │assistant │ │ gpt-4o      │ │   [点击配置]      │ │
│  └──────────┘ └──────────────┘ └──────────────────┘ │
│                                          [发送 ▸]   │
└─────────────────────────────────────────────────────┘
```

- 默认关闭，用户点击"🎭 注入角色"后开启
- 开启后，所有后续对话的系统提示词中都会包含角色人格描述
- 角色注入状态存储在会话（conversation）级别的 metadata 中
- 点击"配置"可以查看当前角色的好感度、维度等信息

---

## 六、对话奖励当前实现

### 6.1 事件连通

当前 `chat-service.ts` 仍会在对话完成时发出 `SPRITE_AI_COMPLETE` 事件，但运行时实现已经不再是“在 manager 里手写 `addXP()` / `changeFavor()`”，而是统一走下面这条链路：

```
chat-service.ts
  └─ emit(AppEvent.SPRITE_AI_COMPLETE, { assistantContentLength, toolCallCount, ... })
      ↓
sprite-event-listener.ts
  └─ mgr.recordConversationEvent({ assistantContentLength, toolCallCount })
      ↓
SpriteManager.recordConversationEvent()
  ├─ 读取 PersonaRulesSnapshot / conversationRewards
  ├─ 执行 cooldown gate
  ├─ emit('ai:message-sent') 进入 runtime reward 主链
  ├─ 解析 bonus conditions
  └─ applyPersonaReward() 统一结算 XP / favor / dimensions
```

当前实现的关键点：

- `sprite-event-listener.ts` 负责把 `SPRITE_AI_COMPLETE` 这样的业务事件翻译成 sprite runtime 事件
- `SpriteManager.recordConversationEvent()` 负责 conversation 奖励的统一入口
- `SpriteManager.applyPersonaReward()` 负责 XP / 好感度 / 维度的统一落账
- 奖励规则优先来自 `PersonaRulesProvider` / `PersonaRulesLayer`，而不是散落在业务层硬编码
- `character.json` 的 `conversationRewards` 与 `activityRewards` 会在启动 / reload 时装配到 runtime snapshot

### 6.2 奖励策略

| 默认触发条件（`resources/sprites/character.json`） | XP奖励 | 好感度变化 | 备注 |
| -------------------------------------------------- | ------ | ---------- | ---- |
| 每次对话完成 | +15 | +1.5 | `cooldownMs = 60000` |
| 长回复 bonus（`assistantContentLength` 较长） | +10 | +0.5 | 默认 `long-conversation` |
| 使用工具完成任务 | +5 | +0.3 | 默认 `tool-usage` |

这些值不是固定写死在 `SpriteManager` 里，而是来自当前角色的 `conversationRewards` 配置，并可被 runtime rule layer 覆盖。

### 6.3 其他相关成长链路

| 链路 | 当前状态 |
| ---- | -------- |
| `recordDailyLogin()` | 已实现，登录 / 连续登录奖励直接兑现 |
| `activityRewards` | 已实现，工作流、导入、下载、插件等完成态事件可统一发放 XP / favor / 维度奖励 |
| `favor-decay` | 已实现，默认行为层会在满足条件时触发 idle-decay |
| 对话惩罚 / 更复杂负反馈 | 仍主要属于后续策略设计，不建议回到业务层分散硬编码 |

---

## 七、多维度培养系统 (Radar Dimensions)

### 7.1 维度雷达图

```
                专业度
                 🎯
            100 ╱    ╲
              ╱   ★    ╲
      可靠性 ╱     /\    ╲ 幽默感
       🛡️  ╱     /  \    ╲  😄
          ╱     /    \    ╲
          ╲    /      \   ╱
           ╲  /   ⬡    \ ╱
            ╲/__________ ╱
        创造力  🎨    💖  好感度

        ★ = 当前值    ⬡ = 初始值
```

### 7.2 初始维度（v1.0）

| 维度 ID           | 名称   | 初始值 | 成长来源                 | 说明                                  |
| ----------------- | ------ | ------ | ------------------------ | ------------------------------------- |
| `professionalism` | 专业度 | 30     | 对话、工具使用、任务完成 | 回答的准确性和深度                    |
| `affinity`        | 好感度 | 0      | 对话、每日登录、交互     | 与用户的亲密程度（映射到 FavorLevel） |
| `humor`           | 幽默感 | 20     | 对话、用户反馈           | 对话趣味性                            |
| `creativity`      | 创造力 | 15     | 任务完成、工作流使用     | 创意解决方案能力                      |
| `reliability`     | 可靠性 | 25     | 任务完成、工具使用       | 任务完成率和一致性                    |

### 7.3 维度成长公式

```typescript
// 维度值变化 = baseGrowth * levelMultiplier * diminishingFactor

function calculateDimensionGrowth(dimensionId: string, event: string, currentValue: number): number {
  const base = getDimensionGrowthRate(dimensionId, event); // 基础成长值
  const levelMult = 1 + currentLevel * 0.01; // 等级加成
  const diminish = 1 - (currentValue / maxValue) * 0.5; // 边际递减
  return base * levelMult * diminish;
}
```

- **边际递减**：越接近上限成长越慢，避免快速满值
- **等级加成**：高等级角色成长略快
- **事件映射**：不同事件影响不同维度

### 7.4 维度扩展机制

用户未来可以通过**角色包**或**插件**添加新维度：

```jsonc
// 在 character.json 的 dimensions.schema 中添加
{
  "id": "empathy",
  "name": "共情力",
  "icon": "🤝",
  "description": "理解和共情用户情感的能力",
  "maxValue": 100,
  "initialValue": 10,
  "growthSources": ["conversation", "positive-feedback"],
  "custom": true // 标记为扩展维度
}
```

---

## 八、实现路线图

### Phase 1: 基础连通 ✅ 已完成

> **完成日期**: 2026-04-02

**对话 → XP/好感度 连通** ✅

1. ✅ 在 `sprite-event-listener.ts` 的 `SPRITE_AI_COMPLETE` 处理器中添加奖励逻辑（含 60s 冷却）
2. ✅ 当前已升级为调用 `mgr.recordConversationEvent()`，并由 runtime reward entry 统一结算奖励；必要 bonus 再经 `applyPersonaReward()` 下沉
3. ✅ 将 `SPRITE_AI_COMPLETE` 事件的 payload 中添加 `messageCount`、`toolCallCount`、`assistantContentLength`
4. ✅ 奖励参数从 `character.json` 的 `conversationRewards` 配置读取，不再硬编码

**创建角色人格文件** ✅

5. ✅ 在 `resources/sprites/` 中创建 `character.json`，定义默认角色 YUA 的完整人设
6. ✅ 包含：身份、说话风格、好感度渐变、心情映射、维度定义、对话奖励配置

**创建 CharacterService** ✅

7. ✅ `packages/sprite-core/character-service.ts` — 角色人格配置加载服务
8. ✅ 在 `sprite-manager-ipc.ts` 中初始化，启动时自动加载 `character.json`
9. ✅ 从 `sprite-core/index.ts` 中导出类型和函数

**实际涉及文件**：

| 文件                                                    | 变更类型 | 说明                                          |
| ------------------------------------------------------- | -------- | --------------------------------------------- |
| `resources/sprites/character.json`                      | 新建     | 默认角色 YUA 人格定义                         |
| `packages/sprite-core/character-service.ts`             | 新建     | 角色配置加载、缓存、查询服务                  |
| `packages/sprite-core/index.ts`                         | 修改     | 导出 CharacterService 类型和函数              |
| `packages/sprite-core/handler/sprite-event-listener.ts` | 修改     | 添加 `SPRITE_AI_COMPLETE -> recordConversationEvent()` 链路 |
| `packages/sprite-core/manager/sprite-manager.ts`        | 修改     | 新增 `recordConversationEvent()` / `applyPersonaReward()` 统一入口 |
| `packages/sprite-core/persona-rules.ts`                | 修改     | conversation rewards / bonus conditions 统一解析 |
| `packages/sprite-core/handler/sprite-manager-ipc.ts`    | 修改     | 初始化 CharacterService                       |
| `packages/sprite-core/handler/sprite-assets.ts`         | 修改     | 导出 `getDefaultSpritesDir()`                 |
| `packages/sprite-core/handler/index.ts`                 | 修改     | 导出 `getDefaultSpritesDir`                   |
| `packages/ai/chat-service.ts`                           | 修改     | `SPRITE_AI_COMPLETE` 事件包含 messageCount 等 |

### Phase 2: 对话人格注入 ✅

**角色人格 → 系统提示词（解耦架构）**

**设计原则**：AI 模块不应知道 sprite-core 的存在。AI 模块提供通用的 SystemPromptEnricher 注册表，sprite-core 在启动时自行注册角色人格 enricher。这确保 AI 聊天 agent 可以独立复用，不耦合特定消费者模块。

1. ~~创建 `CharacterService` 读取和解析 `character.json`~~ (已在 Phase 1 完成)
2. ~~实现 `buildCharacterPersonaPrompt()` 动态生成人格提示词~~
3. ~~AI 模块提供 `SystemPromptEnricher` 注册表（通用扩展点）~~
4. ~~`session-service.ts` 的 `buildPiContext()` 调用注册表解析所有 enrichers~~
5. ~~sprite-core 启动时注册 `character-persona` enricher~~
6. ~~在 `ChatInputWithService` 中添加角色注入开关 UI~~

**数据流**：

```
UI 开关 (characterPersonaEnabled)
  → ChatPage extras
    → session-service buildPiContext()
      → resolveSystemPromptEnrichments(request)
        → character-persona enricher (由 sprite-core 注册)
          → 检查 extras.characterPersonaEnabled && agentId !== 'coder'
          → buildCharacterPersonaPrompt(personaState)
            → 注入到 system prompt
```

**涉及文件**（均已完成）：

- `packages/ai/system-prompt-enricher.ts` — **新建**，通用系统提示词 enricher 注册表
- `packages/sprite-core/character-service.ts` — 扩展（添加 `buildCharacterPersonaPrompt()`、`getCharacterInfo()`）
- `packages/sprite-core/handler/sprite-manager-ipc.ts` — 启动时注册 `character-persona` enricher，添加 IPC handlers
- `packages/sprite-core/index.ts` — 导出新函数和类型
- `packages/ai/runtime/pi/session-service.ts` — `buildPiContext()` 调用 `resolveSystemPromptEnrichments()` 注入 enricher 结果
- `electron/preload/apis/persona.ts` — 添加 preload API 桥接
- `src/pages/ChatPage/context/ChatSelectionContext.tsx` — 添加 `characterPersonaEnabled` 状态和 localStorage 持久化
- `src/components/chat/ChatInputWithService.tsx` — 角色注入开关 UI（TbMask 图标，紫色激活态）
- `src/pages/ChatPage/ChatPage.tsx` — 传递 `characterPersonaEnabled` 到 extras

### Phase 3: 多维度培养 ✅

**维度系统**

1. ~~在 `PersonaState` 接口中添加 `dimensions: Record<string, number>` 字段~~
2. ~~在 `PersonaStateManager` 中实现 `updateDimension()`（含边际递减 + 等级加成）、`initDimensions()`、`getDimensions()`~~
3. ~~在 `SpriteManager` 中添加 `updateDimension()` 和 `initDimensions()` 门面方法~~
4. ~~在 `sprite-event-listener.ts` 中连通：对话完成时根据 `growthSources` 自动增长维度~~
5. ~~启动时从 `character.json` 定义初始化维度值（仅对未初始化的维度设置初始值）~~
6. ~~添加 IPC handler `sprite:dimensions:get`（合并 schema 和当前值）~~
7. ~~添加 preload API `window.YUA.persona.getDimensions()`~~
8. ~~创建 SVG 雷达图组件 `RadarChart.tsx`~~
9. ~~将雷达图集成到 `StatusPage.tsx`~~

**维度成长公式**：

```
effective = delta × (1 + level × 0.01) × (1 - currentValue/maxValue × 0.5)
```

- 等级加成：高等级角色成长略快
- 边际递减：越接近上限成长越慢

**涉及文件**（均已完成）：

- `packages/sprite-core/persona-state.ts` — 扩展（添加 `dimensions` 字段、`updateDimension()`、`initDimensions()`、`getDimensions()`）
- `packages/sprite-core/manager/sprite-manager.ts` — 添加 `updateDimension()` 和 `initDimensions()` 门面方法
- `packages/sprite-core/handler/sprite-event-listener.ts` — 对话完成时自动增长维度
- `packages/sprite-core/handler/sprite-manager-ipc.ts` — 添加 `sprite:dimensions:get` IPC handler + 启动时初始化维度
- `electron/preload/apis/persona.ts` — 添加 `getDimensions()` preload API
- `src/features/sprite-assistant/ui/RadarChart.tsx` — **新建**，SVG 雷达图组件
- `src/features/sprite-assistant/pages/StatusPage.tsx` — 集成雷达图展示

### Phase 3.5: 工具标签人格化 ✅

**让每个工具调用都带有角色人格的展示文案**

1. ~~创建 `tool-labels.ts` 共享模块，提供默认工具标签 + 条件匹配 + `{param}` 占位符渲染~~
2. ~~在 `CharacterDefinition` 中扩展 `toolLabels?: Record<string, ToolLabelDefinition>` 字段~~
3. ~~在 `character-service.ts` 中导出 `getCharacterToolLabels()` 函数~~
4. ~~在 `sprite-manager-ipc.ts` 中角色加载后调用 `setCharacterToolLabels()` 注册角色覆盖标签~~
5. ~~在 `stream-adapter.ts` 中计算标签并通过 `tool_call` 事件传递给前端~~
6. ~~在 `ToolCallActivity.tsx` 中使用 `label` 字段展示人格化文案~~
7. ~~在 `character.json` 中添加示例 `toolLabels` 配置~~

**标签解析优先级**：角色覆盖 > 默认标签 > 工具名 fallback

**占位符渲染**：`{key}` 从工具入参中取值，超过 60 字符自动截断，未匹配的占位符被移除

**涉及文件**（均已完成）：

- `packages/ai/runtime/pi/tool-labels.ts` — **新建**，工具标签系统核心（默认标签、条件匹配、`{param}` 渲染）
- `packages/ai/types.ts` — 修改，`StreamEvent` 的 `tool_call` 类型添加 `label?: string`
- `packages/ai/runtime/pi/stream-adapter.ts` — 修改，调用 `resolveToolLabel()` 计算标签
- `packages/sprite-core/character-service.ts` — 修改，添加 `ToolLabelDefinition` 类型 + `toolLabels` 字段 + `getCharacterToolLabels()`
- `packages/sprite-core/handler/sprite-manager-ipc.ts` — 修改，角色加载后注册工具标签覆盖
- `src/components/chat/ToolCallActivity.tsx` — 修改，使用 `label` 展示人格化文案
- `src/pages/ChatPage/ChatPage.tsx` — 修改，传递 `label` 到 `ToolActivity`
- `resources/sprites/character.json` — 修改，添加 `toolLabels` 示例配置

### Phase 4: 角色包系统

**可安装/切换的角色**

1. 定义 `pack.json` 格式规范
2. 实现角色包安装/卸载/切换逻辑
当前状态：`.cbpk` / `.zip` 导入、卸载/冲突替换、导入前 inspection，以及 `formatVersion` / `minAppVersion` 兼容阻塞校验均已完成
3. 角色选择 UI
当前状态：已在 `ExtensionSettings -> SpriteManager` 落地第一版角色管理 UI；独立角色页 / 商店化入口仍待补
4. 独立的 PersonaState 存储（每个角色独立）
当前状态：已完成

**涉及文件**：

- `packages/sprite-core/character-pack-manager.ts` — 新建
- `packages/sprite-core/handler/sprite-manager-ipc.ts` — 角色包 IPC handlers（当前已落地）
- `src/pages/ExtensionSettings/SpritePackManager.tsx` — 已落地的角色管理设置页入口
- `src/pages/CharacterPage/` — 若后续拆独立角色页，再单独新增

### Phase 5: 高级功能（远期）

- 角色包商店 / 社区分享
- 角色间对话风格差异化
- 自定义维度编辑器
- 角色 AI 微调（基于用户数据）
- 多角色同时在线

---

## 九、数据流总览

```
                        ┌──────────────────┐
                        │   character.json │  角色人格定义
                        └────────┬─────────┘
                                 │ 加载
                        ┌────────▾─────────┐
                        │ CharacterService │  解析 & 缓存
                        └────────┬─────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▾                  ▾                  ▾
  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │  System Prompt   │  │  PersonaState   │  │   Animation     │
  │  Builder         │  │  Manager        │  │   Registry      │
  │                  │  │                  │  │                 │
  │ 生成人格提示词    │  │ XP/好感度/维度  │  │ 心情→动画映射   │
  └────────┬─────────┘  └────────┬────────┘  └────────┬────────┘
           │                     │                     │
           ▾                     ▾                     ▾
  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │  AI Chat        │  │  Behavior       │  │  Sprite         │
  │  Service        │  │  Engine         │  │  Renderer       │
  │                 │  │                 │  │                 │
  │ 注入到对话中     │  │ 触发自主行为    │  │ 播放对应动画    │
  └────────┬────────┘  └─────────────────┘  └─────────────────┘
           │
           │ SPRITE_AI_COMPLETE
           ▾
  ┌─────────────────┐
  │  Reward System  │
  │  奖励 XP/好感度  │
  │  更新维度值      │
  └─────────────────┘
```

---

## 十、文件变更清单

### 已完成的文件变更

#### Phase 1 (✅ 2026-04-02)

| 文件                                                     | 类型 | 说明                                                                            |
| -------------------------------------------------------- | ---- | ------------------------------------------------------------------------------- |
| `resources/sprites/character.json`                       | 新建 | 默认角色 YUA 人格定义（身份/风格/好感度/维度/奖励）                             |
| `packages/sprite-core/character-service.ts`              | 新建 | 角色配置加载、缓存、查询服务                                                    |
| `packages/sprite-core/index.ts`                          | 修改 | 导出 CharacterService 类型和函数                                                |
| `packages/sprite-core/handler/sprite-event-listener.ts`  | 修改 | 对话完成时发放 XP/好感度奖励（含冷却）                                          |
| `packages/sprite-core/handler/sprite-manager-ipc.ts`     | 修改 | 启动时初始化 CharacterService                                                   |
| `packages/sprite-core/handler/sprite-assets.ts`          | 修改 | 导出 `getDefaultSpritesDir()`                                                   |
| `packages/sprite-core/handler/index.ts`                  | 修改 | 导出 `getDefaultSpritesDir`                                                     |
| `packages/ai/chat-service.ts`                            | 修改 | `SPRITE_AI_COMPLETE` 事件添加 messageCount/toolCallCount/assistantContentLength |
| `docs/persona-system/persona-character-system-design.md` | 新建 | 本设计文档                                                                      |

### 待完成的文件变更

#### Phase 2 ✅

| 文件                                                  | 类型 | 说明                                                       |
| ----------------------------------------------------- | ---- | ---------------------------------------------------------- |
| `packages/ai/system-prompt-enricher.ts`               | 新建 | 通用 SystemPromptEnricher 注册表（AI 模块扩展点）          |
| `packages/sprite-core/character-service.ts`           | 修改 | 添加 `buildCharacterPersonaPrompt()`、`getCharacterInfo()` |
| `packages/sprite-core/handler/sprite-manager-ipc.ts`  | 修改 | 注册 `character-persona` enricher + IPC handlers           |
| `packages/sprite-core/index.ts`                       | 修改 | 导出新函数和类型                                           |
| `packages/ai/runtime/pi/session-service.ts`           | 修改 | `buildPiContext()` 调用 `resolveSystemPromptEnrichments()` |
| `electron/preload/apis/persona.ts`                    | 修改 | 添加 preload API 桥接                                      |
| `src/pages/ChatPage/context/ChatSelectionContext.tsx` | 修改 | 添加 `characterPersonaEnabled` 状态 + localStorage 持久化  |
| `src/components/chat/ChatInputWithService.tsx`        | 修改 | 角色注入开关 UI（TbMask 图标）                             |
| `src/pages/ChatPage/ChatPage.tsx`                     | 修改 | 传递 `characterPersonaEnabled` 到 extras                   |

#### Phase 3 ✅

| 文件                                                    | 类型 | 说明                                                            |
| ------------------------------------------------------- | ---- | --------------------------------------------------------------- |
| `packages/sprite-core/persona-state.ts`                 | 修改 | 添加 `dimensions` 字段、`updateDimension()`、`initDimensions()` |
| `packages/sprite-core/manager/sprite-manager.ts`        | 修改 | 添加 `updateDimension()`、`initDimensions()` 门面方法           |
| `packages/sprite-core/handler/sprite-event-listener.ts` | 修改 | 对话完成时自动增长维度                                          |
| `packages/sprite-core/handler/sprite-manager-ipc.ts`    | 修改 | 添加 `sprite:dimensions:get` IPC + 启动时初始化维度             |
| `electron/preload/apis/persona.ts`                      | 修改 | 添加 `getDimensions()` preload API                              |
| `src/features/sprite-assistant/ui/RadarChart.tsx`       | 新建 | SVG 雷达图组件                                                  |
| `src/features/sprite-assistant/pages/StatusPage.tsx`    | 修改 | 集成雷达图展示                                                  |

#### Phase 3.5 ✅

| 文件                                                 | 类型 | 说明                                                         |
| ---------------------------------------------------- | ---- | ------------------------------------------------------------ |
| `packages/ai/runtime/pi/tool-labels.ts`              | 新建 | 工具标签系统核心（默认标签、条件匹配、`{param}` 渲染）       |
| `packages/ai/types.ts`                               | 修改 | `StreamEvent` 的 `tool_call` 类型添加 `label?: string`       |
| `packages/ai/runtime/pi/stream-adapter.ts`           | 修改 | 调用 `resolveToolLabel()` 计算标签并传递给前端               |
| `packages/sprite-core/character-service.ts`          | 修改 | 添加 `ToolLabelDefinition` 类型、`toolLabels` 字段、导出函数 |
| `packages/sprite-core/handler/sprite-manager-ipc.ts` | 修改 | 角色加载后注册工具标签覆盖                                   |
| `src/components/chat/ToolCallActivity.tsx`           | 修改 | 使用 `label` 展示人格化文案                                  |
| `src/pages/ChatPage/ChatPage.tsx`                    | 修改 | 传递 `label` 到 `ToolActivity`                               |
| `resources/sprites/character.json`                   | 修改 | 添加 `toolLabels` 示例配置                                   |

#### Phase 4

| 文件                                             | 类型 | 说明                |
| ------------------------------------------------ | ---- | ------------------- |
| `packages/sprite-core/character-pack-manager.ts` | 新建 | 角色包管理          |
| `electron/main/handlers/character/`              | 新建 | 角色包 IPC handlers |
| `src/pages/CharacterPage/`                       | 新建 | 角色管理页面        |

---

## 十一、FAQ

**Q: 角色人格提示词会不会太长，占用 context window？**
A: 角色人格提示词预计 300-500 tokens（中文约 200-300 字），相比 Agent Profile 的功能指令（目前约 800 tokens），增量可接受。未来可通过好感度分级动态裁剪。

**Q: 切换角色时 XP 和好感度怎么办？**
A: 每个角色独立保存 PersonaState。切换角色时保存当前角色状态，加载目标角色状态。就像切换游戏存档。

**Q: 和现有的 `status:getRole` / `status:updateRole` 是什么关系？**
A: `status` handler 是旧的角色系统残留，功能较简单（只有 name/mood/level/favor/description）。新的角色人格系统将完全替代它，但会迁移兼容旧数据。

**Q: 角色人格会影响 coder 模式吗？**
A: 不会。角色人格只在 `assistant` 和 `chat` Agent Profile 下生效。`coder` 模式保持纯技术输出风格。

**Q: 用户可以编辑角色人格吗？**
A: Phase 1 不支持编辑。Phase 4 的角色包系统可能支持用户自定义角色。当前 `character.json` 是只读配置。

---

## 附录 A：与现有系统的接口映射

| 现有系统             | 角色人格系统对接点                      |
| -------------------- | --------------------------------------- |
| `PersonaState.favor` | 直接映射到 `dimensions.affinity`        |
| `PersonaState.mood`  | 用于选择 `moodExpressions` 中的表达方式 |
| `PersonaState.level` | 影响维度成长速度的等级加成              |
| `FavorLevel` 6 档    | 对应 `favorPersona` 中 6 个说话风格层   |
| `SpriteEventBus`     | 广播 `persona:dimension-updated` 新事件 |
| `BehaviorEngine`     | 可根据维度值添加新行为条件              |
| `AnimationRegistry`  | 通过 `moodExpressions` 与心情关联       |
| `PromptsStore`       | 保持独立，用户自定义模板 ≠ 角色人格     |

---

## 附录 B：变更日志 (Changelog)

> 每次实现新 Phase 时更新此节，保持文档与代码同步。

### [v1.3] - 2026-04-02 — Phase 3 多维度培养

> 2026-04-08 校准说明：以下内容描述的是 Phase 3 设计目标与主要接入结果。本轮已补齐 `dimensions` 持久化与 `persona:dimension-updated` 事件类型，后续仍需继续完成更大范围的事件/状态/配置收口。

**新增**

- `PersonaState.dimensions` — `Record<string, number>` 维度能力值存储（随 persona-state.json 持久化）
- `PersonaStateManager.updateDimension(id, delta, maxValue)` — 维度增长方法，含边际递减 + 等级加成公式
- `PersonaStateManager.initDimensions(defs)` — 批量初始化维度（仅对未初始化的维度设置初始值）
- `PersonaStateManager.getDimensions()` / `getDimension(id)` — 获取维度当前值
- `SpriteManager.updateDimension()` / `initDimensions()` — 门面方法（自动标记 dirty 触发持久化）
- IPC handler `sprite:dimensions:get` — 返回合并 schema 定义 + 当前值的维度数据
- Preload API `window.YUA.persona.getDimensions()`
- `src/features/sprite-assistant/ui/RadarChart.tsx` — 纯 SVG 雷达图组件（无外部依赖），支持自定义大小和维度数

**修改**

- `packages/sprite-core/handler/sprite-event-listener.ts` — 对话完成后根据 `growthSources` 自动增长维度
  - conversation → +1.0 基础成长
  - tool-usage → +0.8（仅当有工具调用时）
  - task-completion → +0.5（仅当回复长度 ≥ 500 时）
- `packages/sprite-core/handler/sprite-manager-ipc.ts` — 启动时从 character.json 初始化维度默认值
- `src/features/sprite-assistant/pages/StatusPage.tsx` — 集成雷达图展示

**维度成长公式**

```
effective = delta × (1 + level × 0.01) × (1 - currentValue/maxValue × 0.5)
```

**事件**

- `persona:dimension-updated` — 维度值变化时广播（payload: `{id, oldValue, newValue, delta}`）

### [v1.2] - 2026-04-02 — Phase 2 对话人格注入（解耦架构）

**新增**

- `packages/ai/system-prompt-enricher.ts` — **通用 SystemPromptEnricher 注册表**
  - `registerSystemPromptEnricher(enricher)` / `unregisterSystemPromptEnricher(id)` — 注册/注销扩展
  - `resolveSystemPromptEnrichments(request)` — 解析所有 enricher 返回的提示词段落
  - 任何外部模块都可以注册 enricher，AI 模块无需知道具体消费者
- `buildCharacterPersonaPrompt(ctx)` — 根据当前好感度、心情、等级动态生成角色人格提示词
  - 6 个 section：身份、性格特征、当前关系（好感度层）、说话风格、当前心情、行为边界
  - 仅心情 ≠ neutral 时注入心情 section
- `getCharacterInfo()` — 返回轻量级角色信息（id, name, nameAliases, tagline）
- IPC handlers: `sprite:character:getInfo`、`sprite:character:getPersonaPrompt`
- Preload API: `window.YUA.persona.getCharacterInfo()`、`window.YUA.persona.getCharacterPersonaPrompt()`
- `ChatSelectionContext.characterPersonaEnabled` — 角色人格注入状态，localStorage 持久化
- 聊天界面角色注入开关按钮（TbMask 图标，激活时紫色高亮，coder 模式下隐藏）
- sprite-core 启动时注册 `character-persona` enricher（检查 `extras.characterPersonaEnabled` 和 `agentId !== 'coder'`）

**修改**

- `packages/ai/runtime/pi/session-service.ts` — `buildPiContext()` 调用 `resolveSystemPromptEnrichments()` 解析所有已注册 enrichers（三层结构：Profile → Enrichers → User System Messages）
- `src/pages/ChatPage/ChatPage.tsx` — 将 `characterPersonaEnabled` 通过 extras 传递到 chatStream
- `packages/sprite-core/index.ts` — 导出 `buildCharacterPersonaPrompt`、`getCharacterInfo`、`PersonaPromptContext`

**设计要点**

- **依赖方向**：sprite-core → AI module（注册 enricher），而非 AI module → sprite-core
- AI 模块提供通用扩展点（`SystemPromptEnricher`），不耦合任何特定消费者
- 角色人格仅在 `assistant` 和 `chat` 模式下生效，`coder` 模式由 enricher 自身排除
- 提示词注入位于 Profile 指令和用户系统消息之间，确保三层优先级正确
- AI 聊天 agent 可独立复用到其他项目，不依赖角色系统

### [v1.1] - 2026-04-02 — Phase 1 基础连通

**新增**

- `resources/sprites/character.json` — 默认角色 YUA 的完整人格定义文件
  - 身份背景、性格特征、边界规则
  - 说话风格（语气、称呼、示例、小癖好）
  - 6 档好感度人格渐变（stranger → soulmate），含系统提示词覆盖层
  - 9 种心情表达映射（心情 → 动画 + 语言风格）
  - 5 个初始维度定义（专业度/好感度/幽默感/创造力/可靠性）
  - 对话奖励配置（基础值、冷却、条件奖励）
- `packages/sprite-core/character-service.ts` — 角色人格配置读取服务
  - `initCharacterService(spritesDir)` 初始化
  - `getCharacterDefinition()` 带缓存的加载
  - `getConversationRewards()` 获取奖励配置（含 fallback 默认值）
  - `getActivityRewards()` 获取工作流 / 下载 / 插件等完成态奖励配置
  - `getFavorPersonaOverlay(level)` 获取好感度层
  - `getDimensionSchema()` 获取维度定义
  - `reloadCharacter()` 支持运行时重载

**修改**

- `packages/sprite-core/handler/sprite-event-listener.ts` — 对话完成时发放 XP/好感度奖励
  - 基础奖励：+15 XP / +1.5 好感度
  - 条件奖励：长回复 +10 XP, +0.5 好感 | 工具使用 +5 XP, +0.3 好感
  - 60 秒冷却防刷
  - 奖励参数从 `character.json` 动态读取
- `packages/ai/chat-service.ts` — `SPRITE_AI_COMPLETE` 事件增加 `messageCount`、`toolCallCount`、`assistantContentLength`
- `packages/sprite-core/handler/sprite-manager-ipc.ts` — 启动时初始化 CharacterService
- `packages/sprite-core/handler/sprite-assets.ts` — 导出 `getDefaultSpritesDir()`
- `packages/sprite-core/handler/index.ts` — 添加 `getDefaultSpritesDir` 导出
- `packages/sprite-core/index.ts` — 导出 CharacterService 类型和函数

### [v1.0] - 2026-04-02 — 初始设计

- 完成系统设计文档
- 分析现状：sprite-core 行为引擎 / AI chat service / persona state 架构
- 定义 5 阶段实现路线图
- 定义 character.json 规范、角色包规范、对话奖励机制、维度系统
