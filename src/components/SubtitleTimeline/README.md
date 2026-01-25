# SubtitleTimeline - 高性能字幕时间轴组件

## 概览

一个专为字幕编辑设计的高性能时间轴组件，支持多轨道、虚拟化渲染、缩放平移等功能。

### 核心特性

- ✅ **虚拟化渲染** - 使用二分查找，只渲染可视区域内的片段，性能极高
- ✅ **多轨道支持** - 支持任意数量的字幕轨道（原文、译文、多语言等）
- ✅ **缩放和平移** - Ctrl+滚轮缩放，拖拽或滚轮平移
- ✅ **交互友好** - 点击时间跳转，双击编辑（可扩展）
- ✅ **完全独立** - 零业务逻辑耦合，易于移植到其他项目
- ✅ **TypeScript** - 完整的类型定义

## 快速开始

### 基础使用

```tsx
import { SubtitleTimeline, aimTracksToTimelineTracks } from '@/components/SubtitleTimeline';

// 从 AimSegments 转换为时间轴格式
const tracks = aimTracksToTimelineTracks(
  [originalSegments, translatedSegments],
  ['原文', '译文']
);

// 渲染时间轴
<SubtitleTimeline
  tracks={tracks}
  currentTime={currentTime}
  onSeek={(time) => player.seek(time)}
/>
```

### 完整示例

```tsx
import { useState } from 'react';
import { 
  SubtitleTimeline, 
  aimTracksToTimelineTracks,
  indicesToIds,
  type TimelineSegment 
} from '@/components/SubtitleTimeline';

function MySubtitleEditor() {
  const [currentTime, setCurrentTime] = useState(0);
  
  // 转换数据
  const tracks = aimTracksToTimelineTracks(
    [mainSegments, translation1, translation2],
    ['原文', '英文翻译', '日文翻译']
  );
  
  // 高亮正在翻译的片段
  const highlightIds = indicesToIds([5, 6, 7], 0); // 轨道0的第5-7个片段
  
  return (
    <SubtitleTimeline
      tracks={tracks}
      currentTime={currentTime}
      onSeek={setCurrentTime}
      onSegmentClick={(segment, trackId) => {
        console.log('点击片段:', segment.text);
      }}
      onSegmentDoubleClick={(segment) => {
        console.log('编辑片段:', segment.id);
      }}
      highlightIds={highlightIds}
      showRuler
      showTrackLabels
      minPixelsPerSecond={10}
      maxPixelsPerSecond={200}
    />
  );
}
```

## API 参考

### SubtitleTimeline Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tracks` | `TimelineTrack[]` | **必需** | 轨道数组 |
| `duration` | `number` | 自动计算 | 总时长（秒） |
| `currentTime` | `number` | - | 当前播放时间（秒） |
| `onSeek` | `(time: number) => void` | - | 时间跳转回调 |
| `onSegmentClick` | `(segment, trackId, event) => void` | - | 片段点击回调 |
| `onSegmentDoubleClick` | `(segment, trackId, event) => void` | - | 片段双击回调 |
| `highlightIds` | `Set<string> \| string[]` | - | 需要高亮的片段 ID |
| `showRuler` | `boolean` | `true` | 是否显示时间刻度 |
| `showTrackLabels` | `boolean` | `true` | 是否显示轨道标签 |
| `trackLabelWidth` | `number` | `80` | 轨道标签宽度 |
| `minPixelsPerSecond` | `number` | `5` | 最小缩放级别 |
| `maxPixelsPerSecond` | `number` | `500` | 最大缩放级别 |
| `disabled` | `boolean` | `false` | 禁用交互 |
| `className` | `string` | - | 自定义类名 |

### 数据类型

#### TimelineTrack

```typescript
interface TimelineTrack {
  id: string;              // 轨道唯一标识
  label: string;           // 轨道名称
  segments: TimelineSegment[];  // 片段列表
  color?: string;          // 轨道颜色（自动分配）
  locked?: boolean;        // 是否锁定
  hidden?: boolean;        // 是否隐藏
  height?: number;         // 轨道高度（像素）
}
```

#### TimelineSegment

```typescript
interface TimelineSegment {
  id: string;              // 唯一标识
  startTime: number;       // 开始时间（秒）
  endTime: number;         // 结束时间（秒）
  text: string;            // 显示文本
  deleted?: boolean;       // 是否被删除
  data?: Record<string, unknown>;  // 自定义数据
}
```

## 工具函数

### aimTracksToTimelineTracks

将 `AimSegments` 格式转换为时间轴格式。

```typescript
function aimTracksToTimelineTracks(
  tracks: AimSegments[][], 
  labels?: string[]
): TimelineTrack[]
```

