# UnifiedBlock 通用块组件设计文档

## 概述

UnifiedBlock 是一个通用的字幕时间轴块组件，通过**能力配置（Capabilities）**驱动，统一支持字幕块、TTS 音频块、剪辑块、媒体块等多种类型的时间轴片段展示与交互。

## 设计目标

1. **统一接口**：所有块类型使用相同的 Props 结构，降低学习成本
2. **配置驱动**：通过 `capabilities` 灵活控制功能开关，无需继承或条件分支
3. **预设简化**：提供常用预设配置，快速创建特定类型块
4. **渐进迁移**：现有组件可逐步迁移，保持向后兼容
5. **易于扩展**：新增功能只需添加子组件和配置项
6. **逻辑复用**：拖拽、布局等核心逻辑通过 hooks 复用

## 现有块类型能力对比

| 能力 | 字幕块 | TTS块 | 剪辑块 | 媒体块 |
|------|--------|-------|--------|--------|
| 文本编辑 | ✅ 可编辑 | ✅ 可编辑 | ❌ | ❌ |
| 文本显示 | ✅ 卡拉OK | ✅ 状态 | ❌ | ❌ |
| 缩略图 | ❌ | ❌ | ❌ | ✅ 视频帧条 |
| 波形 | ❌ | ✅ 可选 | ❌ | ❌ |
| 播放控制 | ❌ | ✅ | ❌ | ❌ |
| 拖拽移动 | ✅ 时长 | ✅ 时长 | ❌ | ✅ 位置 |
| 边缘调整 | ✅ 时长 | ✅ 时长 | ✅ **速度** | ✅ 时长 |
| 顺序号 | ❌ | ❌ | ✅ | ❌ |
| 转场 | ❌ | ❌ | ❌ | ✅ |
| 状态徽章 | ❌ | ✅ | ❌ | ❌ |

## 核心类型定义

### BlockCapabilities - 能力配置

```typescript
interface BlockCapabilities {
  // 文本能力
  text?: {
    enabled: boolean;
    editable: boolean;
    wordHighlight?: boolean;
    maxLength?: number;
  };

  // 缩略图能力
  thumbnail?: {
    enabled: boolean;
    type: 'video-strip' | 'single-image';
    showOverlay?: boolean;
  };

  // 波形能力
  waveform?: {
    enabled: boolean;
    loadMode: 'inline' | 'lazy' | 'none';
  };

  // 播放能力
  playback?: {
    enabled: boolean;
    showPlayButton: boolean;
    showProgress: boolean;
  };

  // 拖拽能力
  drag?: {
    movable: boolean;
    edgeResize: 'time' | 'speed' | 'none';
    minDuration?: number;
    showHandles: boolean;
  };

  // 选中激活能力
  selection?: {
    clickable: boolean;
    editOnSelect: boolean;
    showActionBar: boolean;
  };

  // 特殊能力
  special?: {
    showOrder?: boolean;
    showTransition?: boolean;
    showStatusBadge?: boolean;
    showRateLabel?: boolean;
  };
}
```

### BlockContent - 内容数据

```typescript
interface BlockContent {
  id: string;
  startTime: number;
  endTime: number;
  text?: string;
  deleted?: boolean;

  // 样式
  color?: string;
  opacity?: number;

  // 播放状态
  isPlaying?: boolean;
  playbackProgress?: number;
  playbackRate?: number;

  // 字级别时间戳
  words?: WordTimestamp[];

  // 缩略图数据
  thumbnails?: MediaThumbnail[];

  // 波形数据
  waveform?: {
    data?: number[];
    loading?: boolean;
    error?: string | null;
  };

  // 特殊数据
  order?: number;
  status?: 'pending' | 'synthesizing' | 'completed' | 'error';
  transitionIn?: MediaTransition;
  transitionOut?: MediaTransition;
  mediaType?: 'video' | 'image' | 'audio';
  label?: string;
}
```

### BlockCallbacks - 回调函数

```typescript
interface BlockCallbacks {
  // 基础回调
  onClick?: (id: string, event: React.MouseEvent) => void;
  onDoubleClick?: (id: string, event: React.MouseEvent) => void;

  // 文本回调
  onTextChange?: (id: string, newText: string) => void;

  // 时间回调
  onTimeChange?: (id: string, newStart: number, newEnd: number) => void;
  onMove?: (id: string, newStart: number) => void;
  onResize?: (id: string, edge: 'start' | 'end', newTime: number) => void;

  // 速度回调
  onSpeedChange?: (id: string, newSpeed: number) => void;

  // 播放回调
  onPlay?: (id: string) => void;
  onPause?: (id: string) => void;

  // 操作回调
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
  onMergePrev?: (id: string) => void;

  // 顺序回调
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;

  // 变换回调
  onTransform?: (id: string, transform: Partial<MediaTransform>) => void;
}
```

### BlockLayout - 布局配置

```typescript
interface BlockLayout {
  pixelsPerSecond: number;
  maxDuration?: number;
  trackHeight: number;
  trackColor?: string;
}
```

## 预设配置

