import { randomUUID } from 'node:crypto';

import { InferInsertModel, InferSelectModel, relations, sql } from 'drizzle-orm';
import { AnySQLiteColumn, blob, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// documents：语义检索与内容管理的“权威表”，存储正文、元信息与向量及其元数据
export const documents = sqliteTable(
  'documents',
  {
    // 业务主键（全局唯一ID，非 rowid），用于关联与幂等写入
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
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
    sourceId: text('source_id').references((): AnySQLiteColumn => resources.id, { onDelete: 'set null', onUpdate: 'cascade' }),
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
    embedProviderId: text('embed_provider_id'), // 嵌入服务商ID（如 'openai', 'ollama', 'transformers'），用于区分不同服务商的向量
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
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' })
  },
  (t) => ({
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
    idxDocumentsWorkspace: index('idx_documents_workspace').on(t.workspaceId)
  })
);

export type DocumentRow = InferSelectModel<typeof documents>;
export type NewDocument = InferInsertModel<typeof documents>;

/**
 * folders：资源文件夹（支持子文件夹，名称可重命名；磁盘目录使用 ID 命名）
 */
export const folders = sqliteTable(
  'folders',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text('name').notNull(),
    description: text('description'),
    parentId: text('parent_id').references((): AnySQLiteColumn => folders.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    originType: text('origin_type', { enum: ['workspace', 'linked'] }).notNull().default('workspace'),
    linkedMountId: text('linked_mount_id').references(() => linked_folder_mounts.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    relativePath: text('relative_path'),
    metadata: text('metadata'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at'),
    rank: real('rank').default(0)
  },
  (t) => ({
    idxFoldersParent: index('idx_folders_parent').on(t.parentId),
    idxFoldersWorkspace: index('idx_folders_workspace').on(t.workspaceId),
    idxFoldersOrigin: index('idx_folders_origin').on(t.originType),
    idxFoldersLinkedMount: index('idx_folders_linked_mount').on(t.linkedMountId),
    idxFoldersCreated: index('idx_folders_created').on(t.createdAt),
    idxFoldersRank: index('idx_folders_rank').on(t.rank),
    uqFoldersLinkedMountRelativePath: uniqueIndex('uq_folders_linked_mount_relative_path').on(t.linkedMountId, t.relativePath)
  })
);

export type FolderRow = InferSelectModel<typeof folders>;
export type NewFolder = InferInsertModel<typeof folders>;

export const linked_folder_mounts = sqliteTable(
  'linked_folder_mounts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    rootFolderId: text('root_folder_id'),
    absolutePath: text('absolute_path').notNull(),
    displayName: text('display_name').notNull(),
    authorizedAt: integer('authorized_at'),
    status: text('status', { enum: ['active', 'disconnected'] }).notNull().default('active'),
    lastScanAt: integer('last_scan_at'),
    watchEnabled: integer('watch_enabled').default(0),
    metadata: text('metadata'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxLinkedFolderMountsWorkspace: index('idx_linked_folder_mounts_workspace').on(t.workspaceId),
    idxLinkedFolderMountsRootFolder: index('idx_linked_folder_mounts_root_folder').on(t.rootFolderId),
    idxLinkedFolderMountsStatus: index('idx_linked_folder_mounts_status').on(t.status),
    uqLinkedFolderMountsWorkspacePath: uniqueIndex('uq_linked_folder_mounts_workspace_path').on(t.workspaceId, t.absolutePath)
  })
);

export type LinkedFolderMountRow = InferSelectModel<typeof linked_folder_mounts>;
export type NewLinkedFolderMount = InferInsertModel<typeof linked_folder_mounts>;

// A rich, extensible resources table for internet content (images, videos, audio, text, links, files, documents, etc.)
export const resources = sqliteTable(
  'resources',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()), // 资源唯一ID
    type: text('type', {
      enum: [
        'image',
        'video',
        'audio',
        'recording',
        'subtitle',
        'text',
        'link',
        'file',
        'document',
        'rss',
        'translation',
        'summary',
        'mindmap',
        'note',
        'screenshot',
        'segments',
        'subtitle-edit',
        'media-track',
        'other'
      ]
    }).notNull(), // 资源类型（recording=录音，subtitle=字幕，rss=订阅源，translation=翻译数据，summary=总结数据，mindmap=脑图数据，note=笔记，screenshot=截图，subtitle-edit=编排字幕轨道，media-track=媒体轨道）
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
    // 归属文件夹（可为空，表示在根目录）
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    originType: text('origin_type', { enum: ['workspace', 'linked'] }).notNull().default('workspace'),
    linkedMountId: text('linked_mount_id').references(() => linked_folder_mounts.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    relativePath: text('relative_path'),
    externalMtimeMs: integer('external_mtime_ms'),
    externalSizeBytes: integer('external_size_bytes'),
    syncState: text('sync_state', { enum: ['synced', 'missing', 'conflict'] }).default('synced'),
    // 父资源ID（用于记录资源来源，如字幕由视频生成、截图由视频生成等）
    parentResourceId: text('parent_resource_id').references((): AnySQLiteColumn => resources.id, { onDelete: 'set null', onUpdate: 'cascade' })
  },
  (t) => ({
    idxResourcesWorkspace: index('idx_resources_workspace').on(t.workspaceId),
    idxResourcesFolder: index('idx_resources_folder').on(t.folderId),
    idxResourcesOrigin: index('idx_resources_origin').on(t.originType),
    idxResourcesLinkedMount: index('idx_resources_linked_mount').on(t.linkedMountId),
    idxResourcesParent: index('idx_resources_parent').on(t.parentResourceId),
    idxResourcesType: index('idx_resources_type').on(t.type),
    idxResourcesStatus: index('idx_resources_status').on(t.status),
    idxResourcesCreated: index('idx_resources_created').on(t.createdAt),
    idxResourcesFavorite: index('idx_resources_favorite').on(t.favorite),
    uqResourcesLinkedMountRelativePath: uniqueIndex('uq_resources_linked_mount_relative_path').on(t.linkedMountId, t.relativePath)
  })
);

// Patch defaults for createdAt/updatedAt to unixepoch('now')*1000
// NOTE: drizzle's sqlite-core doesn't provide a direct API for custom SQL defaults per field inline with TS types.
// Many users set these timestamps in application code. If you prefer SQL defaults, create them via migrations.

export type ResourceRow = InferSelectModel<typeof resources>;
export type NewResource = InferInsertModel<typeof resources>;

/**
 * resource_tags：资源与标签的归一化表
 * - 冗余资源的 workspaceId 以便快速在工作空间下聚合
 * - 维持去重约束（resourceId + tag 唯一）与常用索引
 */
export const resource_tags = sqliteTable(
  'resource_tags',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    resourceId: text('resource_id')
      .references(() => resources.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    tag: text('tag').notNull(),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    uqResourceTag: uniqueIndex('uq_resource_tag').on(t.resourceId, t.tag),
    idxTag: index('idx_resource_tags_tag').on(t.tag),
    idxWorkspace: index('idx_resource_tags_workspace').on(t.workspaceId)
  })
);

