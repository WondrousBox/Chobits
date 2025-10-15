# AIAssistant 模块说明

本目录包含浮动助手（renderer 侧）的可视化与交互逻辑，采用“拼装层 + hooks + services + utils + ui”的分层结构，便于复用与维护。

## 结构与职责

- AIAssistant.tsx（组装层）
  - 拼装 UI 与各个 hooks；不直接承载复杂业务与 IPC。

- constants.ts（常量）
  - 尺寸/移动默认参数与开关，例如宽高、步进网格、曲率、帧率等。

- utils/
  - resource.ts：`getResourceTypeFromFilename` 纯函数，按后缀推断资源类型。

- services/
  - resourceService.ts：处理拖拽/选择文件的解析、去重上传与资源入库；可选打开文件列表窗口。

- hooks/
  - useAssistantInit.ts：问候/工作区检查、获取屏幕与 movement 配置（含 padding）、初始窗口定位、阻止默认拖拽行为。
  - useClickThrough.ts：根据鼠标是否在容器内自动切换点击穿透，提供 `setClickThrough`。
  - useDragMove.ts：长按进入拖拽，拖动时移动 Electron 窗口并保持助手可见，含 30fps IPC 节流。
  - useWalkAnimation.ts：行走动画封装（贝塞尔轨迹 + 30fps 节流），并提供 `stopWalking`。
  - useFileDrop.ts：封装 Dropzone 的文件拖拽进入/离开/落下逻辑，并调用资源服务入库。

- ui/
  - DragProgressIndicator.tsx：拖拽准备进度圈。
  - StatusIndicator.tsx：右上角状态表情（拖拽/行走/空闲）。
  - PaddingDebugOverlay.tsx：Padding 边界调试覆盖层（由 `SHOW_PADDING_DEBUG` 控制）。

## 典型用法（简要）

- 初始化：`const { padding, screenSize, messageState, setMessageState } = useAssistantInit()`
- 拖动窗口：`const { bind, isDragging, isDragReady, dragProgress } = useDragMove(containerRef, { screenSize, padding, onHoldStart: () => setMessageState('hold') })`
- 点击穿透：`const { setClickThrough } = useClickThrough(containerRef)`
- 行走动画：`const { animateMoveWindow, stopWalking, isWalking } = useWalkAnimation()`
- 文件拖拽：`const { isFileDragOver, handleDragEnter, handleDragLeave, handleDrop, handleDropFiles } = useFileDrop(stopWalking, setClickThrough)`

## 注意事项

- 所有 IPC 交互尽量封装在 hooks 与 services 内，方便替换与测试。
- `padding` 的最终值来源于主进程的 movement 配置，默认值仅做兜底。
- 移动/动画相关的节流（30fps）是为了减少 IPC 压力，必要时可调优。
- 目录拖拽目前不入库，仅文件会被处理。

## 后续可扩展建议

- 将 `DEFAULT_WALK_SPEED` 与 movement 模式改为设置面板可配置，使用全局状态（Context/Zustand）。
- 为 `utils/resource.ts` 与 `services/resourceService.ts` 增加最小单元测试。
- 在资源上传重复时给出 UI 提示。

## 结构图

```mermaid
flowchart LR
  subgraph Composition[组装层]
    A[AIAssistant.tsx]
  end

  subgraph Hooks[行为 Hooks]
    H1[useAssistantInit]
    H2[useClickThrough]
    H3[useDragMove]
    H4[useWalkAnimation]
    H5[useFileDrop]
  end

  subgraph UI[UI 组件]
    U1[DragProgressIndicator]
    U2[StatusIndicator]
    U3[PaddingDebugOverlay]
  end

  subgraph Services[服务]
    S1[resourceService]
  end

  subgraph Utils[工具]
    UT1[getResourceTypeFromFilename]
  end

  subgraph Consts[常量]
    C1[constants]
  end

  subgraph Other[外部/现有组件]
    O1[VideoSprite]
    O2[messages/MessageBubble]
    O3[common/Dropzone]
    IPC[[window.YUA (IPC)]]
  end

  A --> H1
  A --> H2
  A --> H3
  A --> H4
  A --> H5
  A --> U1
  A --> U2
  A --> U3
  A --> O1
  A --> O2
  A --> O3
  A --> C1

  H3 --> C1
  H4 --> C1
  H1 --> IPC
  H3 --> IPC
  H4 --> IPC

  H5 --> S1
  S1 --> UT1
  S1 --> IPC

  style A fill:#eef,stroke:#88f
  style Hooks fill:#efe,stroke:#5a5
  style UI fill:#fee,stroke:#d77
  style Services fill:#ffe,stroke:#bb0
  style Utils fill:#eef,stroke:#88f
  style Consts fill:#eef,stroke:#88f
  style Other fill:#f6f6f6,stroke:#aaa
```

提示：若 Mermaid 在你的查看环境中未自动渲染，可在支持 Mermaid 的 Markdown 预览中查看，或使用在线 Mermaid 编辑器复制以上代码预览。
