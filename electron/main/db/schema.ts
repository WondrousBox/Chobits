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
    metadata: text('metadata'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at'),
    rank: real('rank').default(0)
  },
  (t) => ({
    idxFoldersParent: index('idx_folders_parent').on(t.parentId),
    idxFoldersWorkspace: index('idx_folders_workspace').on(t.workspaceId),
    idxFoldersCreated: index('idx_folders_created').on(t.createdAt),
    idxFoldersRank: index('idx_folders_rank').on(t.rank)
  })
);

export type FolderRow = InferSelectModel<typeof folders>;
export type NewFolder = InferInsertModel<typeof folders>;

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
    // 父资源ID（用于记录资源来源，如字幕由视频生成、截图由视频生成等）
    parentResourceId: text('parent_resource_id').references((): AnySQLiteColumn => resources.id, { onDelete: 'set null', onUpdate: 'cascade' })
  },
  (t) => ({
    idxResourcesWorkspace: index('idx_resources_workspace').on(t.workspaceId),
    idxResourcesFolder: index('idx_resources_folder').on(t.folderId),
    idxResourcesParent: index('idx_resources_parent').on(t.parentResourceId),
    idxResourcesType: index('idx_resources_type').on(t.type),
    idxResourcesStatus: index('idx_resources_status').on(t.status),
    idxResourcesCreated: index('idx_resources_created').on(t.createdAt),
    idxResourcesFavorite: index('idx_resources_favorite').on(t.favorite)
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
    // 关联的智能体、服务商及其实例（用于回放与统计）
    agentId: text('agent_id'),
    providerId: text('provider_id'),
    providerInstanceId: text('provider_instance_id'),
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
    idxMsgConvSeq: index('idx_chat_messages_conv_seq').on(t.conversationId, t.seq),
    idxMsgConvCreated: index('idx_chat_messages_conv_created').on(t.conversationId, t.createdAt)
  })
);

export type ChatMessageRow = InferSelectModel<typeof chat_messages>;
export type NewChatMessage = InferInsertModel<typeof chat_messages>;

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
    downloadStatus: text('download_status', { enum: ['pending', 'downloading', 'completed', 'error'] }),
    // 下载进度（0-100）
    downloadProgress: integer('download_progress'),
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