export type ResourceTagRow = InferSelectModel<typeof resource_tags>;
export type NewResourceTag = InferInsertModel<typeof resource_tags>;

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
export const recycle_bin = sqliteTable(
  'recycle_bin',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()), // 回收站索引主键（可用 entityType-entityId 拼接）
    entityType: text('entity_type'), // 实体类型（如 document/resource）
    entityId: text('entity_id'), // 实体主键
    title: text('title'), // 展示标题快照
    summary: text('summary'), // 简要摘要
    reason: text('reason'), // 删除原因
    deletedAt: integer('deleted_at'), // 删除时间
    deletedBy: text('deleted_by'), // 删除人
    payload: text('payload'), // 关键字段快照（JSON字符串）
    expireAt: integer('expire_at') // 过期时间（可选自动清理）
  },
  (t) => ({
    uqRecycleEntity: uniqueIndex('uq_recycle_entity').on(t.entityType, t.entityId),
    idxRecycleDeletedAt: index('idx_recycle_deleted_at').on(t.deletedAt),
    idxRecycleExpireAt: index('idx_recycle_expire_at').on(t.expireAt)
  })
);

export type RecycleBinRow = InferSelectModel<typeof recycle_bin>;
export type NewRecycleBin = InferInsertModel<typeof recycle_bin>;

/**
 * workspaces：用户工作空间（用于集中存放用户采集/导入的数据副本）
 * - rootPath: 磁盘路径（唯一）
 * - isDefault: 是否默认工作空间（应用层保证唯一）
 * - status: 当前状态（active|archived|error）
 * - sizeBytes/fileCount/lastScanAt: 可选的统计信息
 */
export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
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
    deletedAt: integer('deleted_at')
  },
  (t) => ({
    uqWorkspacePath: uniqueIndex('uq_workspaces_root_path').on(t.rootPath),
    idxWorkspaceDefault: index('idx_workspaces_is_default').on(t.isDefault),
    idxWorkspaceDeleted: index('idx_workspaces_deleted_at').on(t.deletedAt)
  })
);

export type WorkspaceRow = InferSelectModel<typeof workspaces>;
export type NewWorkspace = InferInsertModel<typeof workspaces>;

/**
 * conversations：对话会话表
 * - 用于保存聊天历史的会话元数据（标题、归属、模型/实例、计数、最新时间等）
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    // 展示标题（默认取首条用户消息前若干字符，可后续重命名）
    title: text('title'),
    // 归属工作空间（可选）
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    // 关联的智能体、服务商及其预设（用于回放与统计）
    agentId: text('agent_id'),
    providerId: text('provider_id'),
    providerPresetId: text('provider_preset_id'),
    // 统计/排序字段
    messagesCount: integer('messages_count').default(0),
    lastMessageAt: integer('last_message_at'),
    pinned: integer('pinned'), // 0/1 置顶
    // 扩展元数据
    metadata: text('metadata'),
    // 生命周期
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at')
  },
  (t) => ({
    idxConvUpdated: index('idx_conversations_updated').on(t.updatedAt),
    idxConvLastMsg: index('idx_conversations_last_msg').on(t.lastMessageAt),
    idxConvWorkspace: index('idx_conversations_workspace').on(t.workspaceId),
    idxConvDeleted: index('idx_conversations_deleted').on(t.deletedAt),
    idxConvPinned: index('idx_conversations_pinned').on(t.pinned)
  })
);

export type ConversationRow = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;

/**
 * chat_messages：对话消息表
 * - 存储每条聊天消息（角色、内容、时间、序号等）
 */
