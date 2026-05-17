# 桌面精灵音乐感知与跳舞触发方案

更新时间：2026-05-17

本文档用于指导“检测当前播放内容是否是音乐，并驱动桌面精灵跳舞”的设计与落地。目标不是只算一个 BPM 数值，而是建立一条可实时运行、可渐进增强、不会频繁误触发的音频感知管线。

## 0. 当前实施进度

当前状态：Phase 0 / Phase 1 已完成首轮落地，Phase 2 已接入应用内媒体播放器音频分析，并完成第一轮启发式阈值回归测试。

已完成：

- 新增独立 `packages/audio-reactivity` 能力域。
- 新增 `MusicReactivityPreferences`、默认 trigger `music:dance`、灵敏度阈值和状态快照类型。
- 新增主进程 `MusicReactivityService`，包含 `idle -> candidate -> dancing -> cooldown` 状态机。
- 新增 `music-reactivity:*` IPC 和 `window.YUA.musicReactivity` preload API。
- 偏好配置已持久化到现有 preferences config 的 `musicReactivity` 字段。
- `机能扩展 -> 精灵管理 -> 音乐响应` 已提供开关、来源、灵敏度、触发器名、调试状态和“测试跳舞”按钮。
- 服务在进入 `dancing` 时会通过 `SpriteManager.trigger(danceTrigger, { silent: true })` 触发现有精灵动画系统。
- 资源页 `MediaPlayer` 已接入 Web Audio 分析节点，播放应用内音频/视频时会周期性上报 `app-media` 分析快照。
- 媒体特征估算已抽到 `packages/audio-reactivity/analysis/media-feature-estimator.ts`，便于单测和后续替换模型。
- 音频来源偏好已接入服务层过滤：`auto` 接受 `manual`、`app-media`、`system-loopback`，不会自动接受 `microphone-test`；显式选择某个来源时只接受该来源。
- 已补充回归测试：静音、节奏音乐近似、语音近似，以及状态机来源过滤和持续触发。
- 已补充关键链路日志，便于排查“播放了音视频但没有触发跳舞”的问题。
- 设置页已补充 `danceTrigger` 对应动画数量检查；如果没有任何动画匹配 `music:dance`，会继续检查通用动作 trigger `dance` 并提示 fallback 状态。
- `candidate` 阶段已改为迟滞确认：首次超过进入阈值后开始计时，短暂跌回进入阈值以下但仍高于退出阈值时不会清零，避免真实音乐分数波动导致启动过慢。
- 舞蹈播放已接入精灵当前播放状态感知：音乐触发的舞蹈片段播完并回到 idle 站立动画后，如果音频仍持续满足音乐条件，会自动续跳。
- 暂停播放、媒体结束、关闭预览或分析器释放时会 reset 音乐响应状态到 `idle`；不会硬切当前已发出的舞蹈片段，片段可自然播完并由精灵系统回到站立/idle。
- `music:dance` 不存在时已兼容 fallback 到内置动作分类 trigger `dance`。

当前限制：

- 系统音频 loopback 尚未接入，因此还不会自动分析其他应用正在播放的声音。
- 第一版真实音频分析从资源页 `MediaPlayer` 开始，只覆盖 Chobits 应用内播放的音频/视频。
- 当前音乐概率为启发式估算，不是模型分类结果。它用于验证体验闭环，后续可替换/融合 YAMNet 或 AudioSet 类模型。

已验证：

- `media-feature-estimator` 合成样本单测覆盖静音、节奏音乐近似和语音近似。
- `MusicReactivityService` 单测覆盖应用内媒体持续触发、显式来源过滤、`auto` 不自动接受麦克风测试输入。
- `MusicReactivityService` 单测覆盖媒体停止 reset 后不继续触发，以及舞蹈片段回到 idle 且音乐仍在时自动续跳。

下一步：

- 用真实媒体样本观察误触发和漏触发，调整 `estimateMusicProbability` 权重。
- 在设置页补充“当前来源可用性/最近一次快照时间”，让应用内播放器是否正在喂数据更直观。
- 继续评估系统 loopback 与本地模型分类的优先级。

排查日志：

- Renderer 控制台搜索 `[MusicReactivity][MediaPlayer]`。
  - `created analyzer`：Web Audio 分析节点已成功绑定到媒体元素。
  - `sent analysis snapshot`：应用内播放器正在向主进程上报音频特征，包含 `energyDb / musicProbability / onsetStrength`。
  - `music reactivity analyzer setup failed`：分析器创建失败，常见原因是同一个 media element 已被其他 Web Audio source 绑定或浏览器音频上下文限制。
