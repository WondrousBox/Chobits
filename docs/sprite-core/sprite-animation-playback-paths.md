# Sprite 动画播放入口与状态变更说明

本文记录 `sprite-core` 中会让角色播放动画的主要入口，并明确哪些入口会修改状态机里的 `SpriteState / SpriteReactionState`，哪些只改变当前视觉动画。

## 两个概念先分开

`SpriteState` / `SpriteReactionState` 是行为状态，由 `SpriteStateMachine` 管理，可通过 `getState()` / `getSubState()` 读取，也会下发 `sprite:state`。

`currentAnimation` 是当前屏幕上正在播放的视觉动画，由 `SpriteManager.playAnimationEntry()` 更新，并下发 `sprite:play`。它不等同于状态。角色可能处于 `idle` 状态，但正在播放一个显式触发的 `welcome` 动画。

`SpritePlayCommand.sessionMode` 用来区分动画来源：

| `sessionMode` | 含义                       | 常见来源                                                           |
| ------------- | -------------------------- | ------------------------------------------------------------------ |
| `state-bound` | 由状态机状态解析出来的动画 | `transitionTo()` / `playOnce()` / 回 idle                          |
| `trigger`     | 显式事件触发的动画         | `trigger()` / `triggerById()` / routine `playAnimation`            |

判断“角色现在是什么行为状态”看 `getState()` / `getSubState()`；判断“屏幕上现在播放的是什么”看 `getCurrentAnimation()`。

## 核心播放路径

