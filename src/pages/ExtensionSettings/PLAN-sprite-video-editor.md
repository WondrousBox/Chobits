# 精灵视频动画编辑器增强计划

## 当前系统工作原理

### 三段式动画播放架构

`VideoSprite.tsx` 是渲染器进程中的视频播放组件，使用 HTML5 `<video>` 元素播放 WebM 视频。

#### 时间标记与三段结构

```
四个时间标记定义三段动画：
  start(0ms)  →  loopStartMs  →  loopEndMs  →  end(durationMs)
  ╰── Intro ──╯  ╰── Loop ────╯  ╰── Outro ──╯
```

#### 播放状态机（AnimationPhase）

```
idle → intro → loop(重复N次) → outro → idle
```

**阶段转换规则：**

| 转换         | 触发条件                                               | 动作                                       |
| ------------ | ------------------------------------------------------ | ------------------------------------------ |
| idle → intro | `isPlaying` false→true                                 | `video.currentTime = 0`, 开始播放          |
| intro → loop | `currentTimeMs >= loopStartMs`                         | 自动进入 loop 阶段                         |
| loop → loop  | `currentTimeMs >= loopEndMs - 50` 且 `shouldLoop=true` | `video.currentTime = loopStartMs / 1000`   |
| loop → outro | `isPlaying` true→false 且 `phase === 'loop'`           | `video.currentTime = loopEndMs / 1000`     |
| outro → idle | `currentTimeMs >= durationMs - 50`                     | 暂停，上报 `animComplete(animId, 'outro')` |

#### 数据流

```
主进程 SpriteManager (状态机 / 行为引擎 / 动画注册表)
  ↓ IPC sprite:play
SpriteStateContext (React Context，被动接收状态)
  ↓ props
VideoSprite (<video> 播放 + timeupdate 驱动阶段切换)
  ↓ IPC sprite:anim-complete
主进程 SpriteManager (上报完成，决定下一动画)
```

### 动画注册与存储

- **默认精灵**：`resources/sprites/index.json` + `.webm` 文件（只读，`deletable: false`）
- **用户精灵**：`$SETTINGS_DIR/data/sprites/index.json` + 复制的 `.webm` 文件（`deletable: true`）
- **SpriteAnimation 类型**包含 `loopStartMs`、`loopEndMs`、`durationMs`、`width`、`height`、`padding` 等播放配置
- **注册流程**：渲染器 → `sprite:register` IPC → 复制文件到用户 sprites 目录 → 写入 user `index.json`

### 动画分类体系

使用 `SpriteEventGroups` 分为 14 大组 200+ 事件类型：

| 组别        | 示例事件                                     |
| ----------- | -------------------------------------------- |
| interaction | idle, hover, click, drag, drop, fileDragOver |
| feedback    | success, failure, error, celebrate           |
| status      | loading, processing, waiting                 |
| emotion     | happy, sad, angry, confused, tired, sleep    |
| action      | walk, run, jump, sit, dance, attack          |
| transition  | appear, disappear, enter, exit, fadeIn       |
| connector   | turnLeft, standToSit, readyStance            |
| ambient     | breath, blink, float, idle2                  |
| seasonal    | holiday, halloween, christmas                |
| special     | glow, pulse, sparkle, burst                  |
| workflow    | confirmation, task, update, install          |
| network     | connect, disconnect, sync                    |
| assist      | question, answer, search                     |
| system      | startup, shutdown, minimize                  |

### 绿幕抠图与转码

- **FFmpeg Handler** `convertToSpriteAnimation`：一条 pipeline 完成 segment trim + chromakey filter + VP9/yuva420p 编码
- **chromakey filter**：`chromakey=0xRRGGBB:similarity:blend`，similarity 和 blend 归一化到 0.0-1.0
- **输出格式**：WebM（VP9 codec, `yuva420p` pixel format = 带 Alpha 通道）
- **Canvas 预览**：已有基于 Canvas 的实时色度键预览（逐像素 RGB 欧氏距离计算 + 阈值 + 羽化）