- Main 日志搜索 `[MusicReactivity]`。
  - `analysis ignored: disabled`：设置页“听到音乐时跳舞”未开启。
  - `analysis ignored: source filtered`：音频来源设置与当前上报来源不匹配。
  - `analysis snapshot`：主进程已收到快照，并打印阈值、当前分数和是否满足进入条件。
  - `state changed`：状态机发生 `idle / candidate / dancing / cooldown` 切换。
  - `dance trigger dispatched`：已经调用 `SpriteManager.trigger(danceTrigger, ...)`，如果此时没有动画，重点检查精灵动画的 trigger 是否配置为同名 `music:dance`。
  - `dance refresh waiting for idle presentation`：音乐仍在，但当前精灵播放位还不是 idle 站立动画，通常表示被拖拽、行走、困倦、任务演出或其他触发动画占用；等回 idle 后会再尝试续跳。
  - `dance refresh dispatched after idle presentation`：上一段音乐舞蹈已结束或被别的动画打断后，精灵已经回到 idle，音乐仍在，因此重新派发跳舞。
  - `state reset` 且 reason 为 `media-inactive` / `media-analyzer-disposed`：播放器暂停、结束或预览窗口关闭，音乐响应状态已退出。当前已发送给精灵的视频片段不会被硬切，可自然播放到结束后回 idle。
- Main 日志继续搜索 `[SpriteManager][trigger]`。
  - `received trigger`：精灵层收到触发器，重点看 `candidateCount`、`selectedAnimationId` 和 `presentationAllowed`。
  - `using fallback trigger`：没有专用 `music:dance` 动画，但找到并使用了通用 `dance` 动画。
  - `no animation candidates`：没有任何动画注册了这个 trigger 或 fallback trigger。需要在 `机能扩展 -> 精灵管理` 中把某个动画的主触发器或别名设置为 `music:dance` 或 `dance`。
  - `animation blocked by presentation lock`：已经找到动画，但被更高优先级的精灵 routine / purpose 暂时拦住。
  - `sprite:play sent`：已向桌面精灵窗口发送播放命令。如果仍无动作，需要继续查渲染窗口是否 ready、动画资源是否可加载。
- 当前已确认的一类配置问题：
  - 如果日志出现 `candidateCount: 0` 且没有 `using fallback trigger`，说明音乐检测和触发链路已经成功，但当前动画库没有任何动画绑定到 `music:dance` 或 `dance`。
  - 修复方式：在 `机能扩展 -> 精灵管理` 中选择一个动画，把“主触发器”设为 `music:dance` 或 `dance`，或者把其中一个加入触发器别名。

## 1. 目标

- 当用户正在播放音视频时，自动判断其中是否包含音乐。
- 音乐持续存在时，让桌面精灵进入跳舞/律动状态。
- 跳舞状态可被精灵现有动画系统接管，优先复用 `sprite:trigger` 和动画 trigger 元数据。
- 后续可用 BPM、beat、音量、onset 强度进一步控制动画速度和动作幅度。
- 保护隐私：默认只做本地实时分析，不保存原始音频，不上传音频。
- 可跨平台演进：macOS / Windows / Linux 的系统音频采集能力不完全一致，采集层必须可替换。

## 2. 非目标

- 第一阶段不做云端音乐识别、歌名识别、版权曲库匹配。
- 第一阶段不承诺精确 BPM，跳舞触发只需要稳定判断“这段声音像音乐”。
- 不把 FFmpeg 当作音乐分类器。FFmpeg 可负责采集、转码、切片、响度统计，但不负责最终音乐判断。
- 不强依赖某一种桌面音频采集方案。不同平台可用能力不同，采集适配器必须隔离。

## 3. 结论

推荐采用三层架构：

```text
Audio Capture -> Audio Analysis -> Sprite Dance Controller
```

- Audio Capture：负责拿到 PCM 帧。
- Audio Analysis：负责输出 `musicProbability / speechProbability / energy / onset / bpm`。
- Sprite Dance Controller：负责状态机、防抖、冷却、触发精灵动画。

第一阶段推荐路径：

- 采集：优先接入本应用内可获得的音频源；系统音频采集作为单独适配器推进。
- 分析：先用轻量本地启发式 + 可插拔模型接口，快速跑通闭环。
- 触发：使用自定义精灵 trigger：`music:dance`、`music:idle-bop`、`music:stop`。
- 动画：用户可在精灵动画资源里把某个动画的 `primaryTrigger` 设置成 `music:dance`。

