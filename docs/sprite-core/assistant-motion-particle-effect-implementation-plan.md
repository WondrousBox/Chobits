# AI 桌面助手粒子流光移动特效实施方案

## 1. 文档状态

- 状态：Phase 1 代码完成，待人工视觉验收
- 创建日期：2026-07-14
- 目标版本：第一阶段 `warp` 流光瞬移
- 后续版本：`dash-trail` 实体移动拖尾、多显示器分片覆盖
- 关联方案：[AI 助手粒子扫光出场实施方案](./assistant-particle-scan-entrance-implementation-plan.md)

### 实施进度

- [x] 完成架构调研与窗口职责划分
- [x] 确定独立 `spriteMotionEffect` 屏幕空间窗口方案
- [x] 完成共享运行协议、路径与时间轴纯函数
- [x] 完成主进程窗口生命周期和动作协调器
- [x] 完成覆盖窗口 Canvas 粒子渲染
- [x] 完成主角色消失、跳转、重组同步
- [x] 完成移动配置和编辑器预览接入
- [x] 完成单元测试、类型检查与文档验收记录
- [ ] 用户使用 `pnpm dev` 完成人工视觉验收

## 2. 背景与目标

现有 `spriteEffect` 是跟随主角色窗口的透明局部覆盖层，适合经验值、好感度和首次启动扫光等角色周边特效。移动拖尾要求已经释放的粒子停留在桌面原坐标中，而跟随窗口会让粒子和角色一起移动，无法形成稳定的屏幕空间轨迹。

本方案新增独立的 `spriteMotionEffect` 窗口，在 Electron 全局 DIP 坐标系中覆盖角色的移动路径。第一阶段实现可配置、可预览的 `warp` 流光瞬移：角色在起点粒子化消失，光核沿曲线路径移动，主窗口在不可见阶段跳到目标点，然后在到达闪光中重组。

目标：

1. 不改变现有 `spriteEffect` 的跟随和普通特效语义。
2. 粒子轨迹稳定在桌面坐标中，不随主窗口平移。
3. 角色窗口、覆盖窗口使用同一主进程时间戳同步。
4. 任何加载失败、动画取消或超时都必须恢复角色可见性和交互。
5. 第一阶段可以通过动画编辑器保存配置并直接预览。
6. 协议为后续 `dash-trail` 实体移动拖尾保留扩展点。

非目标：

- 第一阶段不为拖拽操作自动添加粒子。
- 第一阶段不默认替换所有 `walkTo` 日常行走。
- 第一阶段不创建跨越整个虚拟桌面的常驻透明窗口。
- 不引入数据库字段或迁移。

## 3. 架构决策

采用“能力复用、窗口独立”的混合架构：

| 模块 | 职责 |
| --- | --- |
| `spriteEffect` | 继续承载角色局部 XP、好感度、首次登场扫光 |
| `spriteMotionEffect` | 承载桌面屏幕空间中的移动光核、粒子尾迹、起点和终点爆发 |
| `sprite-core` | 定义运行协议、时间轴、路径采样、坐标转换和校验纯函数 |
| Electron main | 计算起终点、创建路径走廊窗口、同步角色跳转、取消和回收 |
| 主角色 Renderer | 根据同一 `run` 执行粒子化消失和到达重组遮罩 |
| 特效 Renderer | 使用 Canvas 2D 绘制确定性的流光、尾迹和残留粒子 |

`spriteMotionEffect` 不设置 `followMain`，也不设置主窗口为 `parent`。窗口默认隐藏、无边框、透明、不可聚焦、鼠标穿透、跳过任务栏并保持置顶。

## 4. 首期用户行为

在精灵动画的“播放时窗口动作”配置中保留现有移动模式，并新增“移动流光”选项：

- `none`：保持现有行为。
- `warp`：目标仍由 `walkTo` 的位置计算逻辑生成，但不执行普通行走；改为播放流光瞬移。
- `dash-trail`：协议保留，第一阶段不在 UI 暴露，待真实位置采样完成后启用。