### 关键文件清单

| 文件                                                      | 职责                                              |
| --------------------------------------------------------- | ------------------------------------------------- |
| `src/features/sprite-assistant/renderers/VideoSprite.tsx` | 三段式视频播放渲染器                              |
| `src/pages/ExtensionSettings/SpriteVideoEditor.tsx`       | 精灵视频编辑器（片段标记、色度键、转码）          |
| `src/pages/ExtensionSettings/SpriteManager.tsx`           | 精灵管理 UI（列表、导入、分类、删除）             |
| `packages/sprite-core/types.ts`                           | `SpriteAnimation`、`SpriteEventType` 类型定义     |
| `packages/sprite-core/handler/sprite-assets.ts`           | 精灵资产注册/删除/列表（index.json 读写）         |
| `packages/sprite-core/handler/sprite-manager-ipc.ts`      | 60+ IPC 通道注册                                  |
| `packages/sprite-core/sprite-manager.ts`                  | 主进程 SpriteManager 门面（状态机、行为引擎等）   |
| `packages/sprite-core/animation-registry.ts`              | 动画索引与查找                                    |
| `electron/main/handlers/ffmpeg/ipc-main.ts`               | FFmpeg 处理（`convertToSpriteAnimation` handler） |

---

## 实施计划

### 目标

增强 SpriteVideoEditor，实现完整的用户自定义角色精灵视频动画工作流：

**选视频 → 设分类 → 标三段时间点 → 预览三段循环效果 → 绿幕预览确认 → 转码导入**

### Phase 1: 分类选择增强

**目标**：将事件类型选择从简单文本输入改为 SpriteEventGroups 嵌套下拉菜单

**改动文件**：`src/pages/ExtensionSettings/SpriteVideoEditor.tsx`

**具体步骤**：

1. 替换 `eventType` 的 `<Input>` 为 `<DropdownMenu>` + `<DropdownMenuSub>` 组件
2. 导入 `SpriteEventGroups` 数据（从 `@/features/sprite-assistant`）
3. 下拉菜单结构：顶层按 group 分（interaction/emotion/action 等），展开后显示具体事件类型
4. 参考 `SpriteManager.tsx` 中已有的下拉菜单实现模式

### Phase 2: 三段式预览播放升级

**目标**：新增"完整预览"模式——循环部分播放 3 次后继续播放 outro

**改动文件**：`src/pages/ExtensionSettings/SpriteVideoEditor.tsx`

**具体步骤**：

1. 重写 `previewFull` 函数，实现三段模拟播放：
   - 从 `segments.start` 播放到 `segments.loopStart`（intro）
   - 到达 loopStart 后循环播放 `loopStart→loopEnd` 共 **3 次**
   - 3 次循环后从 `loopEnd` 继续播放到 `segments.end`（outro）后停止
2. 新增 `previewPhaseRef = useRef<'idle'|'intro'|'loop'|'outro'>('idle')` 跟踪当前阶段
3. 新增 `loopCountRef = useRef<number>(0)` 跟踪循环次数
4. 使用 `requestAnimationFrame` 循环检测 `currentTime`，配合循环计数器
5. 新增阶段指示器 UI：视频区域上方显示彩色标签
   - 绿色 `Intro` / 蓝色 `Loop 2/3` / 红色 `Outro` / 灰色 `Idle`
6. 保留现有 `previewLoop` 按钮（loopStart→loopEnd 无限循环）

### Phase 3: 绿幕抠图两步流程

**目标**：拆分为"实时预览对比" → "确认转码"两步

**改动文件**：`src/pages/ExtensionSettings/SpriteVideoEditor.tsx`

**具体步骤**：

1. **并排对比预览**：
   - 启用色度键后自动显示两个区域：左侧原始视频、右侧 Canvas 实时抠图效果
   - 视频预览区改为 `flex` 双栏布局
   - Canvas 渲染循环始终跟随视频帧更新（含暂停帧）