第二阶段升级：

- 接入本地音频分类模型，建议优先评估 YAMNet / AudioSet 类模型的 ONNX 或 Transformers.js 版本。
- 接入 beat/onset tracker，先用 JS/TS 实现能量 onset，再按效果考虑 aubio/Essentia native 或 sidecar。

## 4. 为什么不是只用 FFmpeg

FFmpeg 能做：

- 从媒体文件或采集设备抽音频。
- 转成统一采样率、声道、PCM 格式。
- 计算静音、响度、RMS、频谱图等底层统计。

FFmpeg 不擅长：

- 判断一段声音是不是音乐。
- 区分音乐、人声讲话、游戏音效、环境噪声。
- 实时输出稳定 beat / BPM，并带置信度。

所以 FFmpeg 在本方案中定位为音频管线工具，而不是决策核心。真正的“是不是音乐”最好由模型或专门音频特征算法判断。

## 5. 系统架构

### 5.1 模块划分

建议新增一个主进程侧能力域：

```text
packages/audio-reactivity/
  types.ts
  music-reactivity-service.ts
  analysis/
    realtime-feature-extractor.ts
    music-classifier.ts
    beat-tracker.ts
  capture/
    audio-capture-adapter.ts
    app-media-capture-adapter.ts
    system-audio-capture-adapter.ts
  controller/
    dance-trigger-controller.ts
  ipc-main.ts
  preload.ts
```

如果第一阶段希望少建目录，也可以先放在：

```text
packages/sprite-core/music-reactivity/
```

但长期看，音频感知并不只属于精灵，后续可能也服务于录屏、字幕、工作流或可视化，因此推荐独立 `packages/audio-reactivity`。

### 5.2 数据流

```text
PCM frames
  -> ring buffer
  -> 50ms energy / spectral features
  -> 500ms rolling frame
  -> 2-4s music classifier window
  -> dance state machine
  -> sprite:trigger("music:dance")
```

运行时只需要保留短环形缓冲：

- 原始 PCM：最多 5-10 秒。
- 特征序列：最多 30-60 秒。
- 不落盘，不写数据库。

## 6. 音频采集设计

### 6.1 采集接口

```ts
export type AudioCaptureSource = 'app-media' | 'system-loopback' | 'microphone' | 'file-probe';

export interface AudioFrame {
  sampleRate: number;
  channelCount: number;
  timestampMs: number;
  samples: Float32Array;
}

export interface AudioCaptureAdapter {
  readonly source: AudioCaptureSource;
  isAvailable(): Promise<boolean>;
  start(options: AudioCaptureOptions): Promise<void>;
  stop(): Promise<void>;
  onFrame(listener: (frame: AudioFrame) => void): () => void;
}
```

### 6.2 采集优先级

第一阶段建议按以下优先级：

1. 应用内媒体播放器音频
   - 如果用户播放的是 Chobits 资源页内的视频/音频，Renderer 端可通过 Web Audio API 直接拿到音频特征。
   - 这是最稳、权限成本最低的路径。
2. 系统 loopback 音频
   - macOS：优先评估 Electron + ScreenCaptureKit 可获得的系统/应用音频能力；不稳定时提示用户安装/选择虚拟声卡。
   - Windows：WASAPI loopback 是推荐方向。
   - Linux：PipeWire/PulseAudio monitor source。
3. 麦克风回退
   - 只适合作为测试或用户明确授权的模式。
   - 不推荐默认用麦克风判断“正在播放的音乐”，容易受环境噪声影响。

### 6.3 权限与隐私

- 设置项默认关闭。
- 开启时说明会实时分析系统/应用音频，但不保存、不上传。
- 采集失败时暴露明确状态：`permission-denied / source-unavailable / unsupported-platform / running`。
- 不复用语音识别录音数据，避免“听音乐”和“听用户说话”的权限语义混淆。

## 7. 音频分析设计

### 7.1 输出契约

```ts
export interface MusicReactivitySnapshot {
  running: boolean;
  source: AudioCaptureSource;
  timestampMs: number;
  energy: number;
  energyDb: number;
  onsetStrength: number;
  musicProbability: number;
  speechProbability?: number;
  beatConfidence?: number;
  bpm?: number;
  beatTick?: boolean;
  state: 'idle' | 'candidate' | 'dancing' | 'cooldown' | 'unavailable';
  reason?: string;
}
```