| 入口                                                                                        | 是否触发状态变更 | 播放方式                                                             | 说明                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SpriteManager.transitionTo(state, options)`                                                | 是               | 状态变化后调用 `resolveAndSendAnimation()`                           | 进入持久状态，例如 `walking`、`dragging`、`sleeping`、`bored`。动画按状态映射解析，`sessionMode = 'state-bound'`。如果状态和子状态没有变化且未 `force`，不会播放。 |
| `SpriteManager.playOnce(subState, options)`                                                 | 是               | 内部 `transitionTo('reacting', { subState, force: true })`，定时回退 | 用于真实临时反应，例如点击、sleepy。会先进入 `reacting/<subState>`，再回到 fallback 状态。                                                              |
| `SpriteManager.trigger(trigger, options)`                                                   | 否               | 直接查 `AnimationRegistry` 并 `playAnimationEntry()`                 | 显式事件动画。会替换 `currentAnimation`，但不会修改 `SpriteState`。`sessionMode = 'trigger'`。                                                                     |
| `SpriteManager.triggerById(animationId, options)` / `window.chobits.sprite.testAnimation()` | 否               | 直接按动画 id `playAnimationEntry()`                                 | 开发测试或精确播放资源用。不走状态机，也不按 trigger fallback。                                                                                                    |
| `SpriteManager.resolveAndSendAnimation(state, subState, options)`                           | 否，本身不改     | 根据状态映射 trigger 后 `playAnimationEntry()`                       | 这是状态机变化后的内部播放函数。状态已经在调用它之前被改掉。                                                                                                       |
| `SpriteManager.transitionToIdleAnimation(options)`                                          | 条件触发         | 非 idle 时 `transitionTo('idle')`；已 idle 时直接重播 idle 动画      | 常用于动画完成后回 idle。当前已经是 `idle/null` 时不会改状态，只会重新解析并播放 idle。                                                                            |
| `SpriteManager.handleAnimationComplete(animId, phase, playId)`                              | 条件触发         | 可能推进 playlist，或调用 `transitionToIdleAnimation()`              | 渲染进程上报 `full/outro` 后触发。若当前动画 `autoIdle !== false`，会回到 idle 展示；如果当时状态不是 idle，会产生状态变更。                                       |
| `SpriteManager.speak(text, options)` / `window.chobits.sprite.speak()`                      | 否               | 显示气泡并走 TTS；真实音频播放前可能触发 `talk`                      | `talk` 是系统级语音播放伴随动画，不是状态。只有 TTS 成功并准备下发 `sprite:speak-started` 音频播放事件时才会尝试播放。                                              |

所有真正发送给渲染进程的动画播放命令都会经过 `playAnimationEntry()`，该函数会更新 `currentAnimation`、设置 `sessionMode`、下发 `sprite:play`，但它自己不调用状态机。

## 播放尺寸同步

精灵视频动画的 `width` / `height` / `padding` 是播放窗口尺寸配置，不是视频文件本身的尺寸。`SpriteManager.registerAnimation()` 会把这些字段复制到 `AnimationEntry.playback`；`playAnimationEntry()` 再把它们下发到 `SpritePlayCommand.playback`，同时更新运行时的 `spriteConfig`。渲染进程收到 `sprite:play` 后会合并这些播放尺寸，`SpriteApp` 会调用 `window.chobits.window['sprite:size:set']({ width, height, padding })` 调整精灵窗口大小。

当动画的 `movement.mode` 是 `windowAnimation` 时，`playAnimationEntry()` 会把当前动画的有效播放尺寸快照一起传给注入的 `windowAnimationAdapter`。这是为了弥补主进程窗口动画和渲染进程 `sprite:size:set` 之间的时序差：飞入、淡入、抖动这类稀疏窗口预设不写 `width/height`，窗口管理器会从播放开始时的目标窗口 bounds 继承尺寸。adapter 在主窗口播放这类稀疏预设前，会优先把窗口尺寸同步到当前精灵动画的播放尺寸；如果窗口预设本身写了 `width/height`（例如缩放、脉冲），则关键帧尺寸优先。

## 状态机到动画 trigger 的映射

状态驱动动画会通过 `manager/state-mapping.ts` 的 `mapStateToTrigger()` 转成动画 trigger：

| 状态                           | trigger        |
| ------------------------------ | -------------- |
| `idle`                         | `idle`         |
| `walking`                      | `walk`         |
| `running`                      | `run`          |
| `dragging`                     | `drag`         |
| `sleeping`                     | `sleep`        |
| `bored`                        | `bored`        |
| `reacting/click`               | `click`        |
| `reacting/hold`                | `hold`         |
| `reacting/sleepy`              | `sleep`        |
| `reacting/custom` 或未知子状态 | `idle`         |

所以 `welcome`、`talk`、`celebrate`、`thinking` 这类业务/表达动作不是状态。它们是 trigger，可以播放对应动画，但不会把状态机改成 `welcome` 或 `talk`。

## Preload / IPC 外部入口

| 外部入口                                                         | 主进程路径                                | 是否触发状态变更 | 说明                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `window.chobits.sprite.trigger()` / `sprite:trigger`             | `SpriteManager.trigger()`                 | 否               | 显式事件播放。                                                                      |
| `window.chobits.sprite.testAnimation()` / `sprite:trigger-by-id` | `SpriteManager.triggerById()`             | 否               | 按动画 id 测试播放。                                                                |
| `window.chobits.sprite.animComplete()` / `sprite:anim-complete`  | `SpriteManager.handleAnimationComplete()` | 条件触发         | 可能因 `autoIdle` 回 idle，也可能只推进 playlist。                                  |
| `window.chobits.sprite.ready()` / `sprite:ready`                 | `SpriteManager.handleRendererReady()`     | 否               | 下发初始状态/当前动画，并延迟 `trigger('welcome')`；`welcome` 本身不改状态。        |
| `window.chobits.sprite.speak()` / `sprite:speak`                 | `SpriteManager.speak()`                   | 否               | 说话和显示气泡；TTS 成功播放时由系统级 speech hook 尝试播放 `talk`。                |
| `window.chobits.sprite.interact()` / `sprite:interact`           | `SpriteManager.reportInteraction()`       | 条件触发         | 点击会走状态机；普通 hover / 双击 / context-menu 只上报事件或暂停移动。             |
| `window.chobits.sprite.dragStart()` / `sprite:drag start`        | `SpriteManager.startDrag()`               | 是               | `transitionTo('dragging')`。                                                        |
| `window.chobits.sprite.dragEnd()` / `sprite:drag end`            | `SpriteManager.endDrag()`                 | 是               | `transitionTo('idle')`。                                                            |

## Routine step 入口

| Routine step                                            | 是否触发状态变更 | 播放方式                                                    | 说明                                                                                                                                  |
| ------------------------------------------------------- | ---------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `playAnimation`                                         | 否               | 有 `animationId` 时走 `triggerById()`，否则走 `trigger()`   | `waitFor` 只影响 routine 是否等待完成或时长，不改变状态语义。字符串简写 `playAnimation welcome silent` 会被 normalize 成同一个 step。 |
| `speak`                                                 | 否               | 调用 `SpriteManager.speak()`                                | 不再在 routine step 内局部注入 `talk`；`talk` 由系统级 TTS 播放 hook 统一处理。                                                       |
| `walkTo`                                                | 是               | 通过 `WindowController.walkTo()` 触发 walking/idle 状态     | `onWalkStart` 会 `transitionTo('walking')`，`onWalkEnd` 会回 `idle`。step 收尾还会确保回 idle 展示。                                  |
| `showToast` / `showNotice`                              | 否               | 展示气泡/通知；若满足自动朗读条件，会走系统级 TTS 播放 hook | `speak: false`、静音类别或 TTS 失败时不会触发 `talk`。                                                                                |
| `showBusy` / `updateBusy` / `clearBusy`                 | 否               | 不播放角色动画                                              | 只影响 busy/progress。                                                                                                                |
| `wait` / `waitForEvent` / `openWindow` / `clearMessage` | 否               | 不播放角色动画                                              | 只控制 routine 节奏、窗口或消息。                                                                                                     |

## 语音播放和 `talk`

`talk` 的触发点在系统级语音播放链路上，而不是某个业务入口里：

- `SpriteManager.speak()` 会显示气泡并请求 TTS 播放。
- `showToast()` / `showNotice()` 在允许自动朗读时也会请求 TTS 播放。
- `SpeakService.speak()` 只有在合成成功且即将下发 `sprite:speak-started` 音频播放事件时，才会回调 `SpriteManager` 尝试播放 `talk`。
- `synthesizeSpeech()` 只是预合成，不播放音频，也不会触发 `talk`。

系统级 `talk` 的视觉保护条件是：

```ts
const canUseTalkForSpeech =
  this.getState() === 'idle' && this.getSubState() == null && (!this.currentAnimation || this.currentAnimation.sessionMode === 'state-bound' || this.currentAnimation.trigger === 'idle');
