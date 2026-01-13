# RSS 订阅功能设计文档

## 概述

RSS 订阅功能允许用户订阅和管理各种 Feed 源（如 YouTube 频道、播客、博客等），自动获取最新内容，并支持下载到本地资源库。

## 设计目标

1. **统一的订阅管理**：将 YouTube 订阅、播客、博客 RSS 等统一为一种资源类型
2. **良好的用户体验**：提供直观的界面来管理和浏览订阅内容
3. **自动化支持**：支持自动检查更新和自动下载新内容
4. **灵活的扩展性**：支持多种 RSS 来源类型，易于扩展

## 架构设计

### 数据模型

#### 资源表扩展

在 `resources` 表中添加了 `rss` 类型，RSS 订阅作为特殊类型的资源存储：

```typescript
type: 'rss'  // 资源类型
title: string  // 订阅标题（如频道名称）
description: string  // 订阅描述
url: string  // 频道主页 URL
previewUrl: string  // 封面图 URL
metadata: string  // JSON 格式的 RSS 元数据
```

#### RSS 元数据结构

RSS 特有的信息存储在 `metadata` 字段中（JSON 格式）：

```typescript
interface RssMetadata {
  // 基础信息
  sourceType: 'youtube' | 'podcast' | 'blog' | 'bilibili' | 'twitter' | 'custom';
  feedUrl: string;  // 实际的 RSS/Atom Feed 地址
  channelId?: string;  // 频道 ID（如 YouTube 频道 ID）
  channelUrl?: string;  // 频道主页 URL
  
  // 订阅状态
  enabled?: boolean;  // 是否启用
  lastFetchedAt?: number;  // 最后拉取时间
  fetchInterval?: number;  // 拉取间隔（分钟）
  
  // 内容信息
  itemCount?: number;  // Feed 条目数量
  latestItemId?: string;  // 最新条目 ID
  latestItemPublishedAt?: number;  // 最新条目发布时间
  
  // 下载设置
  autoDownload?: boolean;  // 是否自动下载
  downloadQuality?: string;  // 下载质量
  downloadFolderId?: string;  // 下载保存的文件夹 ID
  
  // 统计信息
  subscriberCount?: number;  // 订阅者数量
  totalVideoCount?: number;  // 内容总数
  
  // 展示信息
  coverUrl?: string;  // 封面图
  avatarUrl?: string;  // 头像
  bannerUrl?: string;  // 横幅图
  
  // 错误信息
  lastError?: string;  // 上次错误
  lastErrorAt?: number;  // 错误时间
}
```

#### 统一的 Feed 条目结构

所有来源的 RSS 内容都统一为以下结构：

```typescript
interface RssFeedItem {
  id: string;  // 条目唯一 ID
  title: string;  // 标题
  description?: string;  // 描述
  link: string;  // 链接
  publishedAt: number;  // 发布时间
  updatedAt?: number;  // 更新时间
  author?: string;  // 作者
  thumbnail?: string;  // 缩略图
  durationMs?: number;  // 时长（音视频）
  viewCount?: number;  // 观看次数
  likeCount?: number;  // 点赞数
  mediaType?: 'video' | 'audio' | 'article' | 'image' | 'other';
  mediaUrl?: string;  // 媒体 URL
  downloaded?: boolean;  // 是否已下载
  localResourceId?: string;  // 本地资源 ID
}
```

### 核心功能模块

#### 1. RSS 资源创建 (`rss:create`)

支持多种来源类型的订阅创建：

- **YouTube 频道**：
  - 支持频道 ID、@用户名、频道 URL 等多种格式
  - 自动从页面提取频道信息和 RSS Feed 地址
  - 获取频道标题、头像、订阅者数量等信息

- **通用 RSS/Atom Feed**：
  - 支持任意 RSS 或 Atom Feed 地址
  - 自动检测来源类型（YouTube、Bilibili、Twitter 等）
  - 解析 Feed 元信息（标题、描述、封面等）

#### 2. Feed 内容获取 (`rss:fetchFeed`)