export const chat_messages = sqliteTable(
  'chat_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),
    role: text('role', { enum: ['system', 'user', 'assistant', 'tool'] }).notNull(),
    content: text('content').notNull(),
    name: text('name'),
    toolCallId: text('tool_call_id'),
    // 逻辑序号（会话内从 1 开始自增，用于稳定排序；由应用层维护）
    seq: integer('seq').notNull(),
    // 扩展元数据
    metadata: text('metadata'),
    // 时间戳
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at')
  },
  (t) => ({
    uqMsgConvSeq: uniqueIndex('uq_chat_messages_conv_seq').on(t.conversationId, t.seq),
    idxMsgConvCreated: index('idx_chat_messages_conv_created').on(t.conversationId, t.createdAt)
  })
);

export type ChatMessageRow = InferSelectModel<typeof chat_messages>;
export type NewChatMessage = InferInsertModel<typeof chat_messages>;

export const conversation_route_events = sqliteTable(
  'conversation_route_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),
    seqStart: integer('seq_start').notNull(),
    seqEnd: integer('seq_end').notNull(),
    type: text('type', {
      enum: [
        'user_goal',
        'topic_shift',
        'task_added',
        'task_progress',
        'task_done',
        'open_question',
        'decision',
        'key_clue',
        'user_correction',
        'constraint',
        'preference',
        'blocker',
        'assumption',
        'summary_checkpoint'
      ]
    }).notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    evidence: text('evidence'),
    status: text('status', { enum: ['active', 'resolved', 'superseded', 'abandoned'] }).notNull().default('active'),
    importance: real('importance').notNull().default(0.5),
    confidence: real('confidence').notNull().default(0.5),
    tags: text('tags'),
    relatedEventIds: text('related_event_ids'),
    resolvesEventIds: text('resolves_event_ids'),
    supersedesEventIds: text('supersedes_event_ids'),
    promotedMemoryNoteId: text('promoted_memory_note_id').references((): AnySQLiteColumn => memory_notes.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    metadata: text('metadata'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxConvRouteEventsConversationSeq: index('idx_conv_route_events_conversation_seq').on(t.conversationId, t.seqStart, t.seqEnd),
    idxConvRouteEventsWorkspace: index('idx_conv_route_events_workspace').on(t.workspaceId),
    idxConvRouteEventsType: index('idx_conv_route_events_type').on(t.type),
    idxConvRouteEventsStatus: index('idx_conv_route_events_status').on(t.status),
    idxConvRouteEventsImportance: index('idx_conv_route_events_importance').on(t.importance)
  })
);

export type ConversationRouteEventRow = InferSelectModel<typeof conversation_route_events>;
export type NewConversationRouteEvent = InferInsertModel<typeof conversation_route_events>;