### 7.2 第一阶段启发式

第一阶段先实现便宜且可解释的本地特征：

- RMS / dBFS：过滤静音和极低音量。
- Zero-crossing rate：辅助排除纯低频噪声。
- Spectral flux / onset strength：判断是否有持续节奏变化。
- Band energy ratio：判断能量是否分布在音乐常见频段，而不是单一噪声。
- 节奏稳定度：最近 4-8 秒 onset 间隔是否相对稳定。

启发式输出不是“真音乐概率”，而是 `heuristicMusicScore`。为了统一后续模型接口，可以映射到 `musicProbability`。

建议初始阈值：

- `energyDb > -45`
- `musicProbability > 0.62`
- `onsetStrength` 在最近 4 秒内有持续峰值
- 满足条件连续 `2.5s` 才进入跳舞
- 低于阈值连续 `4s` 才退出跳舞

### 7.3 第二阶段模型

模型接口：

```ts
export interface MusicClassifier {
  load(): Promise<void>;
  classify(window: Float32Array, sampleRate: number): Promise<{
    musicProbability: number;
    speechProbability?: number;
    labels?: Array<{ label: string; score: number }>;
  }>;
}
```

候选：

- YAMNet / AudioSet：适合判断 music、speech、instrument。
- PANNs：音频场景分类效果好，但模型体积和 JS 推理成本需要评估。
- Transformers.js / ONNX Runtime：项目已有 `@huggingface/transformers`，优先评估是否能复用现有依赖。

模型策略：

- 模型只负责慢速分类：每 500ms 或 1000ms 跑一次最近 2-4 秒窗口。
- 能量/onset 负责快速响应。
- 分类结果用 EMA 平滑，避免一两个窗口抖动。

### 7.4 BPM 与 beat

跳舞触发不依赖 BPM。BPM 只用于增强动画：

- `beatTick`：让动画层做一次轻微动作强调。
- `bpm`：调节播放速度或选择快/慢舞蹈动画。
- `onsetStrength`：调节动作幅度。

第一阶段可只产出 onset pulse，不产出 BPM。

第二阶段 beat tracking 选项：

- JS 实现 onset peak picking：低依赖、足够驱动动作。
- aubio：实时 beat tracking 成熟，但引入 native/sidecar 成本。
- Essentia：特征完整，适合离线和高级分析，但对桌面端包体和部署要谨慎。
- librosa：适合研究和离线原型，不适合直接放进 Electron 实时主链路。

## 8. 跳舞状态机

### 8.1 状态

```text
idle -> candidate -> dancing -> cooldown -> idle
```

- idle：未检测到音乐。
- candidate：疑似音乐，等待持续确认。
- dancing：已经触发跳舞。
- cooldown：刚退出或刚触发过，避免频繁切换。
- unavailable：采集不可用或权限失败。

### 8.2 进入条件

进入 `candidate`：

- 音量超过阈值。
- 音乐分数超过阈值。
- 当前没有用户拖拽精灵、精灵高优先级动作、说话、任务演出等冲突状态。

进入 `dancing`：

- `candidate` 持续 `2.5s`。
- 在 `candidate` 中，分数短暂低于进入阈值但仍高于退出阈值时继续累计；只有跌到退出阈值以下或音量低于最低阈值才回到 `idle`。
- 最近 `8s` 内没有触发过失败冷却。
- 存在 `music:dance` 对应动画时触发动画；不存在时 fallback 到通用动作 trigger `dance`；两者都不存在时只记录日志，不弹错误。

退出 `dancing`：

- 音乐分数低于阈值连续 `4s`。
- 音量低于阈值连续 `4s`。
- 采集源停止，例如播放器暂停、媒体结束、预览窗口关闭、分析器释放。
- 用户开始拖拽、精灵开始说话、行走、困倦动画或进入更高优先级 purpose 时，精灵动画系统可以打断当前舞蹈片段；音乐响应服务会保持音乐状态观察，等精灵回到 idle 站立播放位后，如果音频仍在播且仍满足音乐条件，会再次触发舞蹈。
- 采集源停止时，音乐响应服务立即 reset 到 `idle`，但不主动发送硬切动画；已经在播的舞蹈视频片段可以自然播完，然后由 `SpriteManager` 的 `autoIdle` 逻辑切回站立/idle。

### 8.3 触发策略

使用现有接口：

```ts
window.YUA.sprite.trigger('music:dance', {
  silent: true,
  durationMs: 8000,
  ctx: {
    music: {
      bpm,
      energy,
      onsetStrength
    }
  }
});
```