这样可以只为指定动画启用瞬移，不会让全部自动行走都变成高强度特效。“测试移动”按钮必须走与正式播放相同的协调器，确保预览和运行一致。

## 5. 运行协议

```ts
type SpriteMotionEffectType = 'warp' | 'dash-trail';

interface SpriteMotionEffectPoint {
  x: number;
  y: number;
}

interface SpriteMotionEffectRect extends SpriteMotionEffectPoint {
  width: number;
  height: number;
}

interface SpriteMotionEffectRun {
  runId: string;
  type: SpriteMotionEffectType;
  startsAt: number;
  durationMs: number;
  sourceBounds: SpriteMotionEffectRect;
  destinationBounds: SpriteMotionEffectRect;
  overlayBounds: SpriteMotionEffectRect;
  path: {
    type: 'quadratic';
    start: SpriteMotionEffectPoint;
    control1: SpriteMotionEffectPoint;
    end: SpriteMotionEffectPoint;
  };
  timeline: {
    dissolveEndMs: number;
    travelStartMs: number;
    travelEndMs: number;
    arriveStartMs: number;
    arriveEndMs: number;
  };
  seed: number;
  reducedMotion: boolean;
}
```

约束：

- 所有矩形和路径点由主进程使用 Electron 全局 DIP 坐标生成。
- 特效 Renderer 通过减去 `overlayBounds.x/y` 转换为 Canvas 局部坐标。
- `runId` 用于幂等、取消旧动画和拒绝迟到的完成事件。
- `startsAt` 至少晚于广播时间一个准备间隔，让两个 Renderer 在同一帧基准附近启动。
- `seed` 使用无符号 32 位整数，确保测试和实际渲染的粒子布局可复现。

## 6. 时间轴

标准 `warp` 时间轴：

| 阶段 | 时间 | 主角色窗口 | 特效窗口 |
| --- | ---: | --- | --- |
| 准备 | 广播前 | 保持可见 | 设置走廊边界、显示但 Canvas 为空 |
| 起点蓄能 | `0-180ms` | 发光、溶解至不可见 | 起点聚能环和上浮碎片 |
| 流光穿行 | `180-650ms` | 保持不可见，中段跳到目标坐标 | 光核沿二次贝塞尔曲线移动并释放尾迹 |
| 到达重组 | `600-850ms` | 从粒子遮罩恢复到完整角色 | 终点冲击环、闪光和回落粒子 |
| 残留衰减 | `850-1050ms` | 完整可见且恢复交互 | 尾迹和辉光衰减，完成后清空并隐藏 |

`prefers-reduced-motion` 时间轴缩短为约 `260ms`：起点淡出、窗口跳转、终点淡入，只保留低密度闪光，不绘制长路径尾迹。

## 7. 路径与覆盖窗口

### 7.1 路径

第一阶段使用确定性的二次贝塞尔曲线：

- 起点和终点取角色内容中心，而不是 BrowserWindow 左上角。
- 控制点位于中点法线方向，弯曲量随距离缩放并设置上限。
- 弯曲方向由 `seed` 决定，避免连续瞬移始终朝同一方向弯曲。
- 距离过短时退化为小幅直线闪现。

### 7.2 路径走廊

覆盖窗口边界由贝塞尔曲线的精确包围盒、起终点角色矩形和发光余量合并得到：

```text
overlayBounds = union(pathBounds, sourceBounds, destinationBounds) + glowPadding
```

规则：

- 默认发光余量约 `180 DIP`。
- 宽高至少为 `1`，并取整为 Electron 窗口整数坐标。
- 边界限制在当前涉及显示器的联合边界内，避免无意义的超大透明区域。
- 第一阶段若路径横跨多个显示器，允许一个路径走廊窗口覆盖联合区域；后续优化为每显示器一个分片窗口。

不默认使用全屏窗口的原因：透明 Canvas 像素面积会直接增加合成和清屏成本，在高分辨率及多显示器环境下浪费明显。

## 8. 主进程协调器

新增 `SpriteMotionEffectController`，拥有单实例活动运行：