**示例：**
```typescript
const tracks = aimTracksToTimelineTracks(
  [originalSubtitles, translatedSubtitles],
  ['原文', '译文']
);
```

### indicesToIds

将片段索引转换为 ID 集合（用于高亮）。

```typescript
function indicesToIds(
  indices: Set<number> | number[], 
  trackIndex?: number
): Set<string>
```

**示例：**
```typescript
// 高亮第 0 轨道的第 3、4、5 个片段
const highlightIds = indicesToIds([3, 4, 5], 0);
```

### parseTimeToSeconds / formatSecondsToTime

时间格式转换工具。

```typescript
// 解析时间字符串为秒数
parseTimeToSeconds('00:01:23,456')  // => 83.456

// 格式化秒数为时间字符串
formatSecondsToTime(83.456)  // => '1:23,456'
```

## 交互操作

| 操作 | 功能 |
|------|------|
| **Ctrl + 滚轮** | 缩放（以鼠标位置为中心） |
| **滚轮** | 水平平移 |
| **拖拽空白区域** | 平移时间轴 |
| **点击刻度尺** | 跳转到该时间 |
| **点击片段** | 触发 `onSegmentClick` |
| **双击片段** | 触发 `onSegmentDoubleClick` |
| **工具栏按钮** | 放大/缩小/适配全部 |

## 性能优化

### 虚拟化渲染

组件使用二分查找算法，只渲染可视区域内的片段：

```typescript
// O(log n) 时间复杂度查找可见片段范围
const visibleSegments = getVisibleRange(startTimes, endTimes);
```

**性能数据：**
- 1000 个片段：无卡顿
- 10000 个片段：平滑滚动
- 缩放和平移：<16ms 响应

### 优化建议

1. **避免频繁重建 tracks**：使用 `useMemo` 缓存轨道数据
2. **使用稳定的 ID**：确保 `segment.id` 在重渲染时保持稳定
3. **限制轨道数量**：建议不超过 10 个轨道

## 集成到项目

### 在字幕播放器中使用

参考 `ResourceSubtitlePlayer.tsx` 的实现：

```tsx
const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

// 转换数据
const timelineTracks = aimTracksToTimelineTracks(tracks, ['原文', '译文']);
const highlightIds = indicesToIds(translatingChunks, 0);

return (
  <div>
    {/* 切换按钮 */}
    <Button onClick={() => setViewMode('timeline')}>
      时间轴视图
    </Button>
    
    {/* 根据模式显示不同视图 */}
    {viewMode === 'timeline' ? (
      <SubtitleTimeline
        tracks={timelineTracks}
        currentTime={currentTime}
        onSeek={onSeek}
        highlightIds={highlightIds}
      />
    ) : (
      <SubtitlePlayer {...props} />
    )}
  </div>
);
```

## 自定义样式

组件使用 Tailwind CSS 和 CSS 变量，可通过主题系统自定义：

```css
/* 修改主色调 */
:root {
  --primary: 210 80% 60%;
}

/* 修改轨道颜色 */
.timeline-track {
  background: hsl(210, 80%, 60%);
}
```

## 扩展功能

### 添加自定义工具栏

```tsx
<SubtitleTimeline {...props}>
  <div slot="toolbar">
    <Button>导出</Button>
    <Button>撤销</Button>
  </div>
</SubtitleTimeline>
```

### 监听视口变化

```tsx
<SubtitleTimeline
  onViewportChange={(viewport) => {
    console.log('缩放级别:', viewport.pixelsPerSecond);
    console.log('可视范围:', viewport.startTime, '-', viewport.endTime);
  }}
/>
```

## 故障排除

### 片段不显示

检查：
1. `segment.endTime > segment.startTime`
2. `segment.text` 不为空
3. 时间格式正确解析

### 性能问题

检查：
1. 是否有过多的轨道（>10）
2. 是否频繁重建 `tracks` 对象
3. 是否在回调中执行了耗时操作

### 时间不同步

确保：
1. `currentTime` 单位为秒
2. `onSeek` 回调正确更新播放器时间

## 文件结构

```
src/components/SubtitleTimeline/
├── index.ts                    # 统一导出
├── SubtitleTimeline.tsx        # 主组件
├── types.ts                    # 类型定义
├── utils.ts                    # 工具函数
├── components/
│   ├── TimeRuler.tsx           # 时间刻度尺
│   ├── TrackLabel.tsx          # 轨道标签
│   └── TimelineTrackView.tsx   # 轨道渲染（虚拟化）
└── hooks/
    ├── useTimelineViewport.ts  # 视口管理
    └── useTimelineInteraction.ts # 交互管理
```

## License

MIT
