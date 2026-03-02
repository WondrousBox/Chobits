# SubtitleTimeline 字幕时间轴组件

## 概述

SubtitleTimeline 是一个高性能、多功能的字幕时间轴编辑组件，用于显示和编辑字幕、TTS 音频、视频剪辑等多轨道内容。

## 核心特性

- **高性能渲染**：虚拟化渲染，只渲染可视区域及缓冲区内的片段
- **多轨道支持**：支持多个字幕轨道、TTS 音频轨道、媒体轨道并排显示
- **缩放和平移**：Ctrl+滚轮缩放，拖拽平移
- **交互友好**：点击跳转、双击编辑、拖拽调整时间
- **波形显示**：支持音频波形轨道
- **剪辑轨道**：支持视频片段剪辑、切割、删除
- **媒体轨道**：支持视频/图片媒体添加、拖拽导入、变换编辑、转场效果
- **标注轨道**：支持字幕文本标注（高亮、笔记、词汇、评论），时间轴展示标注标记

## 文件结构

```
SubtitleTimeline/
├── SubtitleTimeline.tsx    # 主组件
├── types.ts                # 类型定义
├── utils.ts                # 工具函数
├── utils/
│   └── clipSequence.ts     # 剪辑序列引擎
├── hooks/
│   ├── index.ts
│   ├── useTimelineInteraction.ts  # 鼠标交互处理
│   ├── useTimelineViewport.ts     # 视口状态管理
│   └── useClipPlayback.ts         # 剪辑播放调度
├── components/
│   ├── index.ts                    # 统一导出
│   ├── shared/                     # 共享组件
│   │   ├── index.ts
│   │   ├── SeekBar.tsx             # 播放进度条
│   │   ├── TimeRuler.tsx           # 时间刻度尺
│   │   ├── TrackLabel.tsx          # 轨道标签
│   │   ├── TimelineSegmentBlock.tsx # 字幕片段块
│   │   ├── TimelineTrackView.tsx   # 轨道视图容器
│   │   ├── TransitionIndicator.tsx # 转场指示器
│   │   └── WaveformTrack.tsx       # 波形轨道
│   ├── tts/                        # TTS 轨道组件
│   │   ├── index.ts
│   │   ├── TTSAudioTrack.tsx       # TTS 音频轨道
│   │   ├── TTSAudioBlock.tsx       # TTS 音频块
│   │   └── TTSTrackLabel.tsx       # TTS 轨道标签
│   ├── media/                      # 媒体轨道组件
│   │   ├── index.ts
│   │   ├── MediaTrack.tsx          # 媒体轨道
│   │   ├── MediaTrackLabel.tsx     # 媒体轨道标签
│   │   ├── MediaTrackManager.tsx   # 多轨道管理器
│   │   ├── MediaSegmentBlock.tsx   # 媒体片段块
│   │   ├── MediaTrackQuickAdd.tsx  # 快速添加媒体
│   │   ├── MediaImportPanel.tsx    # 媒体导入面板
│   │   ├── MediaTransformPanel.tsx # 变换编辑面板
│   │   ├── MediaTransitionSelector.tsx # 转场选择器
│   │   └── ThumbnailStrip.tsx      # 缩略图条
│   ├── clip/                       # 剪辑轨道组件
│   │   ├── index.ts
│   │   ├── ClipTrack.tsx           # 剪辑轨道
│   │   ├── ClipTrackLabel.tsx      # 剪辑轨道标签
│   │   └── ClipSegmentBlock.tsx    # 剪辑片段块
│   └── annotation/                 # 标注轨道组件
│       ├── index.ts
│       ├── AnnotationTrack.tsx     # 标注轨道
│       └── AnnotationTrackLabel.tsx # 标注轨道标签
└── README.md                       # 本文档
```

## 核心类型定义

### TimelineSegment - 时间片段

时间轴上的基本单元，代表一个字幕片段。

```typescript
interface TimelineSegment {
  id: string; // 唯一标识，格式: t{trackIndex}-{segmentIndex}
  startTime: number; // 开始时间（秒）
  endTime: number; // 结束时间（秒）
  text: string; // 显示文本
  deleted?: boolean; // 是否被删除/禁用
  data?: Record<string, unknown>; // 自定义数据（存储原始 AimSegments）
}
```