```text
idle -> preparing -> running -> completing -> idle
                    |              |
                    +-- cancel ----+
```

`playWarp(destination)` 流程：

1. 取消并清理旧 `runId`。
2. 读取主角色当前 bounds，规范化目标 bounds。
3. 构造路径、时间轴和 `overlayBounds`。
4. 确保 `spriteMotionEffect` 已创建并由 Renderer 上报 ready。
5. 设置窗口 bounds、鼠标穿透并 `showInactive()`。
6. 向主角色和特效 Renderer 广播同一 `run`。
7. 在时间轴中段调用主窗口 `setBounds(destinationBounds, false)`。
8. 到达结束后先恢复角色状态，再清空并隐藏覆盖窗口。
9. 记录开始、完成、取消和失败原因。

协调器必须提供 `dispose()`，在主窗口销毁和应用退出路径中清除所有计时器。

### 8.1 fail-open

以下情况直接执行普通目标移动或恢复角色，不允许留下不可见状态：

- 特效窗口创建失败。
- Renderer ready 超时。
- 特效 Renderer 崩溃或提前关闭。
- 主窗口在运行中销毁。
- 收到更新的移动请求导致旧运行取消。
- 完成事件丢失并触发主进程兜底超时。

主角色 Renderer 的隐藏只影响角色内容，不调用主窗口 `hide()`，避免父子窗口、任务栏和焦点状态受到影响。主进程跳转阶段临时屏蔽鼠标事件，结束时恢复现有 hover 穿透策略。

## 9. Renderer 设计

### 9.1 `SpriteMotionEffectPage`

页面只挂载一个全尺寸 Canvas：

- 组件挂载后通过 IPC 上报 ready。
- 收到 `START` 后按 `devicePixelRatio` 调整 backing store。
- 使用 `requestAnimationFrame`，根据 `Date.now() - startsAt` 计算画面，不累计帧时间。
- 每帧先清屏，再绘制残留尾迹、光核、起点/终点爆发。
- 完成后上报 `COMPLETE(runId)` 并清空 Canvas。
- 收到新的运行时立即替换旧运行；收到 `CANCEL` 时清空。

绘制顺序：

1. 低透明度宽光带。
2. 历史采样点构成的渐隐尾迹。
3. 速度方向拉伸粒子。
4. 高亮光核及白色中心。
5. 起点溶解粒子或终点重组粒子。
6. 到达冲击环和短时屏幕混合闪光。

Canvas 使用 `lighter`/`screen` 类加色混合，并限制粒子总数。标准模式目标不超过约 `220` 个活动粒子，降级模式不超过约 `40` 个。

### 9.2 主角色同步 Hook

新增 `useAssistantMotionEffect`：

- 订阅 `START` 和 `CANCEL`。
- 用同一时间轴计算角色 opacity、scale、blur 和 clip/mask 进度。
- 起点溶解结束后角色内容完全不可见。
- 到达阶段从小范围发光遮罩恢复完整角色。
- 结束或异常时无条件恢复内联样式和交互。

该 Hook 与首次登场 Hook 串行：首次登场未完成时不接受移动流光；移动流光运行时不触发新的普通移动。

## 10. IPC 与安全边界

建议通道：

```ts
const SPRITE_MOTION_EFFECT_IPC_CHANNELS = {
  READY: 'sprite:motion-effect:ready',
  START: 'sprite:motion-effect:start',
  CANCEL: 'sprite:motion-effect:cancel',
  COMPLETE: 'sprite:motion-effect:complete'
} as const;
```

- `READY` 只接受当前 `spriteMotionEffect` 窗口发送者。
- `COMPLETE` 只接受主角色或当前特效窗口发送者，并校验活动 `runId`。
- Renderer 无权提交任意全局目标坐标；目标由已经通过 SpriteManager 校验的移动流程提供。
- 主进程对所有数值进行有限值、尺寸和最大路径范围校验。

## 11. 移动系统接入

`SpriteMovementConfig` 增加可选字段：

