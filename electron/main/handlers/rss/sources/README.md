# RSS 源处理器

这个目录包含各种 RSS 源的处理器实现。每个源都需要实现 `RssSourceHandler` 接口。

## 如何添加新的 RSS 源

### 1. 创建处理器类

创建一个新文件，例如 `bilibili-handler.ts`：

```typescript
import type { RssFeed, RssFeedItem, RssMetadata, RssSourceType } from '../../../../../src/types/rss';
import type { ChannelInfo, RssSourceHandler } from '../rss-source-handler';

export class BilibiliHandler implements RssSourceHandler {
  readonly sourceType: RssSourceType = 'bilibili';

  detect(input: string): boolean {
    return input.includes('bilibili.com');
  }

  async extractChannelInfo(input: string): Promise<ChannelInfo | null> {
    // 实现从输入中提取频道信息的逻辑
    // 例如：从 URL 中提取 UP 主 ID，获取 RSS Feed URL 等
    return {
      channelId: 'xxx',
      feedUrl: 'https://...',
      channelUrl: 'https://...',
      title: '...'
      // ...
    };
  }

  enhanceFeedItem?(item: RssFeedItem, rawXml?: string): RssFeedItem {
    // 可选：增强解析 Feed 条目
    // 例如：提取 Bilibili 特定的字段（播放量、点赞数等）
    return item;
  }

  enhanceFeed?(feed: RssFeed, rawXml?: string): RssFeed {
    // 可选：增强解析 Feed 元信息
    return feed;
  }

  createMetadata(
    channelInfo: ChannelInfo,
    options?: {
      autoDownload?: boolean;
      downloadQuality?: string;
      downloadFolderId?: string;
      fetchInterval?: number;
    }
  ): RssMetadata {
    return {
      sourceType: 'bilibili',
      feedUrl: channelInfo.feedUrl,
      channelId: channelInfo.channelId,
      channelUrl: channelInfo.channelUrl,
      autoDownload: options?.autoDownload ?? false,
      downloadQuality: options?.downloadQuality ?? 'best',
      downloadFolderId: options?.downloadFolderId,
      enabled: true,
      fetchInterval: options?.fetchInterval
      // ... 其他字段
    };
  }
}
```

### 2. 注册处理器

在 `rss-source-registry.ts` 中注册新处理器：

```typescript
import { BilibiliHandler } from './sources/bilibili-handler';

class RssSourceRegistry {
  constructor() {
    // 注册默认处理器
    this.register(new YouTubeHandler());
    this.register(new BilibiliHandler()); // 添加新处理器
  }
  // ...
}
```

### 3. 更新类型定义（如果需要）

如果添加了新的源类型，需要在 `src/types/rss.ts` 中更新 `RssSourceType`：

```typescript
export type RssSourceType = 'youtube' | 'podcast' | 'blog' | 'bilibili' | 'twitter' | 'custom';
```

## 现有处理器

- **YouTubeHandler**: 处理 YouTube 频道的 RSS 订阅
  - 支持多种输入格式：频道 ID、频道 URL、@用户名
  - 自动从页面提取频道信息
  - 增强解析视频 ID、缩略图、观看次数等

## 接口说明

### RssSourceHandler

所有处理器必须实现此接口：

- `sourceType`: 源类型标识
- `detect(input: string)`: 检测输入是否匹配此源
- `extractChannelInfo(input: string)`: 从输入提取频道信息
- `enhanceFeedItem?(item, rawXml?)`: 可选，增强解析 Feed 条目
- `enhanceFeed?(feed, rawXml?)`: 可选，增强解析 Feed 元信息
- `createMetadata(channelInfo, options?)`: 创建 RSS Metadata

### ChannelInfo

频道信息提取结果：

```typescript
interface ChannelInfo {
  channelId?: string; // 频道/来源 ID
  feedUrl: string; // Feed URL（必需）
  channelUrl?: string; // 频道主页 URL
  title?: string; // 标题
  description?: string; // 描述
  thumbnail?: string; // 缩略图/头像 URL
  subscriberCount?: number; // 订阅者数量
  metadata?: Record<string, unknown>; // 其他元数据
}
```