### TimelineTrack - 轨道

```typescript
interface TimelineTrack {
  id: string; // 轨道唯一标识，格式: track-{index}
  label: string; // 轨道名称（显示在左侧）
  segments: TimelineSegment[]; // 片段列表
  color?: string; // 轨道颜色
  locked?: boolean; // 是否锁定
  hidden?: boolean; // 是否隐藏
  height?: number; // 轨道高度（像素）
}
```

### TTSAudioItem - TTS 音频项

```typescript
interface TTSAudioItem {
  index: number; // 对应的字幕索引
  status: 'pending' | 'synthesizing' | 'completed' | 'error';
  audioPath?: string; // 音频文件路径
  duration?: number; // 原始时长（秒）
  trimmedDuration?: number; // 去静音后时长
  error?: string; // 错误信息
  startTime: number; // 开始时间（可拖拽调整）
  endTime: number; // 结束时间（可拖拽调整）
  md5?: string; // 内容 MD5（用于更新 history）
}
```

### ClipSegment - 剪辑片段

```typescript
interface ClipSegment {
  id: string; // 唯一标识
  sourceStart: number; // 原始媒体中的开始时间（秒）
  sourceEnd: number; // 原始媒体中的结束时间（秒）
  order: number; // 排列顺序
  playbackRate: number; // 播放速率（1.0 = 正常）
  muted?: boolean; // 是否静音
  label?: string; // 自定义标签
  disabled?: boolean; // 是否禁用
  deleted?: boolean; // 是否删除（软删除，保留占位）
}
```

### MediaSegment - 媒体片段

```typescript
interface MediaSegment {
  id: string; // 唯一标识
  sourceId: string; // 媒体源 ID
  timelineStart: number; // 时间轴上的开始时间（秒）
  timelineEnd: number; // 时间轴上的结束时间（秒）
  sourceStart?: number; // 源媒体中的开始时间（秒，视频类型）
  sourceEnd?: number; // 源媒体中的结束时间（秒，视频类型）
  playbackRate: number; // 播放速率（1.0 = 正常）
  muted: boolean; // 是否静音
  volume: number; // 音量（0-1）
  transform: MediaTransform; // 变换参数
  transitionIn?: MediaTransition; // 入场转场
  transitionOut?: MediaTransition; // 出场转场
  label?: string; // 自定义标签
  thumbnails?: MediaThumbnail[]; // 缩略图列表
  deleted?: boolean; // 是否删除
}
```

### MediaSource - 媒体源

```typescript
interface MediaSource {
  id: string; // 唯一标识
  path: string; // 文件路径
  type: 'video' | 'image'; // 媒体类型
  duration?: number; // 时长（秒，视频类型）
  width: number; // 宽度
  height: number; // 高度
}
```

### MediaTransform - 媒体变换

```typescript
interface MediaTransform {
  x: number; // 水平位置（百分比 0-100）
  y: number; // 垂直位置（百分比 0-100）
  scale: number; // 缩放比例（1.0 = 100%）
  rotation: number; // 旋转角度（0-360）
  opacity: number; // 不透明度（0-1）
  flipX: boolean; // 水平翻转
  flipY: boolean; // 垂直翻转
}
```

### MediaTransition - 转场效果

```typescript
interface MediaTransition {
  type: 'none' | 'fade' | 'dissolve' | 'wipe-left' | 'wipe-right';
  duration: number; // 转场时长（秒）
}
```

### ViewportState - 视口状态

```typescript
interface ViewportState {
  startTime: number; // 可视区域起始时间（秒）
  endTime: number; // 可视区域结束时间（秒）
  pixelsPerSecond: number; // 每秒像素数（缩放级别）
}
```

### WaveformData - 波形数据

```typescript
interface WaveformData {
  peaks: number[]; // 峰值数组（0-1 范围）
  duration: number; // 音频时长（秒）
}
```

### WaveformState - 波形状态

```typescript
interface WaveformState {
  data?: WaveformData; // 波形数据
  loading?: boolean; // 是否加载中
  error?: string | null; // 错误信息
}
```