```ts
motionEffect?: 'none' | 'warp' | 'dash-trail';
```

第一阶段行为：

| 移动模式 | `motionEffect` | 结果 |
| --- | --- | --- |
| `walkTo` | 未设置/`none` | 保持现有贝塞尔行走 |
| `walkTo` | `warp` | 使用相同目标计算，改由运动特效适配器执行瞬移 |
| `direction` | 任意 | 第一阶段保持现状，不启用瞬移 |
| `windowAnimation` | 任意 | 第一阶段保持现状，由窗口动画系统负责 |
| `walkTo` | `dash-trail` | 第一阶段规范化为 `none`，待第二阶段开放 |

`MovementCoordinator` 通过纯接口依赖 `SpriteMotionEffectAdapter`，`sprite-core` 不直接依赖 Electron：

```ts
interface SpriteMotionEffectAdapter {
  play(config: {
    type: 'warp' | 'dash-trail';
    targetX: number;
    targetY: number;
  }): Promise<boolean>;
  cancel?(): void;
}
```

如果适配器返回 `false` 或抛错，协调器 fail-open 到现有 `walkTo`，保证配置不会导致角色无法移动。

## 12. 文件变更计划

| 文件 | 变更 |
| --- | --- |
| `packages/sprite-core/sprite-motion-effect.ts` | 新增协议构造、路径、时间轴、校验与帧采样纯函数 |
| `packages/sprite-core/types.ts` | 新增移动流光配置和 IPC 类型 |
| `packages/sprite-core/manager/types.ts` | 新增平台适配器抽象 |
| `packages/sprite-core/manager/movement-coordinator.ts` | 对 `walkTo + warp` 分流并实现 fail-open |
| `packages/sprite-core/manager/sprite-manager.ts` | 注入并调用运动特效适配器 |
| `packages/sprite-core/handler/sprite-manager-ipc.ts` | 透传主进程适配器依赖 |
| `packages/sprite-core/preload/sprite-bridge.ts` | 暴露 ready、complete 和运行订阅 |
| `electron/main/config/window.ts` | 注册独立 `spriteMotionEffect` 窗口 |
| `electron/main/handlers/sprite-motion-effect.ts` | 新增窗口生命周期和同步协调器 |
| `electron/main/handlers/index.ts` | 初始化控制器并注入 SpriteManager |
| `src/features/sprite-motion-effect/*` | 新增 Canvas 页面、粒子生成和绘制 |
| `src/features/sprite-assistant/hooks/useAssistantMotionEffect.ts` | 新增角色显隐同步 Hook |
| `src/features/sprite-assistant/AIAssistant.tsx` | 应用同步样式和交互保护 |
| `src/App.tsx` | 注册 `/sprite-motion-effect` 路由 |
| `src/pages/ExtensionSettings/SpriteVideoEditor.tsx` | 配置规范化、选择和预览文案 |
| `src/pages/ExtensionSettings/SpriteManager.tsx` | 已保存动画配置编辑入口 |
| `test/sprite-motion-effect.spec.ts` | 路径、时间轴、坐标和确定性测试 |
| `test/movement-coordinator.spec.ts` | warp 分流及 fail-open 测试 |
| `test/window-handlers.spec.ts` 或独立主进程测试 | 窗口 ready、超时、取消、跳转和回收测试 |

## 13. 分阶段实施

### Phase 1：`warp` 完整垂直切片

- 新窗口和 IPC 生命周期。
- 起点溶解、曲线光核、粒子尾迹、终点重组。
- 主角色中段跳转与可见性同步。
- `walkTo` 配置选择、保存和预览。
- fail-open、取消、超时和核心测试。

### Phase 2：`dash-trail`

- 保持真实 `walkTo` 窗口移动。
- 主进程或 WindowController 每 `16-33ms` 提供实际 bounds 样本。
- 去重、插值并向特效窗口发送轨迹样本。
- 停止、碰撞、拖拽抢占时正确收尾。

### Phase 3：多显示器与质量档位