export const conversation_route_snapshots = sqliteTable(
  'conversation_route_snapshots',
  {
    conversationId: text('conversation_id')
      .primaryKey()
      .references(() => conversations.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    version: integer('version').notNull().default(1),
    lastProcessedSeq: integer('last_processed_seq').notNull().default(0),
    summary: text('summary').notNull().default(''),
    currentGoal: text('current_goal'),
    currentTopic: text('current_topic'),
    nextSuggestedFocus: text('next_suggested_focus'),
    activeThreads: text('active_threads').notNull().default('[]'),
    openTasks: text('open_tasks').notNull().default('[]'),
    resolvedTasks: text('resolved_tasks').notNull().default('[]'),
    keyConstraints: text('key_constraints').notNull().default('[]'),
    userCorrections: text('user_corrections').notNull().default('[]'),
    keyClues: text('key_clues').notNull().default('[]'),
    decisions: text('decisions').notNull().default('[]'),
    blockers: text('blockers').notNull().default('[]'),
    metadata: text('metadata'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxConvRouteSnapshotsWorkspace: index('idx_conv_route_snapshots_workspace').on(t.workspaceId),
    idxConvRouteSnapshotsUpdated: index('idx_conv_route_snapshots_updated').on(t.updatedAt)
  })
);

export type ConversationRouteSnapshotRow = InferSelectModel<typeof conversation_route_snapshots>;
export type NewConversationRouteSnapshot = InferInsertModel<typeof conversation_route_snapshots>;

/**
 * ai_usage_events：AI 使用量事实表
 * - 以单次 provider 调用为粒度记录 token / 费用 / 来源 / 分类 / 精度
 */
export const ai_usage_events = sqliteTable(
  'ai_usage_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    traceId: text('trace_id').notNull(),
    parentEventId: text('parent_event_id'),
    requestId: text('request_id').notNull(),
    providerRequestId: text('provider_request_id'),
    eventFingerprint: text('event_fingerprint').notNull(),
    operationKey: text('operation_key').notNull(),
    attemptIndex: integer('attempt_index').notNull().default(0),

    conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    resourceId: text('resource_id').references(() => resources.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    sourceLabel: text('source_label'),

    usageCategory: text('usage_category').notNull(),
    usageFeature: text('usage_feature').notNull(),
    usageStage: text('usage_stage').notNull(),

    providerId: text('provider_id').notNull(),
    providerPresetId: text('provider_preset_id'),
    model: text('model').notNull(),
    agentId: text('agent_id'),
    status: text('status', { enum: ['completed', 'failed', 'cancelled'] }).notNull(),

    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    totalTokens: integer('total_tokens'),
    billableInputTokens: integer('billable_input_tokens'),
    billableOutputTokens: integer('billable_output_tokens'),
    billableTotalTokens: integer('billable_total_tokens'),
    estimatedCost: real('estimated_cost'),

    meteringSource: text('metering_source').notNull(),
    meteringAccuracy: text('metering_accuracy').notNull(),
    billingEligible: integer('billing_eligible').notNull().default(0),

    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),

    metadata: text('metadata', { mode: 'json' }),
    rawUsage: text('raw_usage', { mode: 'json' })
  },
  (t) => ({
    uqAiUsageProviderReq: uniqueIndex('uq_ai_usage_provider_req').on(t.providerId, t.providerRequestId),
    uqAiUsageFingerprint: uniqueIndex('uq_ai_usage_fingerprint').on(t.eventFingerprint),
    idxAiUsageWorkspaceCreated: index('idx_ai_usage_workspace_created').on(t.workspaceId, t.createdAt),
    idxAiUsageProviderCreated: index('idx_ai_usage_provider_created').on(t.providerId, t.createdAt),
    idxAiUsageModelCreated: index('idx_ai_usage_model_created').on(t.model, t.createdAt),
    idxAiUsageCategoryCreated: index('idx_ai_usage_category_created').on(t.usageCategory, t.createdAt),
    idxAiUsageFeatureCreated: index('idx_ai_usage_feature_created').on(t.usageFeature, t.createdAt),
    idxAiUsageSourceCreated: index('idx_ai_usage_source_created').on(t.sourceType, t.createdAt),
    idxAiUsageRequest: index('idx_ai_usage_request').on(t.requestId),
    idxAiUsageTrace: index('idx_ai_usage_trace').on(t.traceId),
    idxAiUsageConversation: index('idx_ai_usage_conversation').on(t.conversationId),
    idxAiUsageResource: index('idx_ai_usage_resource').on(t.resourceId),
    idxAiUsageOperation: index('idx_ai_usage_operation').on(t.operationKey),
    idxAiUsageStatusCreated: index('idx_ai_usage_status_created').on(t.status, t.createdAt)
  })
);

export type AiUsageEventRow = InferSelectModel<typeof ai_usage_events>;
export type NewAiUsageEvent = InferInsertModel<typeof ai_usage_events>;

/**
 * ai_usage_event_outbox：AI usage 事件耐久队列表
 * - AI 域只负责发事件；analytics 侧先写 outbox，再异步 drain 到 ai_usage_events
 */
export const ai_usage_event_outbox = sqliteTable(
  'ai_usage_event_outbox',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    eventType: text('event_type').notNull(),
    eventFingerprint: text('event_fingerprint').notNull(),
    producer: text('producer'),

    traceId: text('trace_id').notNull(),
    requestId: text('request_id').notNull(),
    providerId: text('provider_id').notNull(),
    model: text('model').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    usageFeature: text('usage_feature').notNull(),
    usageStage: text('usage_stage').notNull(),
    operationKey: text('operation_key').notNull(),
    attemptIndex: integer('attempt_index').notNull().default(0),

    emittedAt: integer('emitted_at').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),

    status: text('status', { enum: ['pending', 'processed', 'failed'] })
      .notNull()
      .default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    lastAttemptAt: integer('last_attempt_at'),
    processedAt: integer('processed_at'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    uqAiUsageOutboxEventFingerprint: uniqueIndex('uq_ai_usage_outbox_event_fingerprint').on(t.eventType, t.eventFingerprint),
    idxAiUsageOutboxStatusCreated: index('idx_ai_usage_outbox_status_created').on(t.status, t.createdAt),
    idxAiUsageOutboxFingerprint: index('idx_ai_usage_outbox_fingerprint').on(t.eventFingerprint),
    idxAiUsageOutboxTrace: index('idx_ai_usage_outbox_trace').on(t.traceId),
    idxAiUsageOutboxRequest: index('idx_ai_usage_outbox_request').on(t.requestId)
  })
);

export type AiUsageEventOutboxRow = InferSelectModel<typeof ai_usage_event_outbox>;
export type NewAiUsageEventOutbox = InferInsertModel<typeof ai_usage_event_outbox>;

/**
 * automation_rules: 自动化规则表
 * - 定义资源事件、定时任务等触发的工作流或其他操作
 * - 支持工作空间隔离与全局规则
 */