## 组件 Props

```typescript
interface SubtitleTimelineProps {
  // 数据
  tracks: TimelineTrack[]; // 轨道列表
  duration?: number; // 总时长（秒）
  currentTime?: number; // 当前播放时间
  waveform?: WaveformState; // 波形状态（包含数据、加载状态和错误信息）

  // 显示配置
  showRuler?: boolean; // 显示时间刻度（默认 true）
  showTrackLabels?: boolean; // 显示轨道标签（默认 true）
  showWaveform?: boolean; // 显示波形（默认 true）
  showTTSTrack?: boolean; // 显示 TTS 轨道（默认 true）

  // 缩放配置
  minPixelsPerSecond?: number; // 最小缩放（默认 20）
  maxPixelsPerSecond?: number; // 最大缩放（默认 500）
  initialViewport?: Partial<ViewportState>;

  // TTS 相关
  ttsItemsByTrack?: Map<string, TTSAudioItem[]>;
  ttsTrackLabels?: Map<string, string>;
  subtitleToTTSTrackMap?: Map<string, string>; // track-0 -> 'main'

  // 标注轨道
  annotationTrack?: AnnotationTrackData;
  annotationCallbacks?: AnnotationTrackCallbacks;
  annotationTrackEnabled?: boolean;

  // 剪辑轨道
  clipTrack?: ClipTrackData;
  clipTool?: 'select' | 'cut';

  // 回调
  onSegmentClick?: (segment, trackId, event) => void;
  onSegmentDoubleClick?: (segment, trackId, event) => void;
  onSegmentTextChange?: (segment, trackId, newText) => void;
  onSegmentTimeChange?: (segment, trackId, startTime, endTime) => void;
  onAddSegment?: (trackId, startTime, endTime, text) => void;
  onDeleteSegment?: (segment, trackId) => void;
  onMergePrev?: ({ trackId, segmentIndex }) => void;
  onSeek?: (time: number) => void;
  onViewportChange?: (viewport: ViewportState) => void;

  // TTS 回调
  onPlayTTSAudio?: (index, audioPath) => void;
  onStopTTSAudio?: () => void;
  onTTSTimeChange?: (trackId, index, startTime, endTime) => void;
  onDeleteTTSSegment?: (trackId, index) => void;

  // 标注回调
  annotationCallbacks?: AnnotationTrackCallbacks;

  // 剪辑回调
  clipCallbacks?: ClipTrackCallbacks;
}
```

## 默认配置

```typescript
const DEFAULT_CONFIG = {
  TRACK_HEIGHT: 40, // 默认轨道高度
  TRACK_GAP: 4, // 轨道间距
  RULER_HEIGHT: 28, // 时间刻度高度
  TRACK_LABEL_WIDTH: 100, // 轨道标签宽度
  DEFAULT_PIXELS_PER_SECOND: 100, // 默认缩放
  MIN_PIXELS_PER_SECOND: 20, // 最小缩放
  MAX_PIXELS_PER_SECOND: 500, // 最大缩放
  SEGMENT_MIN_WIDTH: 4, // 片段最小宽度
  ZOOM_STEP: 1.2, // 缩放步进
  CLIP_TRACK_HEIGHT: 48 // 剪辑轨道高度
};
```

## 交互操作

### 快捷键

| 按键                   | 功能                      |
| ---------------------- | ------------------------- |
| `Delete` / `Backspace` | 删除选中的字幕块或 TTS 块 |
| `Ctrl` + 滚轮          | 缩放时间轴                |

### 鼠标操作

| 操作           | 功能                     |
| -------------- | ------------------------ |
| 单击空白处     | 取消选中，跳转到该时间点 |
| 单击片段       | 选中片段                 |
| 双击片段       | 进入文本编辑模式         |
| 拖拽片段边缘   | 调整开始/结束时间        |
| 拖拽空白处     | 平移时间轴               |
| Ctrl + 滚轮    | 以鼠标位置为中心缩放     |
| 单击轨道空白处 | 新增字幕片段             |

## 工具函数

### 时间格式转换

