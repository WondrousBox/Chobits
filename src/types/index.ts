export interface VersionInfo {
  update: boolean
  version: string
  newVersion?: string
}

export interface ErrorType {
  message: string
  error: Error
}


export type ResourceTypes =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "file"
  | "subtitle"
  | "document"
  | "link"
  | "other";


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
  id: string
  type: 'image' | 'video' | 'audio' | 'text' | 'link' | 'file' | 'document' | 'other'
  title?: string
  description?: string
  
  // 来源与归属
  url?: string
  domain?: string
  sourceName?: string
  authorName?: string
  language?: string
  
  // 媒体/文件细节
  mimeType?: string
  sizeBytes?: number
  durationMs?: number
  width?: number
  height?: number
  filePath?: string
  
  // 内容载体
  contentText?: string
  thumbnailPath?: string
  previewUrl?: string
  
  // 分类与组织
  tags?: string // JSON字符串数组
  categories?: string // JSON字符串数组
  visibility?: 'private' | 'unlisted' | 'public'
  nsfw?: 0 | 1
  favorite?: 0 | 1
  rating?: number
  status?: 'new' | 'processing' | 'ready' | 'archived' | 'error'
  
  // 时间相关
  collectedAt?: number
  publishedAt?: number
  createdAt?: number
  updatedAt?: number
  deletedAt?: number
  
  // 扩展字段
  metadata?: string // JSON字符串
  workspaceId?: string
}

export type ViewMode = 'grid' | 'list' | 'detail'
export type SortField = 'title' | 'createdAt' | 'collectedAt' | 'sizeBytes' | 'rating' | 'type'
export type SortOrder = 'asc' | 'desc'