export const automation_rules = sqliteTable(
  'automation_rules',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text('name').notNull(),
    description: text('description'),

    // 作用域与归属
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade', onUpdate: 'cascade' }), // 为空则为全局规则（需权限）
    scope: text('scope', { enum: ['global', 'workspace'] })
      .default('workspace')
      .notNull(),

    // 触发器定义
    triggerType: text('trigger_type').notNull(), // e.g. 'resource_event', 'schedule', 'system_event', 'manual'
    // 触发条件配置 (JSON):
    // - resource_event: { resourceType: 'video', event: 'created', filter: { tags: [], folderId: ... } }
    // - schedule: { cron: '0 0 * * *' }
    triggerConfig: text('trigger_config', { mode: 'json' }),

    // 执行动作定义
    actionType: text('action_type').notNull(), // e.g. 'workflow', 'script', 'notification'
    // 动作参数配置 (JSON):
    // - workflow: { workflowId: '...', inputs: {...} }
    actionConfig: text('action_config', { mode: 'json' }),

    // 控制字段
    enabled: integer('enabled').default(1),
    priority: integer('priority').default(0), // 优先级，大者先执行

    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxAutoWorkspace: index('idx_automation_workspace').on(t.workspaceId),
    idxAutoTrigger: index('idx_automation_trigger').on(t.triggerType),
    idxAutoEnabled: index('idx_automation_enabled').on(t.enabled)
  })
);

export type AutomationRuleRow = InferSelectModel<typeof automation_rules>;
export type NewAutomationRule = InferInsertModel<typeof automation_rules>;

/**
 * workflows: 工作流定义表
 */
export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    name: text('name').notNull(),
    description: text('description'),
    // 存储工作流的节点和连线配置 (JSON string)
    definition: text('definition').notNull(),
    // 是否启用
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    // 工作流类型/标签
    type: text('type'),

    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxWorkflowsWorkspace: index('idx_workflows_workspace').on(t.workspaceId)
  })
);

/**
 * workflow_runs: 工作流运行记录表
 */
export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }),

    // 运行状态: 'queued' | 'running' | 'completed' | 'failed' | 'canceled'
    status: text('status').notNull(),

    // 触发时的输入数据 (JSON string)
    input: text('input'),
    // 运行结果输出 (JSON string)
    output: text('output'),
    // 错误信息 (如果有)
    error: text('error'),

    // 节点执行详情 (JSON string)
    nodes: text('nodes'),

    // 运行元数据 (JSON string)
    metadata: text('metadata'),

    // 耗时 (毫秒)
    duration: integer('duration'),

    startedAt: integer('started_at').default(sql`(unixepoch('now')*1000)`),
    completedAt: integer('completed_at')
  },
  (t) => ({
    idxWorkflowRunsWorkflow: index('idx_workflow_runs_workflow').on(t.workflowId),
    idxWorkflowRunsStatus: index('idx_workflow_runs_status').on(t.status),
    idxWorkflowRunsStarted: index('idx_workflow_runs_started').on(t.startedAt)
  })
);

// 定义关系
export const workflowsRelations = relations(workflows, ({ many }) => ({
  runs: many(workflowRuns)
}));

export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowRuns.workflowId],
    references: [workflows.id]
  })
}));

export type Workflow = InferSelectModel<typeof workflows>;
export type NewWorkflow = InferInsertModel<typeof workflows>;
export type WorkflowRun = InferSelectModel<typeof workflowRuns>;
export type NewWorkflowRun = InferInsertModel<typeof workflowRuns>;

/**
 * rss_feed_items：RSS 订阅条目缓存表
 * - 用于缓存 RSS Feed 的条目，避免每次进入界面都需要从网络获取
 * - 支持增量更新，下次进入时先加载缓存，再异步获取最新数据
 */
export const rss_feed_items = sqliteTable(
  'rss_feed_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    // 归属的 RSS 资源 ID（关联 resources 表中 type='rss' 的资源）
    rssResourceId: text('rss_resource_id')
      .references(() => resources.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),
    // 条目在来源平台的唯一 ID
    itemId: text('item_id').notNull(),
    // 条目标题
    title: text('title').notNull(),
    // 条目描述/摘要
    description: text('description'),
    // 条目链接
    link: text('link').notNull(),
    // 发布时间（毫秒时间戳）
    publishedAt: integer('published_at').notNull(),
    // 更新时间（毫秒时间戳）
    updatedAt: integer('updated_at'),
    // 作者名称
    author: text('author'),
    // 缩略图 URL
    thumbnail: text('thumbnail'),
    // 时长（毫秒，音视频）
    durationMs: integer('duration_ms'),
    // 观看/播放次数
    viewCount: integer('view_count'),
    // 点赞数
    likeCount: integer('like_count'),
    // 评论数
    commentCount: integer('comment_count'),
    // 媒体类型
    mediaType: text('media_type', { enum: ['video', 'audio', 'article', 'image', 'other'] }),
    // 媒体 URL（直接播放/下载地址）
    mediaUrl: text('media_url'),
    // 媒体格式
    mediaFormat: text('media_format'),
    // 文件大小（字节）
    sizeBytes: integer('size_bytes'),
    // 分类/标签（JSON 数组字符串）
    categories: text('categories'),
    // 是否已下载
    downloaded: integer('downloaded', { mode: 'boolean' }).default(false),
    // 对应的本地资源 ID（如果已下载）
    localResourceId: text('local_resource_id').references(() => resources.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    // 下载状态
    downloadStatus: text('download_status', { enum: ['pending', 'downloading', 'completed', 'error', 'cancelled'] }),
    // 下载进度（0-100）
    downloadProgress: integer('download_progress'),
    // 下载错误码
    downloadErrorCode: text('download_error_code'),
    // 下载错误信息
    downloadError: text('download_error'),
    // 下载错误时间
    downloadErrorAt: integer('download_error_at'),
    // 最近一次下载完成时间
    lastDownloadAt: integer('last_download_at'),
    // 额外元数据（JSON字符串）
    metadata: text('metadata'),
    // 创建时间（入库时间）
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    // 软删除时间
    deletedAt: integer('deleted_at')
  },
  (t) => ({
    // 按 RSS 资源筛选
    idxRssFeedItemsResource: index('idx_rss_feed_items_resource').on(t.rssResourceId),
    // 按发布时间排序
    idxRssFeedItemsPublished: index('idx_rss_feed_items_published').on(t.publishedAt),
    // 唯一约束：同一 RSS 资源下，条目 ID 唯一
    uqRssFeedItemsResourceItem: uniqueIndex('uq_rss_feed_items_resource_item').on(t.rssResourceId, t.itemId),
    // 按下载状态筛选
    idxRssFeedItemsDownloaded: index('idx_rss_feed_items_downloaded').on(t.downloaded)
  })
);

