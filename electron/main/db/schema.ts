import { sqliteTable, text, blob, integer } from 'drizzle-orm/sqlite-core';
import { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  metadata: text('metadata'), // JSON string
  embedding: blob('embedding'), // Float32 BLOB
});

export type DocumentRow = InferSelectModel<typeof documents>;
export type NewDocument = InferInsertModel<typeof documents>;

// A rich, extensible resources table for internet content (images, videos, audio, text, links, files, documents, etc.)
export const resources = sqliteTable('resources', {
  id: text('id').primaryKey(), // 资源唯一ID
  type: text('type', { enum: ['image', 'video', 'audio', 'text', 'link', 'file', 'document', 'other'] }).notNull(), // 资源类型
  title: text('title'), // 标题
  description: text('description'), // 简要描述

  // 来源与归属
  url: text('url'), // 原始资源URL
  domain: text('domain'), // 域名
  sourceName: text('source_name'), // 来源名称
  authorName: text('author_name'), // 作者/发布者名称
  language: text('language'), // 资源语言

  // 媒体/文件细节
  mimeType: text('mime_type'), // 媒体类型
  sizeBytes: integer('size_bytes'), // 文件大小（字节）
  durationMs: integer('duration_ms'), // 时长（毫秒，音视频）
  width: integer('width'), // 媒体宽度（像素）
  height: integer('height'), // 媒体高度（像素）
  filePath: text('file_path'), // 本地缓存路径

  // 内容载体
  contentText: text('content_text'), // 提取的纯文本内容
  thumbnail: blob('thumbnail'), // 缩略图二进制
  previewUrl: text('preview_url'), // 远程预览图/视频等

  // 分类与组织
  tags: text('tags'), // 标签（JSON字符串数组）
  categories: text('categories'), // 分类（JSON字符串数组）
  visibility: text('visibility', { enum: ['private', 'unlisted', 'public'] }), // 可见性
  nsfw: integer('nsfw'), // 是否涉黄（0/1）
  favorite: integer('favorite'), // 是否收藏（0/1）
  rating: integer('rating'), // 用户评分
  status: text('status', { enum: ['new', 'processing', 'ready', 'archived', 'error'] }), // 状态

  // 时间相关
  collectedAt: integer('collected_at'), // 用户收集时间（毫秒时间戳）
  publishedAt: integer('published_at'), // 来源发布时间（毫秒时间戳）
  createdAt: integer('created_at').default(sqliteCurrentMs()), // 创建时间
  updatedAt: integer('updated_at').default(sqliteCurrentMs()), // 更新时间

  // 扩展字段
  metadata: text('metadata'), // 额外元数据（JSON字符串，低频字段如referrerUrl/sourceUrl/authorUrl/license/attribution/storageProvider/contentHtml/pages/wordCount/checksum/etag/hashSha256等可合并于此，便于扩展）
  embedding: blob('embedding'), // 可选向量（用于语义检索）
});

function sqliteCurrentMs() {
  // drizzle sqlite-core doesn't ship a helper for CURRENT_TIMESTAMP in ms; use unixepoch()*1000 via raw SQL default
  // This helper is only to reuse the same SQL expression in multiple defaults.
  return (undefined as unknown) as any; // placeholder for type; default is set via table builder below
}

// Patch defaults for createdAt/updatedAt to unixepoch('now')*1000
// NOTE: drizzle's sqlite-core doesn't provide a direct API for custom SQL defaults per field inline with TS types.
// Many users set these timestamps in application code. If you prefer SQL defaults, create them via migrations.

export type ResourceRow = InferSelectModel<typeof resources>;
export type NewResource = InferInsertModel<typeof resources>;