- 按显示器切分路径覆盖窗口。
- 根据 DPR、Canvas 面积和帧耗时动态降低粒子密度。
- 可选颜色主题、速度、尾迹长度和爆发强度配置。

## 14. 测试与验收

自动验证：

```bash
pnpm exec vitest run test/sprite-motion-effect.spec.ts test/movement-coordinator.spec.ts test/window-handlers.spec.ts
pnpm exec tsc --noEmit
```

人工验收由用户使用 `pnpm dev` 启动：

1. 在动画编辑器中选择 `walkTo`，启用 `warp`，点击“测试流光瞬移”。
2. 起点角色应先溶解，不能在光核移动时仍完整显示。
3. 光核轨迹和尾迹应固定在桌面位置，不随角色窗口整体移动。
4. 到达时角色在目标位置重组，不出现一帧起点闪回。
5. 动画过程中点击桌面不应被透明特效窗口拦截。
6. 连续快速预览时只保留最新运行，旧窗口和粒子能被清理。
7. 关闭特效窗口或模拟加载失败后，角色仍能到达并保持可见。
8. 多显示器、负坐标显示器和不同缩放比例下路径位置正确。
9. 开启系统“减少动态效果”后使用短淡出/淡入，不播放长尾迹。

性能基线：

- 标准单显示器路径中目标 `60 FPS`，低端设备最低不持续低于 `30 FPS`。
- 特效结束后无持续 `requestAnimationFrame`、定时器和可见透明窗口。
- 连续播放不累积 Canvas、监听器或活动 `runId`。

## 15. 回滚策略

- 删除或设为 `motionEffect: 'none'` 即恢复原有移动逻辑。
- `spriteMotionEffect` 是独立窗口和路由，不影响 `spriteEffect` 及首次登场扫光。
- 主进程适配器缺失或返回失败时自动执行现有 `walkTo`。
- 配置字段为可选字段，旧角色包无需迁移即可继续工作。

## 16. Phase 1 实施记录

完成日期：2026-07-14。

已落地：

- 新增独立、鼠标穿透且不跟随主角色的 `spriteMotionEffect` 路径走廊窗口。
- 新增共享 `runId`、绝对 `startsAt`、标准/减少动态效果时间轴、确定性二次贝塞尔路径和精确包围盒。
- 新增主进程协调器，覆盖 ready 鉴权、中段跳转、完成、超时、抢占、窗口关闭和 fail-open。
- 新增 Canvas 光核、渐隐光带、确定性粒子、起点蓄能和终点冲击环。
- 新增主角色溶解/重组 Hook，并与首次登场遮罩使用不同包装层。
- 在视频动画编辑器和已保存动画属性编辑器中增加“移动流光 -> 流光瞬移”。
- `animation` 和 `behavior` 触发的 `walkTo + warp` 都会进入新协调器；适配器不可用时回落到普通 `walkTo`。
- `dash-trail` 类型和协议保留，但 UI 尚未开放，按 Phase 2 实施。

自动验证结果：

```text
pnpm exec tsc --noEmit --pretty false
结果：通过

流光、窗口、桥接、Renderer 与首次登场相关测试
结果：8 个测试文件、57 项测试全部通过

lint（本次涉及文件）
结果：0 error；仓库旧文件仍有已有 Prettier warning
```

已知基线：

- `test/sprite-manager-ipc.spec.ts` 单独运行时有 4 个与本功能无关的现有失败。
- 其中 1 个是避让区域期望 `x=300`、当前实现返回 `x=400`；另外 3 个是角色包测试仍期望 `initCharacterService(path)`，当前实现实际为 `initCharacterService(path, { source })`。
- 本次没有修改这些测试或对应实现，流光适配器注入 diff 不经过上述断言路径。

人工验收入口：

1. 执行 `pnpm dev`。
2. 打开精灵视频动画编辑器或已保存动画属性编辑器。
3. 开启“播放时窗口动作”，模式选择“随机行走”。
4. “移动流光”选择“流光瞬移”。
5. 点击“测试流光瞬移”，按第 14 节清单检查视觉、点击穿透和连续播放回收。