主进程服务中等价调用：

```ts
spriteManager.trigger('music:dance', {
  silent: true,
  durationMs: 8000,
  priority: 20
});
```

注意：当前 `sprite:trigger` IPC 只透传了部分 `SpriteTriggerOptions`，如果音乐服务在主进程内直接访问 `SpriteManager`，可以完整使用 `priority / ownerPurposeId / ignorePresentationLock`。如果先从 Renderer 触发，需要补齐 IPC 透传字段。

舞蹈续跳策略：

- 音乐触发的 playId 统一使用 `music-dance-*` 前缀。
- `SpritePlayCommand` 会记录 `trigger` 与 `sessionMode`，用于区分“音乐舞蹈 trigger 动画”和“idle 状态绑定动画”。
- 如果服务处于 `dancing`，音频仍满足音乐条件，并且当前播放不再是 `music-dance-*` 动画，则检查 `SpriteManager.isIdlePresentationActive()`。
- 只有当前精灵已经回到 idle 站立动画时才重新触发 `music:dance`；如果当前是拖拽、行走、困倦、任务演出或其他 trigger 动画，只记录等待日志，不抢占。
- 如果上一段音乐舞蹈已经真实进入播放，回到 idle 后只保留短防抖间隔；如果没有动画候选或被 presentation lock 拦住，则保持较长重试间隔，避免刷触发。

### 8.4 动画 trigger 命名

建议预留以下自定义 trigger：

- `music:dance`：进入跳舞主动画。
- `music:idle-bop`：轻微律动，适合没有明显节拍或音量较低时。
- `music:beat`：beat tick 增强，不一定直接播放完整动画。
- `music:stop`：退出音乐状态时可播放收尾动画。

第一阶段只强制支持 `music:dance`。

## 9. 设置项

建议在 `机能扩展 -> 精灵管理` 或独立“音乐响应”分组中新增：

- 开关：`听到音乐时跳舞`
- 音频来源：
  - 自动
  - 应用内播放器
  - 系统音频
  - 麦克风测试
- 灵敏度：低 / 中 / 高
- 触发动画：默认 `music:dance`，允许用户选择已有 trigger。
- 调试信息：显示当前音量、音乐分数、状态、BPM。

配置建议：

```ts
export interface MusicReactivityPreferences {
  enabled: boolean;
  source: 'auto' | AudioCaptureSource;
  sensitivity: 'low' | 'medium' | 'high';
  danceTrigger: string;
  idleBopTrigger?: string;
  stopTrigger?: string;
  showDebugOverlay?: boolean;
}
```

持久化位置可沿用现有 preferences config；运行状态不入库。

## 10. 与现有精灵系统的关系

现有能力可直接复用：

- `SpriteAnimationMeta.primaryTrigger`
- `SpriteAnimationMeta.triggerAliases`
- `AnimationRegistry.findCandidatesByTrigger`
- `SpriteManager.trigger`
- `SpriteAnimationPlaylistMode`
- 动画播放时的 `movement`

需要补充：

- 一组推荐 trigger 名称。
- 一个音乐状态服务，负责触发 `SpriteManager.trigger`。
- 设置 UI 和调试状态。
- 如果希望 Renderer 可触发带优先级的音乐动画，需要补齐 `sprite:trigger` IPC 对 `priority / playId / ownerPurposeId / ignorePresentationLock` 的透传。

## 11. 降级策略

- 没有系统音频权限：显示不可用状态，不自动改用麦克风，除非用户选择麦克风测试。
- 没有 `music:dance` 动画：不弹错误，可在设置页提示“尚未配置音乐舞蹈动画”。
- 音乐判断不稳定：只进入 `idle-bop`，不进入强跳舞。
- BPM 置信度低：动画保持默认速度，仅用音量做轻微幅度变化。
- CPU 压力高：降低模型推理频率，保留能量检测。

## 12. 分阶段实施计划

### Phase 0：设计与触发约定

- 新增本文档。
- 明确默认 trigger：`music:dance`。
- 在精灵触发器选择 UI 中让自定义 trigger 可被配置。
- 确认 `SpriteManager.trigger` 可作为唯一动画入口。

### Phase 1：最小可用闭环

- 新增 `MusicReactivityPreferences`。
- 新增主进程音乐响应服务骨架。
- 支持手动/模拟音频快照输入，用于无采集时调试状态机。
- 状态机满足条件时调用 `SpriteManager.trigger('music:dance', { silent: true })`。
- 设置页增加开关和调试状态。

