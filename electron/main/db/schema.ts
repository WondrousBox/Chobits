import { sqliteTable, text, blob, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { InferInsertModel, InferSelectModel, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

// documents：语义检索与内容管理的“权威表”，存储正文、元信息与向量及其元数据
export const documents = sqliteTable('documents', {
  // 业务主键（全局唯一ID，非 rowid），用于关联与幂等写入
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  // 文档正文（建议为清洗后的纯文本；若很大可结合 contentPath 做外部存储）
  content: text('content').notNull(),
  // 低频/扩展元数据（JSON字符串，例如 UI 状态、额外属性等）
  metadata: text('metadata'),
  // 向量（Float32 BLOB），与 vec_docs 冗余：用于备份/迁移/一致性校验/离线重建索引
  embedding: blob('embedding'),

  // 展示与检索：标题与语言
  title: text('title'), // 标题，列表/搜索结果展示更友好
  language: text('language'), // 文档语言（用于分语言处理与模型选择）
  tags: text('tags'), // 标签（JSON数组字符串），轻量分类/筛选

  // 溯源与类型：与资源表的弱关联及文档类型
  // 外键：documents.sourceId → resources.id（来源删除时置空，来源更新时级联更新）
  sourceId: text('source_id').references(() => resources.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  docType: text('doc_type'), // 文档类型（如 'document' | 'chunk' | 'note' 等）

  // 层级与分块：支持大文档切片与父子关系
  parentId: text('parent_id'), // 父文档ID（用于分块或层级关系）
  chunkIndex: integer('chunk_index'), // 当前分块索引（从0或1开始，约定即可）
  chunkCount: integer('chunk_count'), // 分块总数（用于重组原文）

  // 校验与统计：用于去重、变更检测与成本估算
  checksum: text('checksum'), // 内容校验（如 sha256，支持幂等写入/去重）
  contentTokens: integer('content_tokens'), // 正文 token 数（便于成本控制/分页）

  // 向量元信息：便于模型并存、迁移与一致性校验
  embedModel: text('embed_model'), // 嵌入所用模型（如 'text-embedding-3-large'）
  embedDim: integer('embed_dim'), // 向量维度（与 vec_docs 维度校验）
  embedAt: integer('embed_at'), // 生成向量时间（毫秒）

  // 生命周期与权限：简单流程与可见性控制
  status: text('status'), // 状态（如 new|processing|ready|archived|error）
  visibility: text('visibility'), // 可见性（如 private|unlisted|public）

  // 时间戳：默认当前毫秒；updatedAt 由应用层更新更可靠
  createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`), // 创建时间
  updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`), // 更新时间
  deletedAt: integer('deleted_at'), // 软删除时间（为空表示未删除）

  // 外部内容指针：当 content 很大或需文件存储时，指向外部路径
  contentPath: text('content_path'), // optional external storage pointer
  // 归属工作空间（用于将用户数据统一复制到该空间）
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
}, (t) => ({
  // 按来源筛选（聚合/回溯来源资源）
  idxDocumentsSource: index('idx_documents_source').on(t.sourceId),
  // 父子/层级查询（重组父文档、查找某父下的所有分块）
  idxDocumentsParent: index('idx_documents_parent').on(t.parentId),
  // 分块排序与定位（同父同类型下按分块索引快速访问）
  idxDocumentsDocParentChunk: index('idx_documents_doc_parent_chunk').on(t.docType, t.parentId, t.chunkIndex),
  // 时间排序（最近创建/时间范围检索）
  idxDocumentsCreated: index('idx_documents_created').on(t.createdAt),
  // 流程状态过滤（任务/处理队列/归档筛选）
  idxDocumentsStatus: index('idx_documents_status').on(t.status),
  // 权限过滤（仅展示可见范围内的数据）
  idxDocumentsVisibility: index('idx_documents_visibility').on(t.visibility),
  // 去重与变更检测（基于 checksum 的快速判断）
  idxDocumentsChecksum: index('idx_documents_checksum').on(t.checksum),
  // 惟一性约束：同一父文档下，同一 checksum 只能出现一次（防重复分块/内容）
  uqDocumentsChecksumParent: uniqueIndex('uq_documents_checksum_parent').on(t.checksum, t.parentId),
  // 按工作空间筛选
  idxDocumentsWorkspace: index('idx_documents_workspace').on(t.workspaceId),
}));

export type DocumentRow = InferSelectModel<typeof documents>;
export type NewDocument = InferInsertModel<typeof documents>;

// A rich, extensible resources table for internet content (images, videos, audio, text, links, files, documents, etc.)
export const resources = sqliteTable('resources', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()), // 资源唯一ID
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
  thumbnail: blob('thumbnail'), // 缩略图文件路径（新方案，优先使用）
  thumbnailPath: text('thumbnail_path'), // 缩略图文件路径（新方案，优先使用）
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
  createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`), // 创建时间
  updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`), // 更新时间
  deletedAt: integer('deleted_at'), // 软删除时间（为空表示未删除）

  // 扩展字段
  metadata: text('metadata'), // 额外元数据（JSON字符串，低频字段如referrerUrl/sourceUrl/authorUrl/license/attribution/storageProvider/contentHtml/pages/wordCount/checksum/etag/hashSha256等可合并于此，便于扩展）
  embedding: blob('embedding'), // 可选向量（用于语义检索）
  // 归属工作空间
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
}, (t) => ({
  idxResourcesWorkspace: index('idx_resources_workspace').on(t.workspaceId),
}));

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

