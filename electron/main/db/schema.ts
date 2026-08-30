import { randomUUID } from 'node:crypto';

import { InferInsertModel, InferSelectModel, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// mini 分支只保留三张表：workspaces / conversations / chat_messages
// 其余表（documents/folders/resources/recycle_bin/project_*/memory_*/ai_usage_* 等）已随功能裁剪移除

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
