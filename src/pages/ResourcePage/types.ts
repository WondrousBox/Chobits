export type ResourceTypes =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'file'
  | 'subtitle'
  | 'document'
  | 'link'
  | 'rss'
  | 'translation'
  | 'summary'
  | 'mindmap'
  | 'note'
  | 'screenshot'
  | 'segments'
  | 'subtitle-edit'
  | 'other';

export type SelectedResourceFileType = {
  _id?: string;
  path: string;
  name?: string;
  url?: string;
  size?: number;
  type?: ResourceTypes;
  extension?: string;
  file?: File;
};

export interface ResourceItem {
  id: string;
  type: 'image' | 'video' | 'audio' | 'text' | 'link' | 'file' | 'document' | 'rss' | 'note' | 'screenshot' | 'other';
  title?: string;
  description?: string;

  // 来源与归属
  url?: string;
  domain?: string;
  sourceName?: string;
  authorName?: string;
  language?: string;

  // 媒体/文件细节
  mimeType?: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  filePath?: string;

  // 内容载体
  contentText?: string;
  thumbnailPath?: string;
  previewUrl?: string;

  // 分类与组织
  tags?: string; // JSON字符串数组
  categories?: string; // JSON字符串数组
  visibility?: 'private' | 'unlisted' | 'public';
  nsfw?: 0 | 1;
  favorite?: 0 | 1;
  rating?: number;
  status?: 'new' | 'processing' | 'ready' | 'archived' | 'error';

  // 时间相关
  collectedAt?: number;
  publishedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;

  // 扩展字段
  metadata?: string; // JSON字符串
  workspaceId?: string;
  folderId?: string;
  parentResourceId?: string; // 父资源ID（用于记录资源来源关系）
}

export type ViewMode = 'grid' | 'list' | 'detail' | 'free';
export type SortField = 'title' | 'createdAt' | 'collectedAt' | 'sizeBytes' | 'rating' | 'type';
export type SortOrder = 'asc' | 'desc';

// 瀑布流布局配置类型
export interface MasonryLayoutConfig {
  version: string; // 配置版本号，用于未来兼容性
  items: MasonryLayoutItem[];
  groups?: MasonryLayoutGroup[];
  gridLayout?: any[]; // react-grid-layout 的布局数据
  viewMode?: ViewMode; // 当前视图模式
}

export interface MasonryLayoutItem {
  resourceId: string;
  fullWidth?: boolean; // 是否占满一行
  groupId?: string; // 如果属于某个分组，则设置此字段
  order?: number; // 排序顺序
}

export interface MasonryLayoutGroup {
  id: string;
  name?: string; // 分组名称（可选）
  resourceIds: string[]; // 分组内的资源ID列表
  layout: 'grid' | 'list'; // 分组内的布局方式：宫格或列表
  order?: number; // 分组排序顺序
}