验收：

- 开启设置后，模拟 `musicProbability` 持续升高能触发跳舞。
- 关闭设置后不会触发。
- 没有对应动画时不会报错。
- 用户已有精灵动画系统不受影响。

### Phase 2：应用内媒体音频分析

- 在资源页 MediaPlayer 内接 Web Audio 分析节点。
- 播放应用内音视频时，将音频特征发送给音乐响应服务。
- 实现 RMS / onset / 简单音乐分数。
- 可真实触发跳舞，不依赖模型。

验收：

- 播放音乐视频能进入跳舞。
- 播放纯人声或静音视频不会稳定触发。
- 暂停/结束播放后能退出跳舞。

### Phase 3：系统音频采集

- 新增平台采集适配器。
- macOS / Windows / Linux 分平台标记能力状态。
- 设置页显示权限与采集源状态。
- 采集失败时给出明确恢复建议。

验收：

- 至少一个平台能从系统正在播放的音乐触发跳舞。
- 权限拒绝不会导致主进程异常。
- 原始音频不落盘。

### Phase 4：模型分类

- 接入可本地运行的 AudioSet 类音乐分类模型。
- 模型懒加载，设置开启后再加载。
- 分类结果和启发式结果融合。
- 增加 speech 抑制，减少讲话误触发。

验收：

- 音乐、讲话、环境声三类样本有明显分数差异。
- CPU/内存可接受。
- 模型不可用时自动回退启发式。

### Phase 5：beat / BPM 增强

- 新增 onset peak picking。
- 输出 `beatTick / beatConfidence / bpm`。
- 支持动画速度或动作强度联动。
- 后续可评估 aubio / Essentia。

验收：

- 节拍明显的歌曲能输出稳定 beat tick。
- BPM 半速/倍速误差不会导致动画大幅抖动。
- 动画速度变化有平滑过渡。

## 13. 第一阶段文件落点建议

```text
docs/sprite-core/sprite-music-dance-trigger-design.md
packages/audio-reactivity/types.ts
packages/audio-reactivity/music-reactivity-service.ts
packages/audio-reactivity/controller/dance-trigger-controller.ts
packages/audio-reactivity/analysis/realtime-feature-extractor.ts
packages/audio-reactivity/ipc-main.ts
packages/audio-reactivity/preload.ts
electron/preload/index.ts
electron/main/index.ts
src/pages/ExtensionSettings/SpriteSettings.tsx
```

如果希望第一阶段更轻，可以先不建 `packages/audio-reactivity`，只实现：

```text
packages/sprite-core/music-reactivity/*
```

等应用内媒体和系统音频都接入后，再抽成独立 package。

## 14. 风险

- 系统音频采集是最大不确定性，尤其 macOS 权限和 Electron 版本能力。
- 模型体积和推理成本可能影响桌面助手常驻体验。
- 音乐判断天然会有边界样本：演讲背景乐、游戏 BGM、短视频音效、电影配乐。
- BPM 检测容易出现半速/倍速，不能直接硬绑定动画速度。
- 频繁触发动画可能打断用户正在进行的精灵交互，需要状态机和 presentation lock 协作。

## 15. 推荐默认参数

```ts
export const DEFAULT_MUSIC_REACTIVITY_PREFERENCES = {
  enabled: false,
  source: 'auto',
  sensitivity: 'medium',
  danceTrigger: 'music:dance',
  idleBopTrigger: 'music:idle-bop',
  stopTrigger: 'music:stop',
  showDebugOverlay: false
};

export const MUSIC_REACTIVITY_THRESHOLDS = {
  low: {
    enterProbability: 0.72,
    exitProbability: 0.45,
    enterMs: 3500,
    exitMs: 5000
  },
  medium: {
    enterProbability: 0.62,
    exitProbability: 0.38,
    enterMs: 2500,
    exitMs: 4000
  },
  high: {
    enterProbability: 0.52,
    exitProbability: 0.32,
    enterMs: 1800,
    exitMs: 4500
  }
};
```

## 16. 当前实施决策

先落地 Phase 1，再处理系统音频采集。

原因：

- 精灵动画系统已经支持自定义 trigger，可以很快跑通跳舞体验。
- 系统音频采集跨平台差异大，适合在状态机和设置项稳定后单独攻克。
- 先把 `music:dance` 触发闭环做出来，后续不管音频来源来自应用内播放器、系统 loopback，还是模型分类，都只是在同一入口喂快照。