/**
 * recycle_bin：统一回收站索引表，仅存索引和快照，不复制原表数据
 * - entityType: 实体类型（如 document/resource）
 * - entityId: 实体主键
 * - title/summary: 展示用快照
 * - reason: 删除原因
 * - deletedAt: 删除时间
 * - deletedBy: 用户标识
 * - payload: 关键字段快照（JSON）
 * - expireAt: 过期时间（可选自动清理）
 */
export const recycle_bin = sqliteTable('recycle_bin', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()), // 回收站索引主键（可用 entityType-entityId 拼接）
  entityType: text('entity_type'), // 实体类型（如 document/resource）
  entityId: text('entity_id'), // 实体主键
  title: text('title'), // 展示标题快照
  summary: text('summary'), // 简要摘要
  reason: text('reason'), // 删除原因
  deletedAt: integer('deleted_at'), // 删除时间
  deletedBy: text('deleted_by'), // 删除人
  payload: text('payload'), // 关键字段快照（JSON字符串）
  expireAt: integer('expire_at'), // 过期时间（可选自动清理）
}, (t) => ({
  uqRecycleEntity: uniqueIndex('uq_recycle_entity').on(t.entityType, t.entityId),
  idxRecycleDeletedAt: index('idx_recycle_deleted_at').on(t.deletedAt),
  idxRecycleExpireAt: index('idx_recycle_expire_at').on(t.expireAt),
}));

export type RecycleBinRow = InferSelectModel<typeof recycle_bin>;
export type NewRecycleBin = InferInsertModel<typeof recycle_bin>;

/**
 * workspaces：用户工作空间（用于集中存放用户采集/导入的数据副本）
 * - rootPath: 磁盘路径（唯一）
 * - isDefault: 是否默认工作空间（应用层保证唯一）
 * - status: 当前状态（active|archived|error）
 * - sizeBytes/fileCount/lastScanAt: 可选的统计信息
 */
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull(),
  description: text('description'),
  isDefault: integer('is_default'), // 0/1
  status: text('status', { enum: ['active', 'archived', 'error'] }),
  sizeBytes: integer('size_bytes'),
  fileCount: integer('file_count'),
  lastScanAt: integer('last_scan_at'),
  metadata: text('metadata'),

  createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
  updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
  deletedAt: integer('deleted_at'),
}, (t) => ({
  uqWorkspacePath: uniqueIndex('uq_workspaces_root_path').on(t.rootPath),
  idxWorkspaceDefault: index('idx_workspaces_is_default').on(t.isDefault),
  idxWorkspaceDeleted: index('idx_workspaces_deleted_at').on(t.deletedAt),
}));

export type WorkspaceRow = InferSelectModel<typeof workspaces>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;
