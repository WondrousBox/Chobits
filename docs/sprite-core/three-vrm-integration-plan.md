# three-vrm 桌面精灵集成实施计划

> 日期：2026-09-10
> 状态：Phase 0-4、Live2D 角色包迁移和内置三模式样本已完成；Phase 3-4 自动化验证通过，待 Electron 动态表现、Phase 5 和跨平台发布验收
> 目标版本：`@pixiv/three-vrm 3.5.x`

上游基线（2026-09-08 核验）：

- [pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- [three-vrm API 文档](https://pixiv.github.io/three-vrm/docs/)
- npm 最新稳定版：`@pixiv/three-vrm 3.5.5`、`@pixiv/three-vrm-animation 3.5.5`
- 两个包的 Three.js peer dependency 均为 `three >= 0.137`

## 0. 文档状态

本文档定义 Chobits 集成 `@pixiv/three-vrm` 的架构边界、角色包协议、运行时数据流、分阶段任务、测试范围和验收标准。

本次方案的前提不是把现有 renderer 改成单一 VRM renderer，而是让三种展示模式在同一个版本中并存：

| 产品模式 | 实现后端                                     | 本次处理                             |
| -------- | -------------------------------------------- | ------------------------------------ |
| `video`  | `VideoSprite` / HTML5 video                  | 保持现有行为和资源协议               |
| `live2d` | Cubism Web SDK + `Live2DSprite`             | 从 `main` 迁入并适配角色包契约       |
| `three`  | `ThreeSprite` 兼容入口，内部改为 `three-vrm` | 替换原占位 Three.js 场景，不删除模式 |

这里的 `three` 是产品级 renderer mode，VRM 是它的模型格式，不把 `vrm` 单独做成第四种模式。

实施进度：

- [x] Phase 0：依赖与类型版本对齐
- [x] Phase 1：角色包 3D 资源协议
- [x] Phase 2：动态渲染器路由与 VRM 静态展示
- [x] 将 `main` 的 Live2D 实现迁入当前角色包和 presentation 架构
- [x] Phase 3：VRMA 动作播放和完成事件
- [x] Phase 4：表情、眨眼、注视和基础口型
- [ ] Phase 5：角色包编辑、预览和导入校验
- [ ] Phase 6：性能、自动化测试和跨平台验收

### 0.1 Phase 0-4 实施结果

截至 2026-09-10，已完成以下代码落地：

- 已安装 `@pixiv/three-vrm 3.5.5`，并将 `three` 与 `@types/three` 对齐到 `0.170.x`。
- 已建立 `model3d + presentation + source.kind` 共享契约，以及初始状态、角色切换事件和 preload bridge 的同步链路。
- 已将编译期 renderer 开关替换为运行时 `video | live2d | three` 路由。`VideoSprite` 保留原有双 buffer 播放逻辑，`ThreeSprite` 保留公开入口并改由静态 VRM 实现。
- 已加入 VRM 路径限制、文件存在性与扩展名校验，并为 `.vrm`、`.vrma`、`.glb` 注册二进制 glTF MIME。
- 已实现透明 WebGL、MToon 所需颜色空间与灯光、自动取景、30 FPS 上限、隐藏页暂停、ResizeObserver、异步切换隔离、首帧 fail-open 和 GPU 资源释放。
- 已从 `main` 迁入 Cubism Core、Framework 和 `Live2DSprite`，并移除 renderer 对全局资源目录及角色包查询 API 的依赖。入口仍通过 `registerLive2DRenderer()` 注册，router 只消费主进程下发的 presentation。
- 已将 Mao(PRO) 封装为 `resources/character-packs/mao-pro/` 自包含 Live2D 包；模型、配置、motion、角色定义和许可说明均在包内，`source.kind` 明确为 `live2d`。
- 已安装 `@pixiv/three-vrm-animation 3.5.5`，新增 `VrmMotionController`；支持 VRMA 解析和 retarget、8 项小型 LRU cache、150ms 交叉淡化、loop/loopCount/LoopOnce、timed session 截止、动作完成事件及异步动作切换隔离。
- 已新增 `VrmExpressionController`；支持 mood/trigger 标准表情映射、2.5-6 秒随机自动眨眼、pointer LookAt、拖拽暂停、离开回中，以及基于共享 RMS 的 `aa` 口型。
- VRMA expression、blink、mouth 和 LookAt track 会生成控制掩码；动作拥有的通道优先，程序化控制只更新未被动作占用的通道。
- 已加入项目自有 `resources/character-packs/three-buddy/`：其二进制模型由 `scripts/generate-three-buddy-vrm.mjs` 可复现生成，包含 VRM 1.0 meta 和全部必需 humanoid bones；测试会用 `VRMLoaderPlugin` 实际解析该文件。
- Three Buddy 已加入由 `scripts/generate-three-buddy-vrma.mjs` 可复现生成的 `idle`、`walk`、`welcome`、`thinking` 四个 VRMA；其中 welcome/thinking 用于验证 expression 和 LookAt 动画通道仲裁。
- three 角色包导入预检会拒绝错误 source kind、缺失或非 `.vrma` 动作、越过角色包根目录的动作路径，以及无效动画索引。
- `resources/sprites/` 继续作为默认 video 包。`resources/character-packs/` 的直接子目录作为附加只读内置包发现；首次启动明确优先默认 video 包，不依赖本地化名称排序。
- 设置页不提供全局 renderer 开关。用户通过“设置 -> 精灵管理 -> 已发现角色包 -> 切换”激活角色包，展示模式由该包的 `presentation.renderer` 决定，列表会显示“视频 / Live2D / VRM 3D”标识。

### 0.2 当前验证记录

- `pnpm exec tsc --noEmit` 通过。
- `pnpm exec vite build --mode=test` 通过。
- presentation、renderer、bridge、角色包、资源协议、SpriteManager、video/Live2D/VRM 聚焦回归共 168/168 通过。
- Phase 3-4 的角色包、VRMA asset、motion controller 和 expression controller 测试共 42/42 通过。
- 本次全量 Vitest 为 1039/1059；20 个失败集中在当前分支已有的 onboarding、selected-text、scheduler、speech、默认资源 digest、event listener 和缺少 Electron mock 的断言，与 VRM/三模式聚焦改动无直接关系。聚焦回归仍保持 168/168 通过。其中 `resources/sprites/pack.json` 声明的 digest 为 `863e12c72e0b3167817580828c46e4b03e60c588c734df926282db4e5020d5aa`，当前资源实际计算值为 `fd060f23d257ee618bcd57fff67cab2616a8886c04d4e5ec4bc0fe436e619a61`，本批次不在未确认资源来源的情况下改写签名。
- Playwright 在隔离用户目录中启动 macOS Electron 构建，按 `three-buddy -> mao-pro -> yua-default` 连续切换。VRM canvas 的 CSS/backing 尺寸为 280x400/560x800，截图检测到 71,579 个非透明像素；Live2D 为 300x400/600x800，检测到 62,419 个非透明像素；切回 video 后 renderer canvas 数量为 0，页面无 error。
- 上述 Electron 记录验证的是 Phase 0-2 静态 VRM 和三模式切换；VRMA 动作观感、自动眨眼、pointer LookAt、语音口型和连续切换后的 GPU 资源计数仍需单独实机验收。
- 本次新增及核心业务变更文件 Lint error 检查通过。`SpritePackManager.tsx:386` 仍有任务开始前已存在的 `react-hooks/set-state-in-effect` 报错，本批次没有借机改写其数据刷新生命周期。
- `src/live2d-sdk/**` 是按 Live2D 授权条款 vendored 的 Cubism Core/Framework，上游源码和压缩产物不套用项目 ESLint 规则；Chobits 自有 adapter/runtime 仍正常参与 lint。
- `git diff --check` 和敏感路径扫描通过；没有数据库或 schema 变更。

## 1. 背景

实施前，桌面精灵使用 WebM 视频作为主要展示资源。主进程 `SpriteManager` 负责状态、trigger、动画候选选择、播放会话和完成后的回 idle；渲染进程 `VideoSprite` 只负责展示和播放控制。

集成开始时，`develop` 已经具备以下 3D 基础：

- `package.json` 已包含 `three`。
- `src/features/sprite-assistant/renderers/ThreeSprite.tsx` 已创建透明 Three.js 场景，但只渲染旋转方块；它是本次替换的实现入口。
- `src/features/sprite-assistant/renderers/index.ts` 已有 `video | three` 渲染模式概念，但通过编译期常量固定选择。
- `CharacterPackCapabilities` 已声明 `has3DModel`，角色包管理页也会展示 3D 标记。
- 角色包已支持安装、激活、签名校验、资源目录约束和运行时热切换。

`main` 与 `develop` 没有共同历史，Live2D 不能直接 merge。`main` 中的实现还会在 renderer 内查询 active pack，并依赖固定 `resources/characters/live2d/` 根目录；这与当前“主进程解析角色包，renderer 只消费 presentation”的边界冲突。因此本轮选择性迁入 Cubism SDK、动作、交互和口型能力，同时把资源定位改为显式角色包字段。未注册 adapter 时仍保留独立的 `live2d` 占位状态，不会降级成 video。

实施前缺少的不是 Three.js 场景本身，而是从角色包到渲染器的完整契约：

- 角色包没有声明 VRM 模型文件的位置。
- 动画资源模型默认按视频设计，不能明确表达 VRMA 动作。
- 当前 renderer 不能随激活角色包动态选择，也没有三模式兼容路由。
- `ThreeSprite` 没有模型加载、动作混合、表情、口型和完整资源释放。
- 角色包切换事件没有同步 3D presentation 配置到 `SpriteStateContext`。

## 2. 核心结论

`three-vrm` 应作为新的展示后端接入，不应成为新的业务运行时。

以下职责继续由现有系统负责：

- `SpriteManager`：状态机、trigger、行为、播放列表和播放会话。
- `AnimationRegistry`：按 trigger、优先级和 persona condition 选择动画。
- `SpritePlayCommand`：向 renderer 下发本次展示内容和播放参数。
- `WindowController`：窗口移动、行走和窗口尺寸。
- 角色包系统：模型和动作文件的安装、激活、信任及路径安全。

新增职责限制在 presentation 层：

- `RendererRouter`：选择 `VideoSprite`、现有 Live2D renderer 或 `ThreeSprite`/`VrmSprite`。
- `ThreeSprite`：保留既有模块路径和公共 props，作为 three 模式兼容 façade；VRM 实现放在其内部或由它 re-export。
- `VrmSprite`：管理 Three.js scene、camera、renderer 和首帧。
- `VrmModelLoader`：加载、优化和释放 VRM。
- `VrmMotionController`：加载 VRMA、创建 clip、交叉淡化并报告完成。
- `VrmExpressionController`：表情、眨眼、注视和口型权重。

目标数据流：

```text
角色包 pack.json
  ├─ assets.model3d -> avatar.vrm
  └─ assets.animations -> animations/index.json
                               │
SpriteState / trigger          │
          └────> AnimationRegistry
                         │
                         v
                SpritePlayCommand
                         │
                         v
                  RendererRouter
              /        |          \
       VideoSprite  Live2DSprite  ThreeSprite
                                  └─ VrmSprite
                                     ├─ VRM model
                                     ├─ VRMA motion
                                     └─ expression controllers
```

## 3. 目标

- 视频角色包保持现有行为，不要求迁移。
- Live2D 角色包保持现有行为，不要求迁移。
- 同一个构建产物同时支持 `video`、`live2d` 和 `three` 三种模式；模式切换只替换展示后端，不改变 `SpriteManager` 的 trigger、playlist、movement、persona 和完成事件语义。
- 角色包可以声明一个自包含 `.vrm` 模型。
- 激活 3D 角色包后，不重启应用即可切换到 VRM 渲染器。
- 继续复用现有 `idle`、`walk`、`talk`、`welcome`、`thinking` 等 trigger。
- 支持 `.vrma` 动作的播放、循环、交叉淡化和完成事件。
- 支持 VRM 0.x 和 VRM 1.0，由 `three-vrm` 负责规范兼容。
- 透明 Electron 窗口中正确显示 MToon 材质、头发和衣物 spring bone。
- 角色切换、窗口尺寸变化、HMR 和组件卸载后不残留 GPU 资源。
- 模型加载失败时 fail-open，不让启动出场流程永久停在等待状态。

## 4. 非目标

- 第一版不实现 VRM 模型编辑器、换装系统或骨骼编辑器。
- 第一版不支持 Mixamo FBX/BVH 的自动重定向。
- 第一版不引入 `@react-three/fiber`。当前只有单个桌面角色场景，直接管理 Three.js 生命周期更符合现有实现。
- 第一版不使用 WebGPU，继续使用 `THREE.WebGLRenderer`。
- 第一版不支持外部纹理形式的 `.gltf`；只接受自包含 `.vrm` 和 `.vrma` 二进制文件。
- 第一版不实现摄像头面捕、全身动捕或音素级识别。
- 第一版不重写 Live2D renderer，不把 Live2D motion 转换成 VRMA，也不改变其已有资源格式。
- 第一版不改变 persona、XP、好感度和 capability 数据库结构。
- 第一版不把渲染器选择做成全局用户偏好；由激活角色包和兼容的 presentation 声明决定展示后端。
- 第一版不删除 `ThreeSprite.tsx`、`VideoSprite.tsx` 或现有 Live2D 入口；允许内部重构和 façade，但保留公开导入路径或提供等价 re-export。

## 5. 依赖策略

### 5.1 依赖安装

沿用仓库目前将 renderer 构建依赖放在 `devDependencies` 的方式：

```bash
pnpm add -D @pixiv/three-vrm@3.5.5
```

接入 VRMA 时再增加：

```bash
pnpm add -D @pixiv/three-vrm-animation@3.5.5
```

Vite 会把这些 renderer 依赖打入前端 bundle，不需要加入 Electron main 的 external 列表。

### 5.2 Three.js 类型版本

当前运行时和类型版本不一致：

```text
three:        0.170.x
@types/three: 0.181.x
```

Phase 0 必须先把二者对齐。优先采用低风险方案：

```text
three:        0.170.x
@types/three: 0.170.x
```

不要为了集成 `three-vrm` 顺带升级整个 Three.js。`three-vrm 3.5.x` 的 peer dependency 是 `three >= 0.137`，当前运行时版本已经满足要求。后续升级 Three.js 应作为独立任务验证 MToon、颜色空间和 renderer 行为。

## 6. 共享领域契约

### 6.1 Renderer 类型

在 `packages/sprite-core/types.ts` 增加：

```ts
/** 产品级 renderer mode；VRM 属于 three mode 的模型格式。 */
export type SpriteRendererKind = 'video' | 'live2d' | 'three';

export type SpriteAnimationSource =
  | {
      kind?: 'video';
      src?: string;
      localPath?: string;
      type?: string;
    }
  | {
      kind: 'live2d';
      src?: string;
      localPath?: string;
      type?: string;
    }
  | {
      kind: 'three';
      localPath?: string;
      type?: 'model/vrm-animation';
    };
```

兼容规则：

- 对 generic/旧视频输入，`source.kind` 缺失时按 `video` 处理；legacy Live2D 必须先由 adapter 补成 `kind: 'live2d'`，不能让通用 fallback 把它误判成 video。
- 现有 `video` source 的字段和默认行为不变。
- `live2d` source 由现有 Live2D adapter 解释；不得把它按 video URL 或 VRMA 解析。
- `three` source 的 `localPath` 表示 VRMA 动作文件，不表示角色模型。
- `three` 动作可以不提供 `localPath`，此时展示 VRM rest pose，并允许 renderer 叠加程序化 idle。
- 不使用 MIME type 猜测 renderer，`kind` 是唯一明确判据；最终是否允许播放还要和 active presentation 做兼容性校验。

兼容性规则：

```text
presentation.renderer === 'video'  -> 只接受 video source，旧 source.kind 缺失也视为 video
presentation.renderer === 'live2d' -> 只接受 live2d source，旧 Live2D source 由 adapter normalize
presentation.renderer === 'three'  -> 只接受 three source，模型格式当前限定为 VRM/VRMA
```

source 和 presentation 不匹配时，不能把资源交给错误 renderer。应丢弃当前动作并记录可诊断 warning，继续使用当前模式的 idle/fallback；不能因为一个 VRMA 加载失败就把 Live2D 或 video 角色全局切换掉。

将以下重复的匿名 source 类型统一替换为 `SpriteAnimationSource`：

- `SpriteAnimation.source`
- `SpritePlayCommand.source`
- `AnimationEntry.source`
- renderer 资源解析函数参数

### 6.2 角色包模型资源

在 `CharacterPackAssets` 和 `ResolvedCharacterPackAssets` 增加：

```ts
export interface CharacterPackAssets {
  character?: string;
  animations?: string;
  gallery?: string;
  voices?: string;
  /** Live2D Cubism .model3.json entry, relative to the pack root. */
  live2dModel?: string;
  /** Optional Chobits trigger/canvas mapping, relative to the pack root. */
  live2dConfig?: string;
  /** Self-contained VRM model, relative to the pack root. */
  model3d?: string;
  preview?: {
    avatar?: string;
    gif?: string;
    video?: string;
  };
}
```

三个 renderer 的核心资源路径都相对角色包根目录解析。`live2dModel` 只接受 `.model3.json`，`live2dConfig` 在声明时必须是存在的 `.json` 文件，`model3d` 第一版只接受 `.vrm`。

`capabilities.has3DModel` 继续保留，但含义调整为声明 capability。运行时 renderer 选择必须同时满足：

```text
capabilities.has3DModel === true
resolvedAssets.model3d 存在
模型文件通过扩展名、路径和存在性校验
```

不能仅凭 `has3DModel` 创建 `ThreeSprite`/`VrmSprite`。

角色包可以增加可选的 presentation 声明：

```ts
export interface CharacterPackPresentationDeclaration {
  renderer?: SpriteRendererKind;
}
```

主进程按以下优先级归一化：

1. 明确的 `presentation.renderer: 'video'` 选择 video。
2. 明确的 `presentation.renderer: 'live2d'` 选择 Live2D，并从 `live2dModel/live2dConfig` 构建 presentation。
3. 明确的 `presentation.renderer: 'three'`，或 `capabilities.has3DModel === true`，选择 three 并从 `model3d` 构建 presentation。
4. 其他旧角色包保持 video。

导入时，显式 Live2D/three 缺少资源、扩展名错误或路径越界都是 blocking error。运行时若内置资源被破坏，presentation 仍保持所声明的 renderer 并省略 model，让对应组件显示缺模状态；不能静默换成其他角色的 video，也不能把 VRM 动作交给 Live2D。

### 6.3 Presentation 快照

不要把绝对模型路径写入持久化 `SpriteConfig`。增加只在 IPC/runtime 中存在的 presentation DTO：

```ts
export type SpritePresentationConfig =
  | {
      renderer: 'video';
    }
  | {
      renderer: 'live2d';
      model?: {
        localPath: string;
        type: 'model/live2d' | string;
      };
      config?: {
        localPath: string;
        type: 'application/json';
      };
    }
  | {
      renderer: 'three';
      model?: {
        localPath: string;
        format: 'vrm';
        type: 'model/vrm';
      };
      motion?: {
        format: 'vrma';
      };
      camera?: {
        targetY?: number;
        fov?: number;
        scale?: number;
        offsetX?: number;
        offsetY?: number;
      };
    };
```

`SpriteInitialState` 增加 `presentation`。角色切换时通过新的 sprite presentation 事件下发同一结构：

```ts
export const SPRITE_PRESENTATION_CHANGED_CHANNEL = 'sprite:presentation-changed';
```

主进程负责从当前 active pack 构建该 DTO；renderer 不自行拼接角色包目录。`renderer: 'three'` 的 `model.format` 是 VRM，不能改成 `renderer: 'vrm'`，这样可以保证三种产品模式的路由稳定。

### 6.4 当前内置包布局与切换入口

```text
resources/
  sprites/                         # 主内置 video 包，首次启动默认激活
  character-packs/
    mao-pro/                       # Live2D 自包含包
      pack.json
      character.json
      index.json
      live2d/live2d.json
      live2d/runtime/*.model3.json
    three-buddy/                   # three-vrm 自包含包
      pack.json
      character.json
      index.json
      models/three-buddy.vrm
```

`resources/character-packs/` 的每个直接子目录是一个附加只读内置角色包。根 video 包与附加内置包 ID 去重后再和 installed 包合并。没有持久化选择时必须按根路径选择 `resources/sprites/`，不能根据包名排序猜默认项。

运行时切换入口是“设置 -> 精灵管理 -> 已发现角色包 -> 切换”。点击后沿用现有 `activateCharacterPack` IPC，依次更新 active pack、CharacterService、animation registry 和 presentation；renderer router 根据新的 `presentation.renderer` 卸载旧组件并挂载新组件。

### 6.5 角色包示例

`pack.json`：

```json
{
  "formatVersion": 1,
  "id": "example-three-character",
  "name": "Example Three Character",
  "version": "1.0.0",
  "author": "Example Publisher",
  "description": "VRM desktop character",
  "license": "Custom",
  "tags": ["vrm", "3d"],
  "assets": {
    "character": "character.json",
    "animations": "animations/index.json",
    "model3d": "models/avatar.vrm",
    "preview": {
      "avatar": "preview/avatar.png"
    }
  },
  "presentation": {
    "renderer": "three"
  },
  "capabilities": {
    "hasCustomAnimations": true,
    "has3DModel": true,
    "supportedLanguages": ["zh-CN"]
  }
}
```

`animations/index.json`：

```json
{
  "version": 1,
  "items": [
    {
      "meta": {
        "id": "idle-three",
        "title": "Idle",
        "primaryTrigger": "idle"
      },
      "source": {
        "kind": "three",
        "localPath": "./motions/idle.vrma",
        "type": "model/vrm-animation"
      },
      "width": 240,
      "height": 360,
      "padding": 80,
      "loop": true
    },
    {
      "meta": {
        "id": "wave-three",
        "title": "Wave",
        "primaryTrigger": "welcome"
      },
      "source": {
        "kind": "three",
        "localPath": "./motions/wave.vrma",
        "type": "model/vrm-animation"
      },
      "width": 240,
      "height": 360,
      "padding": 80,
      "loop": false,
      "autoIdle": true
    }
  ]
}
```

所有写入仓库或角色包的路径必须保持相对路径。绝对路径只允许作为解析后的 runtime DTO 在进程间传递。

## 7. 角色包解析和安全校验

### 7.1 解析链路

修改 `packages/sprite-core/character-pack-manager.ts`：

- `normalizePackAssets()` 接受 `live2dModel`、`live2dConfig` 和 `model3d`。
- `resolveCharacterPackAssets()` 解析三个模型/配置字段的绝对 runtime 路径。
- `collectOutsidePackAssetPaths()` 将三个字段都作为核心资源检查，阻止越过包目录。
- `resolveCharacterPackPresentation()` 把显式 Live2D、显式/兼容 3D capability 和旧 video pack 映射为 `video | live2d | three`。
- 导入预检对 Live2D 与 VRM 分别检查必需资源、扩展名和文件存在性。
- active pack 构建 presentation 前再次验证文件存在。

建议校验规则：

| 条件                                      | 处理                           |
| ----------------------------------------- | ------------------------------ |
| `has3DModel !== true` 且未声明 `model3d`  | 按视频角色包处理               |
| 声明 `model3d` 但 `has3DModel !== true`   | warning，不启用 three renderer |
| `has3DModel === true` 但没有 `model3d`    | blocking error                 |
| `model3d` 越过角色包目录                  | blocking error                 |
| `model3d` 不存在或不是文件                | blocking error                 |
| 模型扩展名不是 `.vrm`                     | blocking error                 |
| `live2dModel` 不存在或不是 `.model3.json`  | blocking error                 |
| 已声明的 `live2dConfig` 不存在或不是 JSON | blocking error                 |
| VRM animation 指向包外路径                | 丢弃该动画并报告 warning       |
| 显式 `live2d` 但缺少现有 Live2D 资源      | blocking error                 |
| `live2d` source 出现在 `three` pack       | 丢弃该动画并报告 warning       |
| `three` source 出现在 `video/live2d` pack | 丢弃该动画并报告 warning       |

资源校验失败的影响范围必须限制在当前角色包或当前 animation entry。不能因为 3D 包坏了而改变其他已安装 video/Live2D 角色的可用性。

### 7.2 资源协议

修改 `electron/main/resource-protocol.ts`：

- 为 `.vrm`、`.vrma`、`.glb` 增加二进制 glTF MIME。
- 角色包激活和启动阶段显式调用 `addAllowedResourceRoot(activePack.rootDir)`。
- 不依赖“读取 animation index 时顺带注册目录”的间接副作用。
- 保持现有 root containment 校验，禁止 renderer 任意读取本机文件。

第一版要求 `.vrm` 和 `.vrma` 自包含全部 buffer、纹理和材质。当前 `makeResSrc()` 会把完整本机路径编码成单个 URL path，外置纹理的相对 URL 无法可靠解析，因此不开放 `.gltf + .bin + textures` 组合。

### 7.3 导入限制

在已有 archive/path 安全校验之外增加：

- 模型文件大小上限。
- VRMA 单文件大小和动作数量上限。
- glTF JSON chunk 大小上限。
- 顶点、骨骼、morph target、材质和纹理数量上限。
- 单张纹理宽高和像素总量上限。
- 禁止模型引用 HTTP、HTTPS、file 或角色包外部资源。

具体阈值应先用目标模型样本测量，再作为常量提交，避免拍脑袋限制正常角色。

### 7.4 授权信息

角色包的 `license` 和 trust 信息不能替代 VRM 自身 meta。导入预检需要读取并展示：

- 模型标题、作者和版本。
- avatar permission。
- commercial usage、credit notation、redistribution 等许可字段。
- VRM 0.x 与 VRM 1.0 meta 差异。

第一版可以只读展示，不自动推导法律结论。用户确认导入时应能看到角色包声明与 VRM meta 是否明显冲突。

## 8. Renderer 架构

### 8.0 三模式并存边界

renderer router 是唯一决定 React 展示组件的地方。它只消费已经归一化的 `SpritePresentationConfig`，不读取角色包文件、不根据 MIME 猜测模式，也不修改主进程的动画选择。

| `presentation.renderer` | 组件                                | 初始化条件                 | 失败影响               |
| ----------------------- | ----------------------------------- | -------------------------- | ---------------------- |
| `video`                 | `VideoSprite`                       | 既有 video source          | 只影响当前视频播放     |
| `live2d`                | 现有 Live2D 组件/adapter            | 既有 Live2D model + motion | 只影响当前 Live2D 角色 |
| `three`                 | `ThreeSprite` façade -> `VrmSprite` | 有效 VRM model，动作可选   | 只影响当前 three 角色  |

三种组件都必须继续接收相同的外层能力：尺寸、行走方向、首帧回调、播放命令、入口动画和 pointer/drag 交互。模式差异只存在于组件内部资源和帧循环，不得复制 `SpriteManager` 的业务状态机。

### 8.1 动态路由

将 `src/features/sprite-assistant/renderers/index.ts` 改名为 `index.tsx`，并从模块加载时的常量选择改为普通 React 组件：

```tsx
export function Renderer(props: SpriteRendererProps): JSX.Element | null {
  const { presentation } = useSpriteState();

  switch (presentation.renderer) {
    case 'live2d':
      return <Live2DSprite {...props} presentation={presentation} />;
    case 'three':
      return <ThreeSprite {...props} presentation={presentation} />;
    case 'video':
    default:
      return <VideoSprite {...props} />;
  }
}
```

删除 `ASSISTANT_RENDERER_MODE` 对“选哪一种模式”的全局决定作用，但保留兼容导出或迁移 shim，避免其他调用方编译失败。旧角色包缺少 presentation 时，先经过 `resolvePackPresentation()`：可识别的 legacy Live2D 保持 `live2d`，其余旧 pack 默认 `{ renderer: 'video' }`；不能默认改成 three。

`SpriteStateProvider` 需要：

- 初始化时接收 `SpriteInitialState.presentation`。
- 订阅 `sprite:presentation-changed`。
- presentation 变化时原子替换模型配置。
- 不在 React 组件里重复调用角色包列表 API 来推断 renderer。

模式切换必须先卸载旧 renderer，再挂载新 renderer；不能让 video 的 `<video>`、Live2D canvas 和 Three.js canvas 同时覆盖同一展示层。卸载顺序由 router 控制，旧 renderer 的资源释放完成后才允许新 renderer 报告首帧。

### 8.2 文件组织

建议新增：

```text
src/features/sprite-assistant/renderers/vrm/
  VrmSprite.tsx
  vrm-model-loader.ts
  vrm-motion-controller.ts
  vrm-expression-controller.ts
  vrm-camera.ts
  vrm-dispose.ts
```

保留并调整现有入口：

```text
src/features/sprite-assistant/renderers/VideoSprite.tsx   # 不删除
src/features/sprite-assistant/renderers/ThreeSprite.tsx   # 保留 public export，内部委托 VrmSprite
<existing-live2d-renderer>                                # 由 Phase 0 定位并保留 public export
```

职责：

| 文件                           | 职责                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `VrmSprite.tsx`                | three mode 的 React 生命周期、容器、首帧、状态和 controller 编排 |
| `vrm-model-loader.ts`          | GLTFLoader plugin、加载、优化、模型基本校验                      |
| `vrm-motion-controller.ts`     | VRMA cache、AnimationMixer、淡入淡出、完成事件                   |
| `vrm-expression-controller.ts` | expression 权重、眨眼、注视和口型                                |
| `vrm-camera.ts`                | Box3 自动取景和 pack camera override                             |
| `vrm-dispose.ts`               | action、texture、geometry、renderer 和异步竞态清理               |

`ThreeSprite.tsx` 有两种允许的实现方式：

1. 保留文件并把原 cube 实现替换为 `<VrmSprite />`，这是推荐方案。
2. 保留文件作为稳定 façade，内部 re-export `VrmSprite`，并把旧 cube 代码放入仅用于兼容回退的 `LegacyThreeSprite`，直到所有调用方完成迁移。

不允许直接删除 `ThreeSprite.tsx` 或把它从 router 中移除；这样会让原有 three mode 调用方失效。

### 8.3 Three.js 生命周期

场景和 renderer 只在模型变化时重建，尺寸变化不能重载模型。

初始化：

```ts
const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance'
});

renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
```

渲染循环顺序：

```ts
const delta = Math.min(clock.getDelta(), 1 / 15);
motionController.update(delta);
expressionController.update(delta);
vrm.update(delta);
renderer.render(scene, camera);
```

要求：

- 使用 `ResizeObserver` 监听容器，而不是监听全局 window resize。
- resize 时只更新 `camera.aspect`、projection matrix 和 renderer size。
- 复用项目现有 FPS 限制思想，桌面精灵默认最多 30 FPS。
- `document.hidden` 时暂停 rAF；恢复后重置 clock，避免超大 delta。
- DPR 最大为 2，性能不足时允许降低到 1.5。
- 第一版关闭实时阴影和后处理。

### 8.4 模型加载

基本加载流程：

```ts
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

const gltf = await loader.loadAsync(modelUrl);
const vrm = gltf.userData.vrm as VRM | undefined;
if (!vrm) throw new Error('VRM data is missing');

VRMUtils.removeUnnecessaryVertices(gltf.scene);
VRMUtils.combineSkeletons(gltf.scene);
VRMUtils.combineMorphs(vrm);

vrm.scene.traverse((object) => {
  object.frustumCulled = false;
});
```

模型加载成功后：

- 把 `vrm.scene` 加入 scene。
- 使用 `Box3` 计算可见 bounds 并自动调整 camera。
- 加入一盏 HemisphereLight 和一盏 DirectionalLight。
- 渲染第一张包含模型的帧后才调用 `onFirstFrame()`。
- 保存 VRM meta 供调试信息和导入预览使用。

加载失败时：

- 记录包含 pack id、模型相对路径和错误类型的日志，不记录不必要的本机绝对路径。
- 调用首帧 fail-open 回调，避免助手出场遮罩永久等待。
- 展示轻量错误占位或回退视频资源。
- 角色切换后允许重新尝试，不把失败状态缓存为全局永久错误。

### 8.5 自动取景

不同 VRM 的身高、原点和模型 scale 不一致，不能固定 `camera.position.z = 3`。

默认算法：

1. `Box3.setFromObject(vrm.scene)` 获取模型 bounds。
2. 用模型高度和相机 FOV 计算完整角色所需距离。
3. camera target 默认放在 bounds 中心偏上位置。
4. 保留顶部和脚底安全边距，防止 spring bone 或动作越界。
5. 应用 `presentation.camera` 中的 per-pack scale 和 offset override。

编辑器后续可以暴露 framing 调整，但第一版先提供合理自动值和 manifest 手工字段。

### 8.6 AIAssistant 尺寸衔接

`AIAssistant` 已计算 `targetWidth / targetHeight / targetPadding`，但当前调用 renderer 时仍传基础 `width / height`。

实施时改为：

```tsx
<Renderer width={targetWidth} height={targetHeight} walkDirection={walkDirection} onFirstFrame={reportFirstFrame} />
```

保证 wrapper、WebGL canvas、Electron 窗口和命中区域使用同一套尺寸。

## 9. VRMA 动作系统

### 9.1 为什么使用 VRMA

VRMA 提供基于 VRM humanoid、expression 和 lookAt 的标准动画映射，避免为每个角色维护骨骼名转换。第一版不直接支持普通 glTF animation、FBX 或 BVH。

注册 loader plugin：

```ts
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));
loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
```

加载和播放：

```ts
const gltf = await loader.loadAsync(motionUrl);
const vrmAnimation = gltf.userData.vrmAnimations?.[0];
if (!vrmAnimation) throw new Error('VRMA clip is missing');

const clip = createVRMAnimationClip(vrmAnimation, vrm);
const action = mixer.clipAction(clip);
action.play();
```

### 9.2 MotionController 状态

`VrmMotionController` 至少保存：

```ts
interface ActiveVrmMotion {
  animationId: string;
  playId?: string;
  clip: THREE.AnimationClip;
  action: THREE.AnimationAction;
  startedAt: number;
  completionReported: boolean;
}
```

同一个 model 生命周期内只创建一个 `AnimationMixer`。动作切换时：

1. 校验新的 `animationId + playId` 是否仍是当前命令。
2. 加载或读取 VRMA cache。
3. 为当前 VRM 创建 clip。
4. 新 action `reset().fadeIn()`。
5. 旧 action `fadeOut()`，淡出后 stop 和 uncache。
6. 非循环动作收到 mixer `finished` 后只报告一次完成。

默认 cross-fade 为 `150ms`。后续可以在 animation playback 增加 `fadeInMs / fadeOutMs`，但第一版先使用 renderer 常量。

### 9.3 播放参数映射

第一版映射：

| Sprite playback               | Three.js action                                       |
| ----------------------------- | ----------------------------------------------------- |
| `loop: true` 且无 `loopCount` | `THREE.LoopRepeat`，无限循环                          |
| `loopCount > 0`               | `THREE.LoopRepeat`，repetitions 为 loopCount          |
| `loop !== true`               | `THREE.LoopOnce`，`clampWhenFinished = true`          |
| `autoIdle`                    | 不由 renderer 决策；完成事件后仍由 SpriteManager 处理 |
| `durationMs`                  | 继续用于主进程 timed session，不强制拉伸 clip         |

`loopStartMs / loopEndMs` 当前是视频单文件 intro-loop-outro 的时间段语义。Phase 3 不直接套用到 VRMA，遇到 VRM source 时应忽略并报告开发期 warning。

第二阶段若要支持三段式动作，采用显式资源而不是隐含时间段：

```ts
interface VrmMotionSegments {
  intro?: string;
  loop?: string;
  outro?: string;
}
```

该扩展需要单独升级角色包 formatVersion，不在第一版实现。

### 9.4 完成事件

非循环动作完成后调用：

```ts
window.YUA.sprite.animComplete(animationId, 'full', playId);
```

要求：

- 每个 `animationId + playId` 最多上报一次。
- 旧动作在异步加载完成前已被替换时，不得播放或上报完成。
- 组件卸载、角色切换和加载失败不伪造正常完成事件。
- timed session 到期时，应结束当前循环并按契约上报；不能让 routine 永久等待。
- 保持现有 playlist 和 `autoIdle` 逻辑只在主进程执行。

### 9.5 动作缓存

缓存原始 VRMA 解析结果，不跨模型缓存最终 `AnimationClip`，因为 clip track 会绑定目标 VRM 的 normalized bone 和 expression 名称。

建议缓存 key：

```text
pack id + pack version + motion relative path
```

角色包切换或编辑保存后清空对应 pack cache。设置一个较小 LRU 上限，避免舞蹈动作持续占用内存。

## 10. 表情、眨眼、注视和口型

### 10.1 表情映射

优先使用 VRM 标准 preset：

| Chobits 状态/trigger               | VRM expression         |
| ---------------------------------- | ---------------------- |
| `joyful` / `celebrate` / `success` | `happy`                |
| `sad` / `failure`                  | `sad`                  |
| `angry`                            | `angry`                |
| `relaxed` / `sleep`                | `relaxed`              |
| `surprised` / `welcome`            | `surprised`            |
| 默认                               | 所有情绪权重缓慢回到 0 |

使用 `vrm.expressionManager.setValue(name, weight)`，权重切换必须插值，不能单帧跳变。

VRMA 自身带 expression track 时，动作表达优先于程序化 mood expression。动作结束后再平滑恢复 mood。

### 10.2 眨眼

`three-vrm` 只负责应用 expression，不会自动生成眨眼节奏。实现独立 blink state machine：

```text
waiting -> closing -> opening -> waiting
```

- 等待时间随机分布在约 2.5-6 秒。
- 闭眼和睁眼总时长约 120-180ms。
- 优先使用 `blink`，缺失时尝试 `blinkLeft + blinkRight`。
- `sleep` 动作、VRMA blink track 或模型缺少 expression 时暂停程序化 blink。

### 10.3 LookAt

第一版只做轻量鼠标注视：

- 把助手窗口内指针位置映射到 camera 前方的目标平面。
- 对目标位置做阻尼插值，限制 yaw/pitch 范围。
- 鼠标离开后缓慢回到 camera center。
- 拖拽、sleep 和显式 VRMA lookAt track 播放时暂停自动注视。

不能每帧通过 IPC 获取全局鼠标位置；renderer 内只使用已经收到的 DOM pointer 数据。

### 10.4 基础口型

`useSpriteSpeak()` 仍是唯一的语音播放入口。它在创建 `HTMLAudioElement` 后通过 `src/lib/audio/lip-sync-source.ts` 连接共享的 Web Audio `AnalyserNode`；`VrmSprite` 和 `Live2DSprite` 每帧调用 `getCurrentRMS()` 读取同一份平滑振幅，不重复创建或播放音频。

当前数据流：

```text
sprite:speak
    -> useSpriteSpeak
       ├─ HTMLAudioElement
       └─ lip-sync-source / Web Audio AnalyserNode
                         ├─ Live2DSprite
                         └─ VrmExpressionController
```

第一版口型只根据平滑后的音量驱动 `aa`：

```text
mouthWeight = clamp(smoothedRms * gain, 0, 1)
```

音频结束、报错或被新语音打断时必须把所有 mouth expression 清零。音素级 `aa/ih/ou/ee/oh` 映射作为后续独立能力。

## 11. 资源释放和竞态控制

### 11.1 异步加载竞态

模型或动作加载必须带 generation token：

```ts
const generation = ++loadGenerationRef.current;
const result = await loadModel(url);

if (generation !== loadGenerationRef.current) {
  disposeLoadedModel(result);
  return;
}
```

如果采用 `fetch(arrayBuffer)` + `loader.parseAsync()`，应同时使用 `AbortController`。即使请求不能取消，generation token 仍必须保留，防止旧模型覆盖新角色。

### 11.2 Dispose 顺序

模型替换或组件卸载时：

1. 停止 rAF 和 ResizeObserver。
2. 移除 mixer `finished` listener。
3. `mixer.stopAllAction()`。
4. 对所有 clip 执行 `uncacheClip()`，对模型执行 `uncacheRoot()`。
5. 重置 expression controller 和 lookAt target。
6. 从 scene 移除 VRM root。
7. `VRMUtils.deepDispose(vrm.scene)`。
8. dispose renderer，并在完全卸载时调用 `forceContextLoss()`。
9. 从 DOM 移除 canvas。

任何晚到的异步结果都要立即 dispose，不能只丢弃引用。

## 12. 错误处理和回退

建议错误分类：

```ts
type VrmLoadErrorCode = 'resource-forbidden' | 'resource-not-found' | 'unsupported-format' | 'missing-vrm-extension' | 'model-limit-exceeded' | 'webgl-unavailable' | 'context-lost' | 'unknown';
```

运行时策略：

- WebGL 不可用：展示错误占位并允许用户打开角色设置。
- VRM 模型加载失败：当前会话不重复高频重试，角色切换或显式重载时再试。
- 单个 VRMA 加载失败：保持当前或 idle 动作，不卸载整个模型。
- `webglcontextlost`：停止渲染循环并阻止默认销毁；恢复后重建 renderer 和模型。
- 所有失败都必须释放助手出场等待状态。
- three mode 失败时不能自动把当前角色改成 Live2D 或 video，除非该角色包显式声明并通过校验的 fallback；否则展示 three mode 的错误占位。
- video 或 Live2D 失败时不能触发全局 renderer mode 变化，其他模式仍必须可用。

正式版本建议允许角色包按模式声明 fallback；在该协议落地前，错误占位比偷偷加载其他模式的内置角色更清晰，避免角色人格与外观不一致。

## 13. 文件级实施计划

### Phase 0：依赖和基线

修改：

- `package.json`
- `pnpm-lock.yaml`

任务：

- 核对 `main` 实际使用的 Live2D renderer；记录其组件入口、manifest 字段、model/motion 资源协议、首帧回调、销毁方法和 IPC 事件。
- 为 `video`、`live2d`、`three` 建立三套最小 fixture/回归用例。
- 对齐 `three` 和 `@types/three` 的 minor 版本。
- 安装 `@pixiv/three-vrm`。
- 建立最小 import 编译测试。
- 记录当前 renderer bundle size 作为基线。

验收：

- `pnpm exec tsc --noEmit` 通过。
- Vite renderer build 通过。
- 视频角色行为无变化。

### Phase 1：角色包 3D 协议

修改：

- `packages/sprite-core/character-service.ts`
- `packages/sprite-core/character-pack-manager.ts`
- `packages/sprite-core/character-pack-integrity.ts`（如 digest payload 有字段白名单）
- `src/features/sprite-assistant/renderers/Live2DSprite.tsx` 及其 config/model-target/runtime 适配层
- `packages/sprite-core/types.ts`
- `packages/sprite-core/animation-registry.ts`
- `packages/sprite-core/handler/sprite-assets.ts`
- `packages/sprite-core/handler/sprite-manager-ipc.ts`
- `packages/sprite-core/preload/sprite-bridge.ts`
- `electron/main/resource-protocol.ts`

任务：

- 增加 `assets.model3d` 和 resolved asset。
- 增加 `SpriteRendererKind = 'video' | 'live2d' | 'three'`、`SpriteAnimationSource`、`SpritePresentationConfig`。
- 扩展路径 normalize、序列化、越界校验和导入提示。
- 在初始状态和角色切换时下发 presentation；旧 pack 没有 presentation 时保持 video。
- 给 VRM/VRMA 增加资源 MIME 和 active pack root 注册。
- 添加一个只用于自动化测试的最小 VRM fixture；不要把无明确再分发授权的模型提交到仓库。

验收：

- 旧 pack manifest 解析结果不变。
- VRM pack 能解析出 `resolvedAssets.model3d`。
- 包外 model/motion 路径被阻断。
- 角色切换事件携带正确 presentation。

### Phase 2：VRM 静态展示

修改/新增：

- `src/features/sprite-assistant/context/sprite-state-context.ts`
- `src/features/sprite-assistant/context/sprite-state-runtime.ts`
- `src/features/sprite-assistant/renderers/index.ts` -> `src/features/sprite-assistant/renderers/index.tsx`
- `src/features/sprite-assistant/renderers/ThreeSprite.tsx`（保留入口，内部替换实现）
- `src/features/sprite-assistant/renderers/VideoSprite.tsx`（回归验证，不改现有播放语义）
- `<existing-live2d-renderer>`（回归验证，不改现有资源语义）
- `src/features/sprite-assistant/renderers/vrm/VrmSprite.tsx`
- `src/features/sprite-assistant/renderers/vrm/vrm-model-loader.ts`
- `src/features/sprite-assistant/renderers/vrm/vrm-camera.ts`
- `src/features/sprite-assistant/renderers/vrm/vrm-dispose.ts`
- `src/features/sprite-assistant/AIAssistant.tsx`

任务：

- 动态选择 video/live2d/three renderer。
- 用 VRM 实现替换现有 `ThreeSprite` 的 cube 场景，但保留 `ThreeSprite` 文件和 public export。
- 完成透明背景、灯光、自动取景和 ResizeObserver。
- 每帧调用 `vrm.update(delta)`。
- 仅在有效模型帧后报告 first frame。
- 完成模型切换竞态和 dispose。
- 修正 renderer 的 target width/height 传递。
- 保留 `VideoSprite` 行为和双 buffer 切换逻辑。

验收：

- 自包含 VRM 在透明助手窗口中正确显示。
- MToon 材质颜色、透明区域和 spring bone 正常。
- 2D/3D 角色可热切换。
- video、Live2D、three 三种角色可以在同一个构建中独立激活和切换。
- 旧 video 和 Live2D 角色的截图、首帧、交互、动画完成和资源释放回归通过。
- 连续切换角色不会持续增加 WebGL context、texture 和 geometry 数量。

### Phase 3：VRMA 动作

状态：已完成。自动化覆盖动作解析、retarget、循环语义、完成事件、timed session、缓存和异步竞态；Electron 动作观感验收留在 Phase 6。

修改/新增：

- `package.json`
- `pnpm-lock.yaml`
- `src/features/sprite-assistant/renderers/vrm/vrm-motion-controller.ts`
- `src/features/sprite-assistant/renderers/vrm/VrmSprite.tsx`

任务：

- 安装并注册 `@pixiv/three-vrm-animation`。
- 加载 VRMA 并为当前 VRM 创建 AnimationClip。
- 映射 loop、loopCount 和 LoopOnce。
- 动作切换交叉淡化。
- 完成事件携带 `animationId / playId` 回主进程。
- 实现动作 cache 和角色切换清理。

验收：

- `idle`、`walk`、`welcome`、`thinking` 至少四类 trigger 可播放。
- `walkDirection` 改变时模型朝向正确且不破坏骨骼和 spring bone。
- 非循环动作完成后能回到 idle。
- playlist 和 routine waitFor 不会卡死。

### Phase 4：表现力

状态：已完成。自动化覆盖表情映射、眨眼状态机、LookAt 范围与阻尼、口型权重和 VRMA 通道优先级；Electron 交互观感验收留在 Phase 6。

修改/新增：

- `src/features/sprite-assistant/renderers/vrm/vrm-expression-controller.ts`
- `src/features/sprite-assistant/speak/useSpriteSpeak.ts`
- `src/lib/audio/lip-sync-source.ts`

任务：

- mood/trigger 到标准 expression 的映射。
- 程序化眨眼。
- pointer lookAt。
- 基于音量的 `aa` 口型。
- VRMA expression/lookAt 与程序化控制的优先级仲裁。

验收：

- 眨眼不会覆盖 sleep 或 VRMA 自带表情。
- 鼠标离开后眼神自然回中。
- 语音播放期间口型响应，结束后权重归零。
- 视频 renderer 的音频播放行为无回归。

### Phase 5：设置页和预览

修改：

- `src/pages/ExtensionSettings/SpritePackManager.tsx`
- `src/pages/ExtensionSettings/SpritePackEditor.tsx`
- `src/pages/ExtensionSettings/SpritePackEditorModel.ts`
- 角色包 preload/IPC 类型

任务：

- pack badge 展示 VRM version 和模型 meta 摘要。
- 导入预检展示模型授权和资源限制结果。
- 编辑器允许 installed pack 选择 `.vrm` 和 `.vrma`。
- 新增 3D preview surface，复用 `VrmSprite` 底层 loader，不复制生命周期逻辑。
- 内置包继续保持只读。

验收：

- 编辑器写回的所有资源路径都是包内相对路径。
- 删除或替换动作时不会误删仍被其他条目引用的文件。
- 预览关闭后释放 WebGL context。

### Phase 6：测试和发布准备

任务：

- 单元、renderer、Electron integration 和视觉测试全部完成。
- 检查 Windows 与 macOS 透明窗口表现。
- 检查打包后的 builtin VRM 资源位置。
- 测量 idle CPU、GPU、显存和首帧耗时。
- 更新 `docs/sprite-core/README.md` 和角色包格式文档。

## 14. 测试计划

### 14.1 单元测试

建议新增：

```text
test/character-pack-vrm-assets.spec.ts
test/sprite-vrm-source-normalization.spec.ts
test/vrm-presentation.spec.ts
test/vrm-motion-controller.spec.ts
test/vrm-expression-controller.spec.ts
test/vrm-camera.spec.ts
test/sprite-renderer-router.spec.ts
test/sprite-renderer-mode-compatibility.spec.ts
```

覆盖：

- 旧 video source 的兼容 normalize。
- 旧 video pack 没有 presentation 时仍归一化为 `video`。
- 既有 Live2D pack/source 仍归一化为 `live2d`，其字段不被 three 逻辑改写。
- `ThreeSprite` 仍可被原有 import 路径加载，VRM 只替换其内部实现。
- VRM model 和 motion 相对路径解析。
- traversal、绝对路径和 symlink escape。
- renderer kind 选择。
- loop 和 loopCount 映射。
- completion 去重。
- 异步旧动作晚到时不覆盖当前动作。
- camera bounds 和极端尺寸。
- blink、mood、VRMA expression 的优先级。

### 14.2 React renderer 测试

覆盖：

- presentation 在 video/live2d/three 三种模式之间切换时组件选择正确。
- video -> live2d -> three -> video 连续切换不会保留旧 canvas、video 或 WebGL context。
- presentation 从 video 切到 three 时 `ThreeSprite` façade 正确委托到 `VrmSprite`。
- Live2D 组件仍收到原有 props、motion 和首帧回调。
- VRM 首帧前不触发 `onFirstFrame`。
- 加载失败会 fail-open。
- props 尺寸变化不重新加载模型。
- StrictMode 双挂载不会留下两个 canvas 或两个 rAF。
- unmount 会执行完整 dispose。

Three.js/WebGL API 在 jsdom 中使用边界 mock；模型实际解析交给 browser/Electron integration test。

### 14.3 三模式回归矩阵

每次涉及 router、`SpriteStateContext`、AIAssistant 尺寸或资源协议的改动，都必须运行以下矩阵：

| 场景                       | video | live2d | three/VRM |
| -------------------------- | ----- | ------ | --------- |
| 初始状态首帧               | 通过  | 通过   | 通过      |
| trigger 播放和完成事件     | 通过  | 通过   | 通过      |
| loop / playlist / autoIdle | 通过  | 通过   | 通过      |
| 窗口 resize / padding      | 通过  | 通过   | 通过      |
| 拖拽、点击、双击和气泡     | 通过  | 通过   | 通过      |
| 角色热切换                 | 通过  | 通过   | 通过      |
| unmount / reload 资源释放  | 通过  | 通过   | 通过      |

当前 checkout 已包含从 `main` 迁入并适配角色包契约的真实 Live2D runtime。该列必须用自包含 Live2D 包和实际 Electron canvas 验证，不能只用空 adapter 标记为通过。

### 14.4 Electron 集成测试

覆盖：

- `res://` 能读取打包内和 installed pack 内的 VRM/VRMA。
- 旧 video 和 Live2D 资源仍按原协议读取。
- 未注册 root 返回 403。
- 模型外部资源引用被拒绝。
- 角色包切换会下发 presentation 和新 idle animation。
- 动作完成经 IPC 回到 SpriteManager，并正确切回 idle。
- 助手窗口 resize 后 canvas backing store 和 CSS size 一致。

### 14.5 视觉和像素验证

桌面与小尺寸视口至少验证：

- canvas 存在非透明像素，不能只判断 DOM 已挂载。
- 模型头顶、脚底和大幅动作不被裁切。
- 透明背景没有黑底或矩形边缘。
- MToon 正反面、发丝、眼睛和半透明材质正确。
- 入场遮罩与模型首帧衔接，不出现空白扫描。
- 2D/3D 热切换没有旧 canvas 残影。
- video/live2d/three 连续热切换没有旧 DOM、旧 canvas 或错误模式残影。

### 14.6 性能基线

使用固定测试模型记录：

- 冷加载到有效首帧耗时。
- idle 30 秒平均 CPU/GPU 占用。
- renderer.info 中 geometries、textures、programs 数量。
- 连续切换角色 20 次后的资源数量。
- 窗口 hidden 期间的 rAF 和 CPU 占用。

建议目标：

- hidden 时停止主动渲染。
- 单角色 idle 默认不超过 30 FPS。
- 连续切换后资源计数回到稳定区间，不随次数线性增长。
- 模型加载失败不会阻塞应用主窗口或助手交互。

## 15. 验收标准

### 15.1 必须满足

- [x] 现有默认 WebM 角色包无需修改即可运行。
- [x] 从 `main` 迁入的 Mao(PRO) 已封装为自包含 Live2D 角色包；renderer、动作、交互和口型入口保留。
- [x] VRM 角色包能通过 manifest 声明模型并归一化为 `three` mode。
- [x] VRM 角色包能声明并播放 VRMA 动作。
- [x] 角色激活后无需重启即可在 video/live2d/three 之间切换。
- [x] 当前 `ThreeSprite` 调用方无需改 import；其内部由 VRM 实现接管。
- [x] VRM 模型已在 macOS 透明 Electron 窗口中稳定显示；Windows 验收留在 Phase 6。
- [x] 静态展示帧循环会调用 `vrm.update(delta)`。
- [x] mixer 和 VRM 表达控制器按正确顺序更新。
- [x] `idle`、`walk` 和非循环 `welcome` / `thinking` trigger 动作可正确加载和播放。
- [x] 非循环动作完成后通过既有 IPC 交由 SpriteManager 回 idle。
- [x] `onFirstFrame` 只在有效模型帧后报告，失败路径会 fail-open。
- [x] 模型、角色包和动作切换通过 generation/key 隔离旧异步结果。
- [ ] 组件卸载和角色切换后 GPU 资源得到释放。
- [x] video、Live2D 和 three 的失败处理互相隔离，一个模式失败不会全局切换 renderer。
- [x] 包外模型路径和不支持的模型扩展名被拒绝。
- [ ] VRM/VRMA 内部外部资源引用和复杂度上限校验完成。
- [x] 角色包内没有本机绝对路径或个人敏感信息。

### 15.2 VRM Phase 4 后满足

- [x] mood expression 平滑切换。
- [x] 自动眨眼与 VRMA 表情不冲突。
- [x] lookAt 有范围限制和阻尼。
- [x] 语音播放时有基础口型，结束后正确复位。

## 16. 回滚策略

实现期间保持以下回滚边界：

- 缺少 `presentation` 时由兼容 normalizer 决定：legacy Live2D 保持 `{ renderer: 'live2d' }`，其他旧 pack 回退为 `{ renderer: 'video' }`。
- `VideoSprite` 和 Live2D renderer 不依赖 `three-vrm` 类型或实现。
- `ThreeSprite` 保留稳定导出；VRM 只作为 three mode 的新实现。若 VRM 临时关闭，three mode 仍可以使用兼容的旧 Three.js façade 或明确错误占位，不影响 video/Live2D。
- Phase 1 的角色包字段全部为可选字段，不改变旧 manifest。
- three/VRM renderer 可以通过单一 runtime feature flag 暂时禁用，但该 flag 只用于灰度和故障回退，不作为长期 renderer 选择来源。
- 出现严重 GPU 或跨平台问题时，可以停止识别 `assets.model3d`，旧 video 和 Live2D 角色功能仍完整可用。

不要通过恢复全局 `ASSISTANT_RENDERER_MODE = 'video'` 作为长期回滚方案，因为它会再次绕过角色包事实来源，也会让 Live2D 和 three mode 失效。回滚必须按 renderer 分支进行。

## 17. 实施约束与待确认项

默认决策：

- 使用 WebGLRenderer，不使用 WebGPU。
- 使用 VRMA，不自研通用 humanoid retargeter。
- 模型属于角色包级资源，动作属于 animation entry。
- renderer 由 active pack presentation 决定，取值为 `video | live2d | three`。
- VRM 是 three mode 的实现格式，不作为第四种 renderer。
- 第一版仅接受自包含 VRM/VRMA。
- video、Live2D 和 three/VRM 共享 trigger、playlist、movement 和完成事件语义。

Phase 5-6 验收仍需要准备的外部输入：

- 一个明确允许开发测试和重新分发的 VRM 模型。
- 至少 `idle`、`walk`、`welcome` 三个兼容该模型的 VRMA 动作。
- 目标 VRM 模型的桌面展示尺寸和期望取景参考。

仓库内 Three Buddy 已满足自动化 fixture 和基础视觉验收。发布前仍应使用至少一个具有正式授权、材质和表情完整的目标模型复核表现与性能。

## 18. 交付批次

首个交付批次完成 Phase 0-2：

1. 对齐依赖。
2. 建立 `model3d + presentation + source.kind` 契约。
3. 完成角色包校验和 `res://` 支持。
4. 将固定 renderer 开关替换为动态路由。
5. 加载并展示静态 VRM，完成自动取景、首帧和释放。
6. 保持全部动作暂时为 rest pose。

第二个交付批次已完成 Phase 3-4：引入 VRMA 播放状态机、表达控制、Three Buddy 动作样本和 VRMA 导入预检。后续批次聚焦 Phase 5 编辑/预览，以及 Phase 6 Electron 动态表现、GPU 生命周期和跨平台发布验收。