export type RssFeedItemRow = InferSelectModel<typeof rss_feed_items>;
export type NewRssFeedItem = InferInsertModel<typeof rss_feed_items>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Memory System Tables
// 记忆系统表。Markdown 为事实源，数据库只存结构索引与关系。
// 所有新表使用 memory_ 前缀，与现有表完全隔离。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * memory_notes — 记忆 Note 索引
 * 存储每个 Memory Note 的 Frontmatter 镜像，是检索主入口。
 */
export const memory_notes = sqliteTable(
  'memory_notes',
  {
    // ━━ 身份 ━━
    id: text('id').primaryKey(), // 与 Frontmatter id 一致，如 mem_2026-03-26_xxx_a1b2c3
    version: integer('version').notNull().default(1), // 修订版本号

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    timeRangeStart: integer('time_range_start'), // 毫秒时间戳
    timeRangeEnd: integer('time_range_end'),

    // ━━ 文件路径 ━━
    filePath: text('file_path').notNull(), // workspace 相对路径
    fileChecksum: text('file_checksum'), // 文件内容 sha256

    // ━━ 主题 ━━
    topics: text('topics').notNull(), // JSON string[]
    parentTopicId: text('parent_topic_id').references((): AnySQLiteColumn => memory_topics.id, { onDelete: 'set null' }),
    relatedTopicIds: text('related_topic_ids'), // JSON string[]
    domain: text('domain'), // 如 "person:Alice", "project:chobits", "general"

    // ━━ 关键词与实体（冗余存储用于快速过滤） ━━
    keywords: text('keywords').notNull(), // JSON string[]
    aliases: text('aliases'), // JSON string[]
    entities: text('entities'), // JSON Entity[]

    // ━━ 摘要 ━━
    summary: text('summary').notNull(),

    // ━━ 溯源 ━━
    sourceConversationIds: text('source_conversation_ids').notNull(), // JSON string[]
    sourceMessageRange: text('source_message_range'), // JSON MessageRange[]

    // ━━ 权重 ━━
    importance: real('importance').notNull().default(0.5), // 0.0 ~ 1.0
    stability: real('stability').notNull().default(0.5), // 0.0 ~ 1.0

    // ━━ 统计 ━━
    sectionCount: integer('section_count').default(0),
    charCount: integer('char_count').default(0),
    tokenEstimate: integer('token_estimate').default(0),

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at')
  },
  (t) => ({
    idxMemNotesWorkspace: index('idx_mem_notes_workspace').on(t.workspaceId),
    idxMemNotesDate: index('idx_mem_notes_date').on(t.date),
    idxMemNotesImportance: index('idx_mem_notes_importance').on(t.importance),
    idxMemNotesStability: index('idx_mem_notes_stability').on(t.stability),
    idxMemNotesParentTopic: index('idx_mem_notes_parent_topic').on(t.parentTopicId),
    idxMemNotesDomain: index('idx_mem_notes_domain').on(t.domain, t.workspaceId),
    idxMemNotesCreated: index('idx_mem_notes_created').on(t.createdAt),
    idxMemNotesDeleted: index('idx_mem_notes_deleted').on(t.deletedAt),
    uqMemNotesWorkspaceFilePath: uniqueIndex('uq_mem_notes_workspace_file_path').on(t.workspaceId, t.filePath)
  })
);

export type MemoryNoteRow = InferSelectModel<typeof memory_notes>;
export type NewMemoryNote = InferInsertModel<typeof memory_notes>;

/**
 * memory_sections — 段落索引
 * 存储 note 内每个 ## / ### 段落的结构信息，用于 section 级渐进召回。
 */
export const memory_sections = sqliteTable(
  'memory_sections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    noteId: text('note_id')
      .references(() => memory_notes.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),

    // ━━ 标题信息 ━━
    heading: text('heading').notNull(), // 标题名，如 "Key Points" 或 "Open Items"
    headingLevel: integer('heading_level').notNull(), // 2 = ##, 3 = ###
    sectionOrder: integer('section_order').notNull(), // 段落在 note 内的顺序（从 0 开始）

    // ━━ 内容摘要 ━━
    summary: text('summary'), // 段落摘要（从 blockquote 提取）
    keywords: text('keywords'), // JSON string[]，段落级关键词

    // ━━ 定位 ━━
    lineStart: integer('line_start').notNull(), // 起始行号（1-based）
    lineEnd: integer('line_end').notNull(), // 结束行号（1-based）
    charCount: integer('char_count').default(0),

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxMemSectionsNote: index('idx_mem_sections_note').on(t.noteId),
    idxMemSectionsHeading: index('idx_mem_sections_heading').on(t.heading),
    idxMemSectionsOrder: index('idx_mem_sections_order').on(t.noteId, t.sectionOrder)
  })
);