```typescript
// 字幕块预设
const SUBTITLE_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: { enabled: true, editable: true, wordHighlight: true },
  drag: { movable: true, edgeResize: 'time', showHandles: true },
  selection: { clickable: true, editOnSelect: true, showActionBar: true }
};

// TTS 块预设
const TTS_BLOCK_CAPABILITIES: BlockCapabilities = {
  text: { enabled: true, editable: true },
  waveform: { enabled: true, loadMode: 'lazy' },
  playback: { enabled: true, showPlayButton: true, showProgress: true },
  drag: { movable: true, edgeResize: 'time', showHandles: true },
  selection: { clickable: true, editOnSelect: true, showActionBar: true },
  special: { showStatusBadge: true, showRateLabel: true }
};

// 剪辑块预设
const CLIP_BLOCK_CAPABILITIES: BlockCapabilities = {
  drag: { movable: false, edgeResize: 'speed', showHandles: true },
  selection: { clickable: true, editOnSelect: false, showActionBar: true },
  special: { showOrder: true, showRateLabel: true }
};

// 媒体块预设
const MEDIA_BLOCK_CAPABILITIES: BlockCapabilities = {
  thumbnail: { enabled: true, type: 'video-strip', showOverlay: true },
  drag: { movable: true, edgeResize: 'time', showHandles: true },
  selection: { clickable: true, editOnSelect: false, showActionBar: true },
  special: { showTransition: true, showRateLabel: true }
};
```

## 组件结构

```
unified/
├── index.ts                    # 导出
├── UnifiedBlock.tsx            # 主组件
├── types.ts                    # 类型定义
├── presets.ts                  # 预设配置
│
├── components/
│   ├── BlockContainer.tsx      # 容器：定位、拖拽、样式
│   ├── BlockContent.tsx        # 内容：文本/缩略图/波形的渲染
│   ├── BlockHandles.tsx        # 边缘手柄
│   ├── BlockActionBar.tsx      # 操作按钮栏
│   ├── BlockProgressBar.tsx    # 播放进度条
│   ├── BlockTimeTooltip.tsx    # 拖拽时间提示
│   ├── BlockOrderBadge.tsx     # 顺序徽章
│   ├── BlockStatusBadge.tsx    # 状态徽章
│   ├── BlockRateLabel.tsx      # 速率标签
│   └── BlockTransitionIndicator.tsx  # 转场指示器
│
└── hooks/
    ├── useBlockDrag.ts         # 拖拽逻辑
    └── useBlockLayout.ts       # 布局计算
```

## 使用示例

### 字幕块

```tsx
<UnifiedBlock
  capabilities={SUBTITLE_BLOCK_CAPABILITIES}
  content={{
    id: 'seg-1',
    startTime: 0,
    endTime: 3,
    text: 'Hello World',
    words: wordTimestamps
  }}
  callbacks={{
    onTextChange: handleTextChange,
    onTimeChange: handleTimeChange,
    onDelete: handleDelete
  }}
  layout={{ pixelsPerSecond: 100, trackHeight: 40 }}
  isSelected={selectedId === 'seg-1'}
/>
```

### 剪辑块

```tsx
<UnifiedBlock
  capabilities={CLIP_BLOCK_CAPABILITIES}
  content={{
    id: 'clip-1',
    startTime: 5,
    endTime: 10,
    order: 0,
    playbackRate: 1.5
  }}
  callbacks={{
    onSpeedChange: handleSpeedChange,
    onMoveUp: handleMoveUp,
    onMoveDown: handleMoveDown
  }}
  layout={{ pixelsPerSecond: 100, trackHeight: 48 }}
/>
```

### 媒体块

```tsx
<UnifiedBlock
  capabilities={MEDIA_BLOCK_CAPABILITIES}
  content={{
    id: 'media-1',
    startTime: 0,
    endTime: 5,
    thumbnails: thumbnailList,
    mediaType: 'video',
    transitionIn: { type: 'fade', duration: 0.5 }
  }}
  callbacks={{
    onMove: handleMove,
    onResize: handleResize,
    onTransform: handleTransform
  }}
  layout={{ pixelsPerSecond: 100, trackHeight: 64 }}
/>
```

## 迁移策略

现有组件可逐步迁移到 UnifiedBlock：

1. **阶段一**：创建 UnifiedBlock，与现有组件并存
2. **阶段二**：新功能使用 UnifiedBlock 实现
3. **阶段三**：逐步将现有组件重构为 UnifiedBlock 的包装
4. **阶段四**：移除旧组件

### 兼容层示例

```tsx
// TimelineSegmentBlock 作为 UnifiedBlock 的包装
export const TimelineSegmentBlock: React.FC<TimelineSegmentBlockProps> = (props) => {
  return (
    <UnifiedBlock
      capabilities={SUBTITLE_BLOCK_CAPABILITIES}
      content={{
        id: props.segment.id,
        startTime: props.segment.startTime,
        endTime: props.segment.endTime,
        text: props.segment.text,
        deleted: props.segment.deleted,
        words: props.words
      }}
      callbacks={{
        onClick: (id, e) => props.onClick?.(props.segment, props.trackId, e),
        onTextChange: (id, text) => props.onTextChange?.(props.segment, props.trackId, text),
        onTimeChange: (id, start, end) => props.onTimeChange?.(props.segment, props.trackId, start, end),
        onDelete: () => props.onDeleteSegment?.(props.segment, props.trackId)
      }}
      layout={{
        pixelsPerSecond: props.pixelsPerSecond,
        maxDuration: props.maxDuration,
        trackHeight: props.trackHeight,
        trackColor: props.trackColor
      }}
      isActive={props.isActive}
      isSelected={props.isSelected}
      disabled={props.disabled}
    />
  );
};
```

## 扩展指南

### 添加新能力

1. 在 `types.ts` 中添加能力配置类型
2. 在 `UnifiedBlock.tsx` 中添加条件渲染逻辑
3. 创建对应的子组件（如需要）
4. 更新预设配置

### 添加新块类型

1. 创建新的预设配置
2. 定义内容数据结构
3. 使用 UnifiedBlock 渲染

## 性能考虑

1. **条件渲染**：根据 capabilities 只渲染需要的子组件
2. **useMemo 缓存**：布局计算、样式生成使用 useMemo
3. **事件委托**：拖拽事件在 document 级别监听，避免重复绑定
4. **CSS containment**：使用 `contain: layout style` 优化重绘