```typescript
// 解析时间字符串为秒数
// 支持: HH:MM:SS,mmm 或 MM:SS,mmm 或 SS,mmm
parseTimeToSeconds(timeStr: string): number

// 秒数格式化为时间字符串
formatSecondsToTime(seconds: number, includeMs?: boolean): string
```

### 数据转换

```typescript
// AimSegments -> TimelineSegment
aimSegmentsToTimelineSegments(segments: AimSegments[], idPrefix?: string): TimelineSegment[]

// 多轨道转换
aimTracksToTimelineTracks(tracks: AimSegments[][], labels?: string[]): TimelineTrack[]
```

### ID 解析

```typescript
// 索引转 ID: (0, 5) -> 't0-5'
indexToSegmentId(trackIndex: number, segmentIndex: number): string

// ID 转索引: 't0-5' -> { trackIndex: 0, segmentIndex: 5 }
parseSegmentId(id: string): { trackIndex: number; segmentIndex: number } | null
```

### 重叠检测

```typescript
// 检测两个时间范围是否重叠
isOverlapping(a: TimeRange, b: TimeRange): boolean

// 检测轨道内所有重叠的时间范围
detectOverlappingSegments(segments: TimelineSegment[]): Set<string>
```

## 剪辑序列引擎 (ClipSequence)

`ClipSequence` 是视频剪辑的核心引擎，采用**源时间布局**设计：

### 设计原则

1. **源时间布局**：片段在轨道上按 `sourceStart/sourceEnd` 位置显示，与字幕轨道对齐
2. **软删除**：删除操作只设置 `deleted` 标记，片段保留在原位显示为空白
3. **不可变操作**：所有修改方法返回新的 `ClipSegment[]`，不修改原数据

### 核心方法

```typescript
class ClipSequence {
  constructor(clips: ClipSegment[]);

  // 查询
  getAllClips(): ClipSegment[];
  getPlaybackInfos(): ClipPlaybackInfo[]; // 活跃片段
  getSkipRegions(): SkipRegion[]; // 需要跳过的区域

  // 时间映射
  playTimeToSource(time: number): ClipTimeMapping | null;
  sourceToPlayTime(sourceTime: number): number | null;
  getSkipTarget(sourceTime: number): number | null;

  // 静态修改方法（返回新数组）
  static cutAtTime(clips: ClipSegment[], cutTime: number): ClipSegment[];
  static deleteClip(clips: ClipSegment[], clipId: string): ClipSegment[];
  static restoreClip(clips: ClipSegment[], clipId: string): ClipSegment[];
  static changeSpeed(clips: ClipSegment[], clipId: string, rate: number): ClipSegment[];
  static toggleDisabled(clips: ClipSegment[], clipId: string): ClipSegment[];
  static createInitial(duration: number): ClipSegment[];
}
```

## 使用示例

### 基础使用

```tsx
import { SubtitleTimeline } from './SubtitleTimeline';

function MyEditor() {
  const tracks = [
    {
      id: 'track-0',
      label: '原文',
      segments: [
        { id: 't0-0', startTime: 0, endTime: 3, text: 'Hello' },
        { id: 't0-1', startTime: 3.5, endTime: 6, text: 'World' }
      ]
    }
  ];

  return (
    <SubtitleTimeline
      tracks={tracks}
      duration={120}
      currentTime={currentTime}
      onSeek={setCurrentTime}
      onSegmentTextChange={(segment, trackId, text) => {
        // 更新字幕文本
      }}
    />
  );
}
```

### 带 TTS 轨道

```tsx
<SubtitleTimeline
  tracks={subtitleTracks}
  ttsItemsByTrack={new Map([['main', ttsItems]])}
  subtitleToTTSTrackMap={new Map([['track-0', 'main']])}
  onPlayTTSAudio={(index, path) => audioRef.current?.play()}
/>
```

### 带标注轨道

```tsx
<SubtitleTimeline
  tracks={subtitleTracks}
  annotationTrack={{ id: 'annotation-main', label: '标注', annotations }}
  annotationCallbacks={{
    onAnnotationClick: (a) => seek(a.startTime),
    onAnnotationDelete: (id) => removeAnnotation(id),
    onAnnotationUpdate: (id, patch) => updateAnnotation(id, patch)
  }}
  annotationTrackEnabled
/>
```