export type MemorySectionRow = InferSelectModel<typeof memory_sections>;
export type NewMemorySection = InferInsertModel<typeof memory_sections>;

/**
 * memory_topics — 主题节点
 * 图谱的核心节点表。支持层级（父子主题）和别名。
 */
export const memory_topics = sqliteTable(
  'memory_topics',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => `topic_${randomUUID().slice(0, 8)}`),

    // ━━ 标识 ━━
    label: text('label').notNull(), // 规范化主题名，如 "AI Agent"
    slug: text('slug').notNull(), // URL-safe slug，如 "ai-agent"
    aliases: text('aliases'), // JSON string[]，别名列表
    description: text('description'), // 主题简述（1~2 句）

    // ━━ 层级 ━━
    parentId: text('parent_id').references((): AnySQLiteColumn => memory_topics.id, { onDelete: 'set null' }),

    // ━━ 关联关键词 ━━
    keywords: text('keywords'), // JSON string[]，强关联关键词

    // ━━ 领域命名空间 ━━
    domain: text('domain'), // 如 "person:Alice", "project:chobits", "general"
    domainType: text('domain_type', { enum: ['person', 'project', 'general'] }),

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    // ━━ 活跃度与统计 ━━
    noteCount: integer('note_count').default(0),
    heat: real('heat').default(0), // 近期活跃度分（0.0~1.0）
    centralityHint: real('centrality_hint').default(0), // 图中心度提示
    firstSeenAt: integer('first_seen_at'),
    lastSeenAt: integer('last_seen_at'),

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at')
  },
  (t) => ({
    uqMemTopicsSlugWs: uniqueIndex('uq_mem_topics_slug_ws').on(t.slug, t.workspaceId),
    idxMemTopicsLabel: index('idx_mem_topics_label').on(t.label),
    idxMemTopicsParent: index('idx_mem_topics_parent').on(t.parentId),
    idxMemTopicsWorkspace: index('idx_mem_topics_workspace').on(t.workspaceId),
    idxMemTopicsHeat: index('idx_mem_topics_heat').on(t.heat),
    idxMemTopicsLastSeen: index('idx_mem_topics_last_seen').on(t.lastSeenAt),
    idxMemTopicsDomain: index('idx_mem_topics_domain').on(t.domain, t.workspaceId)
  })
);

export type MemoryTopicRow = InferSelectModel<typeof memory_topics>;
export type NewMemoryTopic = InferInsertModel<typeof memory_topics>;

/**
 * memory_edges — 图谱边
 * 支持多种关系类型，连接 topic、note、section 三类节点。
 */
export const memory_edges = sqliteTable(
  'memory_edges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    // ━━ 端点 ━━
    sourceType: text('source_type', { enum: ['topic', 'note', 'section'] }).notNull(),
    sourceId: text('source_id').notNull(),
    targetType: text('target_type', { enum: ['topic', 'note', 'section'] }).notNull(),
    targetId: text('target_id').notNull(),

    // ━━ 关系描述 ━━
    relationType: text('relation_type', {
      enum: [
        'parent_topic_of',
        'belongs_to_topic',
        'related_to_topic',
        'related_to_note',
        'contains_section',
        'derived_from_conversation',
        'shares_keyword',
        'references_note',
        'entity_fact',
        'entity_attribute',
        'entity_relation'
      ]
    }).notNull(),

    // ━━ 权重与证据 ━━
    weight: real('weight').default(1.0),
    evidenceNoteId: text('evidence_note_id'),
    evidenceSnippet: text('evidence_snippet'),
    origin: text('origin', {
      enum: ['llm_extracted', 'rule_inferred', 'user_manual']
    }).default('llm_extracted'),

    // ━━ 时序有效性（用于实体事实边） ━━
    validFrom: integer('valid_from'), // 毫秒时间戳，事实何时开始为真
    validTo: integer('valid_to'), // 毫秒时间戳，事实何时失效（null = 仍然有效）
    confidence: real('confidence').default(1.0), // 置信度 0.0~1.0

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxMemEdgesSource: index('idx_mem_edges_source').on(t.sourceType, t.sourceId),
    idxMemEdgesTarget: index('idx_mem_edges_target').on(t.targetType, t.targetId),
    idxMemEdgesRelation: index('idx_mem_edges_relation').on(t.relationType),
    uqMemEdgesLink: uniqueIndex('uq_mem_edges_link').on(t.sourceType, t.sourceId, t.targetType, t.targetId, t.relationType),
    idxMemEdgesWorkspace: index('idx_mem_edges_workspace').on(t.workspaceId),
    idxMemEdgesValid: index('idx_mem_edges_valid').on(t.validFrom, t.validTo)
  })
);