- 解析 RSS 2.0 和 Atom 格式
- 支持 YouTube 特定的扩展字段（视频 ID、观看次数等）
- 检查已下载状态（通过 `parentResourceId` 关联）
- 缓存机制（根据 `fetchInterval` 判断是否需要刷新）

#### 3. 内容下载 (`rss:downloadItem`)

- 生成下载任务信息
- 关联到 RSS 资源（通过 `parentResourceId`）
- 调用视频下载器执行下载
- 下载完成后创建资源记录，关联到 RSS 订阅

#### 4. 订阅管理

- **更新设置** (`rss:update`)：修改订阅配置
- **列出订阅** (`rss:list`)：获取所有 RSS 资源
- **删除订阅** (`rss:delete`)：软删除订阅
- **批量检查更新** (`rss:checkAllUpdates`)：检查所有启用的订阅

### 前端界面设计

#### 1. RSS 订阅卡片 (`RssSubscriptionCard`)

在资源网格中展示订阅，显示：
- 封面图/头像
- 订阅标题和描述
- 来源类型标签
- 订阅者数量、内容数量
- 最后更新时间
- 启用状态、自动下载标识
- 快捷操作（刷新、设置、删除）

#### 2. RSS Feed 列表页面 (`RssFeedPage`)

点击订阅卡片后进入，展示：
- 订阅信息头部（标题、统计信息）
- 搜索栏（搜索 Feed 内容）
- Feed 条目列表（卡片形式）
- 每个条目显示：缩略图、标题、作者、发布时间、观看次数
- 下载按钮（已下载的显示标识）
- 设置对话框（配置订阅选项）

#### 3. 添加订阅对话框 (`AddRssDialog`)

支持三种来源类型：
- **YouTube**：输入频道地址
- **播客**：输入 RSS 地址
- **自定义**：输入任意 Feed 地址

可配置选项：
- 自定义标题
- 自动下载开关
- 下载质量选择

### 数据关联关系

```
resources (type='rss')
  ├── metadata: RssMetadata (JSON)
  └── parentResourceId: null

resources (type='video'|'audio'|...)
  └── parentResourceId: rss_resource_id  // 关联到 RSS 订阅
```

通过 `parentResourceId` 字段，下载的内容可以关联到对应的 RSS 订阅，实现：
- 在 Feed 列表中标记已下载状态
- 查看订阅下的所有已下载内容
- 统计订阅的下载情况

## 实现细节

### RSS Feed 解析

支持两种标准格式：

1. **RSS 2.0**：
   - 解析 `<item>` 标签
   - 提取标题、链接、描述、发布时间
   - 支持 `<enclosure>` 标签（音频/视频）
   - 支持 iTunes 扩展（播客时长）

2. **Atom**：
   - 解析 `<entry>` 标签
   - 提取标题、链接、发布时间
   - 支持 YouTube 特定的 `<yt:videoId>` 等扩展

### YouTube 频道信息提取

支持多种输入格式：
- 频道 ID：`UCxxxxx`
- 频道 URL：`https://www.youtube.com/channel/UCxxxxx`
- 自定义 URL：`https://www.youtube.com/@channelname`
- @用户名：`@channelname`

提取流程：
1. 识别输入格式
2. 对于自定义 URL，从页面 HTML 中提取频道 ID
3. 生成 RSS Feed URL：`https://www.youtube.com/feeds/videos.xml?channel_id=UCxxxxx`
4. 可选：从页面提取频道标题、头像、订阅者数量等信息

### 自动更新机制

设计思路：
1. 在应用启动时启动定时任务
2. 根据 `fetchInterval` 定期检查所有启用的订阅
3. 比较 `latestItemId` 判断是否有新内容
4. 如果启用 `autoDownload`，自动触发下载

实现位置：
- 可以在 `electron/main/index.ts` 中启动定时任务
- 调用 `rss:checkAllUpdates` 接口
- 监听下载完成事件，更新订阅元数据

### 下载器集成

下载流程：
1. 用户点击下载按钮
2. 调用 `rss:downloadItem` 获取下载任务信息
3. 调用 `videoDownloader.downloadVideo` 执行下载
4. 下载完成后，创建资源记录：
   - `type`: 根据内容类型（video/audio）
   - `parentResourceId`: RSS 资源 ID
   - `metadata`: 包含 `itemId` 和 `rssResourceId`