2. **棋盘格背景**：
   - Canvas 容器添加 CSS 棋盘格背景可视化透明区域

3. **吸管取色**：
   - 新增取色模式状态 `isPickingColor: boolean`
   - 点击视频画面时获取该像素 RGB 值，转为 hex 填入 `chromaKey.color`
   - 使用隐藏 Canvas 绘制当前帧 → `getImageData` 获取点击坐标像素
   - 取色按钮使用 `TbColorPicker` 图标（已导入但未使用）

4. **两步 UI 流程**：
   - 当 `chromaKey.enabled` 时，增加描述文案引导用户先预览再转码
   - 无绿幕时流程不变，直接显示"转码并导入"

### Phase 4: 交互完善

**目标**：优化时间轴交互和布局

**改动文件**：`src/pages/ExtensionSettings/SpriteVideoEditor.tsx`

**具体步骤**：

1. **标记约束校验**：
   - 在 `setMarker` 函数中增加约束逻辑
   - 修改标记时自动 clamp 确保 `start <= loopStart <= loopEnd <= end`

2. **时间轴标记拖拽**：
   - 为四个标记线添加 `onMouseDown` → `mousemove` → `mouseup` 拖拽逻辑
   - 拖拽时实时更新标记位置和时间输入框
   - 拖拽时自动 seek 视频到标记位置

3. **编辑器布局微调**：
   - 区域 1：视频选择
   - 区域 2：视频预览（左原始 / 右抠图对比）+ 元数据（标题 + 分类下拉）
   - 区域 3：播放控制栏（播放/暂停 | 循环预览 | 完整预览 | 阶段指示器）
   - 区域 4：时间轴 + 四标记 + 时间输入
   - 区域 5：绿幕抠图设置（开关 + 参数 + 吸管取色）
   - 区域 6：底部操作按钮（转码并导入）

---

## 验证清单

- [ ] 分类选择：打开编辑器 → 下拉显示 14 组事件 → 选中后正确传入 config
- [ ] 三段预览：设标记 → 完整预览 → intro 1次 → loop 3次 → outro 1次 → 停止
- [ ] 阶段指示器：预览过程中正确切换 Intro/Loop N/3/Outro 标签
- [ ] 循环预览：点击循环预览 → 仅在 loopStart-loopEnd 间无限循环
- [ ] 绿幕对比：启用色度键 → 自动并排对比 → 调参实时更新
- [ ] 棋盘格背景：Canvas 透明区域显示棋盘格
- [ ] 吸管取色：点击视频画面 → 颜色自动填入色度键设置
- [ ] 标记约束：输入/设置标记 → start <= loopStart <= loopEnd <= end 自动校正
- [ ] 转码导入：完成设置 → 转码成功 → 精灵注册含 loopStartMs/loopEndMs
- [ ] 列表可见：导入后在 SpriteManager 列表中可见且分类正确

---

## 不修改的文件

| 文件                                            | 原因                                           |
| ----------------------------------------------- | ---------------------------------------------- |
| `VideoSprite.tsx`                               | 播放器逻辑已完善，不需要改                     |
| `packages/sprite-core/types.ts`                 | 类型定义已包含所需字段                         |
| `electron/main/handlers/ffmpeg/ipc-main.ts`     | FFmpeg handler 已支持 chromakey + segment trim |
| `packages/sprite-core/handler/sprite-assets.ts` | 注册逻辑已支持 loopStartMs/loopEndMs           |

## 决策记录

1. **预览范围**：仅在 SpriteVideoEditor 内实现三段循环预览，不改 SpriteManager 卡片
2. **分类体系**：沿用现有 SpriteEventGroups（14 大组 200+ 事件类型）
3. **编辑器策略**：增强现有 SpriteVideoEditor，不重写
4. **绿幕流程**：两步——先 Canvas 实时预览对比确认效果，再 FFmpeg 转码
5. **标记拖拽**：Phase 4 实现时间轴拖拽交互