export type MemoryEdgeRow = InferSelectModel<typeof memory_edges>;
export type NewMemoryEdge = InferInsertModel<typeof memory_edges>;

/**
 * memory_keywords — 关键词规范化表
 * 每个关键词/实体/别名一条记录。支持同义映射与主题亲和度。
 */
export const memory_keywords = sqliteTable(
  'memory_keywords',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    // ━━ 关键词本体 ━━
    canonical: text('canonical').notNull(), // 规范形式
    aliases: text('aliases'), // JSON string[]
    language: text('language'), // 主要语言

    // ━━ 实体类型 ━━
    entityType: text('entity_type', {
      enum: ['person', 'product', 'technology', 'organization', 'concept', 'location', 'event', 'keyword', 'other']
    }).default('keyword'),

    // ━━ 主题亲和 ━━
    primaryTopicId: text('primary_topic_id').references(() => memory_topics.id, { onDelete: 'set null' }),

    // ━━ 统计 ━━
    occurrenceCount: integer('occurrence_count').default(0),
    lastSeenAt: integer('last_seen_at'),

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    uqMemKeywordsCanonicalWs: uniqueIndex('uq_mem_keywords_canonical_ws').on(t.canonical, t.workspaceId),
    idxMemKeywordsEntityType: index('idx_mem_keywords_entity_type').on(t.entityType),
    idxMemKeywordsTopic: index('idx_mem_keywords_topic').on(t.primaryTopicId),
    idxMemKeywordsWorkspace: index('idx_mem_keywords_workspace').on(t.workspaceId),
    idxMemKeywordsOccurrence: index('idx_mem_keywords_occurrence').on(t.occurrenceCount)
  })
);

export type MemoryKeywordRow = InferSelectModel<typeof memory_keywords>;
export type NewMemoryKeyword = InferInsertModel<typeof memory_keywords>;

/**
 * memory_note_keywords — Note ↔ Keyword 关联表
 * 多对多关系。一个 note 有多个关键词，一个关键词出现在多个 note 中。
 */
export const memory_note_keywords = sqliteTable(
  'memory_note_keywords',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    noteId: text('note_id')
      .references(() => memory_notes.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),
    keywordId: text('keyword_id')
      .references(() => memory_keywords.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),

    // ━━ 来源层级 ━━
    scope: text('scope', {
      enum: ['note', 'section']
    }).default('note'),
    sectionId: text('section_id').references(() => memory_sections.id, { onDelete: 'set null' }),

    // ━━ 权重 ━━
    relevance: real('relevance').default(1.0),

    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    uqMemNoteKeyword: uniqueIndex('uq_mem_note_keyword').on(t.noteId, t.keywordId, t.sectionId),
    idxMemNoteKeywordsNote: index('idx_mem_note_keywords_note').on(t.noteId),
    idxMemNoteKeywordsKeyword: index('idx_mem_note_keywords_keyword').on(t.keywordId),
    idxMemNoteKeywordsSection: index('idx_mem_note_keywords_section').on(t.sectionId)
  })
);

export type MemoryNoteKeywordRow = InferSelectModel<typeof memory_note_keywords>;
export type NewMemoryNoteKeyword = InferInsertModel<typeof memory_note_keywords>;

/**
 * memory_sync_jobs — 记忆提取任务
 * 跟踪每次记忆提取/索引任务的状态，支持断点续做和调试。
 */
export const memory_sync_jobs = sqliteTable(
  'memory_sync_jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    // ━━ 任务类型 ━━
    jobType: text('job_type', {
      enum: ['daily_extraction', 'conversation_close', 'manual_reindex', 'file_change_reindex', 'recall_cue_backfill']
    }).notNull(),

    // ━━ 任务范围 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    targetDate: text('target_date'), // YYYY-MM-DD
    targetConversationIds: text('target_conversation_ids'), // JSON string[]

    // ━━ 状态 ━━
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled']
    })
      .notNull()
      .default('pending'),
    progress: text('progress'), // JSON：{ current, total, stage }
    errorMessage: text('error_message'),

    // ━━ 结果统计 ━━
    notesCreated: integer('notes_created').default(0),
    notesUpdated: integer('notes_updated').default(0),
    topicsCreated: integer('topics_created').default(0),
    edgesCreated: integer('edges_created').default(0),
    keywordsCreated: integer('keywords_created').default(0),

    // ━━ AI 调用元数据 ━━
    providerId: text('provider_id'),
    model: text('model'),
    tokensUsed: integer('tokens_used').default(0),

    // ━━ 生命周期 ━━
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxMemSyncJobsStatus: index('idx_mem_sync_jobs_status').on(t.status),
    idxMemSyncJobsType: index('idx_mem_sync_jobs_type').on(t.jobType),
    idxMemSyncJobsWorkspace: index('idx_mem_sync_jobs_workspace').on(t.workspaceId),
    idxMemSyncJobsDate: index('idx_mem_sync_jobs_date').on(t.targetDate),
    idxMemSyncJobsCreated: index('idx_mem_sync_jobs_created').on(t.createdAt)
  })
);

export type MemorySyncJobRow = InferSelectModel<typeof memory_sync_jobs>;
export type NewMemorySyncJob = InferInsertModel<typeof memory_sync_jobs>;