### 带剪辑轨道

```tsx
const [clips, setClips] = useState<ClipSegment[]>(ClipSequence.createInitial(videoDuration));

<SubtitleTimeline
  tracks={subtitleTracks}
  clipTrack={{ id: 'clip-0', label: '剪辑', clips, sourceDuration: videoDuration }}
  clipTool="cut"
  clipCallbacks={{
    onClipCut: (time) => setClips(ClipSequence.cutAtTime(clips, time)),
    onClipDelete: (id) => setClips(ClipSequence.deleteClip(clips, id)),
    onClipRestore: (id) => setClips(ClipSequence.restoreClip(clips, id))
  }}
/>;
```

## 性能优化

1. **虚拟化渲染**：`TimelineTrackView` 只渲染视口附近的片段（带缓冲区）
2. **useMemo 缓存**：轨道颜色、视口计算等使用 `useMemo` 避免重复计算
3. **ResizeObserver**：监听容器尺寸变化，避免频繁 re-render
4. **requestAnimationFrame**：剪辑播放调度使用 RAF 确保流畅

## 注意事项

1. **片段 ID 格式**：必须遵循 `t{trackIndex}-{segmentIndex}` 格式，用于 `parseSegmentId` 解析
2. **轨道 ID 格式**：使用 `track-{index}` 格式
3. **TTS 映射**：`subtitleToTTSTrackMap` 将时间轴轨道 ID 映射到 TTS 轨道 ID（如 `track-0` -> `main`）
4. **原生滚动**：组件使用原生滚动条而非虚拟滚动库，保持原生体验

## 剪辑状态持久化

剪辑轨道的片段状态会自动保存到资源的 `metadata.clipSegments` 字段中，实现跨会话持久化。

### 存储格式

```typescript
// resource.metadata (JSON string)
{
  "clipSegments": [
    {
      "id": "clip-initial-1234567890",
      "sourceStart": 0,
      "sourceEnd": 120.5,
      "order": 0,
      "playbackRate": 1.0
    },
    {
      "id": "clip-L-1234567890",
      "sourceStart": 0,
      "sourceEnd": 30,
      "order": 0,
      "playbackRate": 1.0,
      "label": "片段1 (前)"
    },
    {
      "id": "clip-R-1234567890",
      "sourceStart": 30,
      "sourceEnd": 120.5,
      "order": 1,
      "playbackRate": 1.0,
      "deleted": true  // 软删除标记
    }
  ]
}
```

### 加载与保存流程

1. **加载**：当资源加载且媒体时长可用时，从 `resource.metadata.clipSegments` 读取已保存的剪辑状态
2. **保存**：剪辑状态变更后通过防抖（1秒）自动保存到 `resource.metadata`
3. **卸载时保存**：组件卸载或切换资源时，立即保存未完成的更改

### 实现细节（ResourceSubtitlePlayer.tsx）

```typescript
// 防抖保存剪辑状态
const debouncedSaveClipSegments = useMemo(
  () =>
    debounce(async (resourceId, metadataStr, clips) => {
      const metadata = metadataStr ? JSON.parse(metadataStr) : {};
      await window.YUA.resource['resource:update']({
        id: resourceId,
        patch: { metadata: JSON.stringify({ ...metadata, clipSegments: clips }) }
      });
    }, 1000),
  []
);

// 加载剪辑状态
const loadClipSegmentsFromMetadata = useCallback((metadataStr, mediaDur) => {
  const metadata = metadataStr ? JSON.parse(metadataStr) : {};
  if (Array.isArray(metadata.clipSegments) && metadata.clipSegments.length > 0) {
    setClipSegments(metadata.clipSegments);
    setShowClipTrack(true);
  } else if (mediaDur > 0) {
    setClipSegments(ClipSequence.createInitial(mediaDur));
  }
}, []);
```

## 相关文件

- `ResourceSubtitlePlayer.tsx` - 上层容器组件，处理字幕加载/保存、剪辑状态持久化及标注集成
- `useAnnotations.ts` - 标注数据 Hook（加载/保存/CRUD/高亮计算）
- `@aim-packages/subtitle` - 字幕解析库（AimSegments 格式）