5. 更新 Feed 条目的 `downloaded` 状态

## 使用场景

### 场景 1：订阅 YouTube 频道

1. 用户点击"添加订阅"按钮
2. 选择 YouTube 标签页
3. 输入频道地址（如 `@channelname`）
4. 系统自动解析频道信息并创建订阅
5. 订阅以卡片形式显示在资源列表中
6. 点击卡片进入 Feed 列表，查看最新视频
7. 可以手动下载或启用自动下载

### 场景 2：订阅播客

1. 用户选择"播客"标签页
2. 输入播客的 RSS Feed 地址
3. 系统解析 Feed 并创建订阅
4. 在 Feed 列表中可以看到所有播客节目
5. 点击下载按钮下载音频文件

### 场景 3：自动下载新内容

1. 用户在订阅设置中启用"自动下载"
2. 设置下载质量和检查间隔
3. 系统定期检查订阅更新
4. 发现新内容时自动下载
5. 下载的内容自动关联到订阅

## 扩展性设计

### 添加新的来源类型

1. 在 `RssSourceType` 中添加新类型
2. 在 `rss:create` 中添加对应的解析逻辑
3. 在 `parseRssFeed` 中添加特定字段的提取逻辑
4. 在 `AddRssDialog` 中添加对应的标签页（可选）

### 自定义 Feed 解析

`parseXmlFeed` 函数设计为可扩展：
- 支持标准的 RSS 2.0 和 Atom 格式
- 通过扩展字段支持特定平台的信息
- 可以添加自定义的解析逻辑

### 下载后处理

下载完成后可以扩展：
- 自动添加标签
- 触发工作流
- 发送通知
- 生成字幕等

## 未来改进方向

1. **定时任务系统**：
   - 实现后台定时检查更新
   - 支持自定义检查时间
   - 支持暂停/恢复检查

2. **批量操作**：
   - 批量下载 Feed 条目
   - 批量删除订阅
   - 批量更新设置

3. **内容筛选**：
   - 按关键词筛选 Feed 内容
   - 按时间范围筛选
   - 按类型筛选（视频/音频/文章）

4. **统计和分析**：
   - 订阅更新频率统计
   - 下载内容统计
   - 订阅活跃度分析

5. **通知系统**：
   - 新内容通知
   - 下载完成通知
   - 订阅错误通知

6. **导入/导出**：
   - 导出订阅列表（OPML 格式）
   - 导入订阅列表
   - 订阅配置备份

## 技术要点

### 1. 类型安全

- 使用 TypeScript 严格类型定义
- `RssMetadata` 接口确保数据结构一致性
- 类型检查避免运行时错误

### 2. 错误处理

- Feed 解析失败时记录错误信息
- 网络请求超时处理
- 优雅降级（部分信息缺失时仍可使用）

### 3. 性能优化

- Feed 内容缓存机制
- 按需加载（分页支持）
- 异步处理（不阻塞 UI）

### 4. 用户体验

- 加载状态提示
- 错误提示信息
- 操作反馈（Toast 通知）
- 响应式设计

## 文件结构

```
electron/main/handlers/rss/
  ├── ipc-main.ts          # 后端 IPC 处理器
  ├── ipc-renderer.ts      # 前端 API 定义
  └── README.md            # 本文档

src/pages/ResourcePage/
  ├── RssFeedPage.tsx      # RSS Feed 列表页面
  └── components/
      ├── RssSubscriptionCard.tsx  # RSS 订阅卡片
      └── AddRssDialog.tsx         # 添加订阅对话框

src/types/
  └── rss.ts               # RSS 相关类型定义
```

## 总结

RSS 订阅功能通过统一的资源模型和灵活的元数据结构，实现了对各种 Feed 源的支持。通过良好的界面设计和自动化机制，为用户提供了便捷的内容订阅和管理体验。设计上考虑了扩展性，可以方便地添加新的来源类型和功能。