```

这意味着：

- 当前状态必须是 `idle/null`。
- 当前没有动画，或当前动画是状态驱动的 idle 展示，才可以补一个 `talk`。
- 显式 `trigger('idle')` 也被视为 idle-like，可以被 `talk` 替换。
- 如果当前正在播放 `welcome`、`celebrate`、`thinking` 这类显式 trigger 动画，即使状态仍是 idle，也不会用 `talk` 替换它。
- 如果 TTS 被关闭、文本为空、emoji 过滤后为空、合成失败，或只是 `synthesizeSpeech()`，都不会空播 `talk`。

例如：

```ts
// 以现存的 daily.rest-reminder preset 的前两步为例：
('playAnimation wave silent',
  {
    id: 'speak',
    type: 'speak',
    text: '差不多该休息一下了。',
    bubbleDuration: 3600
  });
```

第一步 `wave` 会让 `currentAnimation.trigger = 'wave'`，`sessionMode = 'trigger'`，但状态仍是 `idle`。第二步 `speak` 会发现当前视觉不是 idle-like，因此只说话，不播放 `talk`，避免覆盖 `wave`。

## 交互、移动和默认行为

| 场景                                                                | 是否触发状态变更 | 说明                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reportInteraction('click')`                                        | 是               | `playOnce('click', { durationMs: 800 })`。                                                                                                                                                                       |
| `reportInteraction('double-click' / 'hover-enter' / 'hover-leave')` | 否               | 只发 EventBus 事件。                                                                                                                                                                                             |
| `reportInteraction('context-menu')`                                 | 否               | 只切换 movement suspension，不播放动画。                                                                                                                                                                         |
| `startDrag()` / `endDrag()`                                         | 是               | 分别进入 `dragging` 和 `idle`。                                                                                                                                                                                  |
| `walkTo()` / `runBehaviorMovement()`                                | 是               | 通过 `WindowController` 的 `onWalkStart/onWalkEnd` 进入 `walking` 并回 idle。                                                                                                                                    |
| 动画自带 `playback.movement`                                        | 否               | `direction` 会启动方向自动移动，`windowAnimation` 会通过主进程 adapter 播放窗口动画预设，并可在播放前先放置目标窗口；都不会因此改 `SpriteState`。`walkTo` 仍只作为 behavior movement 执行。                      |
| 默认 sleepy 行为                                                    | 是               | fallback 时 `playOnce('sleepy')`。                                                                                                                                                                               |
| 默认 bored 行为                                                     | 是               | `transitionTo('bored')`。                                                                                                                                                                                        |
| 默认 emotion/action/ambient/seasonal 行为                           | 否               | 通过 `trigger()` 播放表达动画。                                                                                                                                                                                  |
| AppEvent `sprite-event-listener`                                    | 否               | 业务事件统一走 `trigger()`，例如 `thinking`、`success`、`error`、`download`。                                                                                                                                    |

## 完成事件和 `autoIdle`

动画资源的 `playback.autoIdle` 默认按 `true` 处理。当前动画完成时，渲染进程会上报 `sprite:anim-complete`，主进程会进入 `handleAnimationComplete()`：

- 如果是 playlist 动画，可能先推进同一 trigger 的下一条动画，状态不变。
- 如果 `autoIdle === false`，完成后不主动回 idle。
- 如果 `autoIdle !== false`，会调用 `transitionToIdleAnimation()`。
- 当状态不是 `idle/null` 时，回 idle 会触发状态变更。
- 当状态已经是 `idle/null` 时，只会重新解析并播放 idle 动画，不产生状态变化。

因此 `trigger()` 自身不改状态，但它播放的动画完成后，仍可能因为 `autoIdle` 间接让运行时回到 idle 展示。

## 排查规则

如果要判断一个入口会不会改状态，先看它是否调用了以下状态机入口：

- `transitionTo(...)`
- `playOnce(...)`
- 会触发 `WindowController.onWalkStart/onWalkEnd` 的 `walkTo(...)`
- 会在完成事件里进入 `transitionToIdleAnimation(...)`

如果只是 `trigger(...)`、`triggerById(...)` 或 `playAnimationEntry(...)`，它改变的是 `currentAnimation` 和屏幕展示，不改变 `SpriteState`。
