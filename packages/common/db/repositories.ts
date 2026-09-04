import { randomUUID } from 'node:crypto';

import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';

import { getDB, getOrm } from '.';
import { chat_messages, type ChatMessageRow, type ConversationRow, conversations, type NewChatMessage, type NewConversation } from './schema';

/**
 * 会话与消息表操作空间
 */
export const ChatRepo = {
  /**
   * 确保会话存在；若传入 conversationId 则返回该会话（若存在），否则新建
   */
  async ensureConversation(payload: Partial<NewConversation> & { id?: string }): Promise<ConversationRow> {
    const db = getOrm();
    const id = payload.id;
    if (id) {
      const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      if (rows[0]) {
        const existing = rows[0];
        const patch: Record<string, any> = {};

        // 如果 provider 发生了变化（用户切换了模型/服务商），更新会话记录
        if (payload.providerId && (existing.providerId !== payload.providerId || existing.providerPresetId !== (payload.providerPresetId ?? null))) {
          patch.providerId = payload.providerId;
          patch.providerPresetId = payload.providerPresetId ?? null;
        }

        // 仅当旧会话还没有标题时，回填首条用户消息生成的占位标题。
        if (!existing.title && payload.title) {
          patch.title = payload.title;
        }

        if (Object.keys(patch).length > 0) {
          await db
            .update(conversations)
            .set({
              ...patch,
              updatedAt: Date.now()
            })
            .where(eq(conversations.id, id));
          return { ...existing, ...patch };
        }

        return existing;
      }
    }
    const now = Date.now();
    const values: any = {
      title: payload.title ?? null,
      agentId: payload.agentId ?? null,
      providerId: payload.providerId ?? null,
      providerPresetId: payload.providerPresetId ?? null,
      messagesCount: 0,
      lastMessageAt: now,
      pinned: payload.pinned ?? 0,
      metadata: payload.metadata ?? null,
      createdAt: now,
      updatedAt: now
    };
    if (id) values.id = id;
    const rows = await db.insert(conversations).values(values).returning().all();
    return rows[0];
  },

  async getConversation(id: string): Promise<ConversationRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  },

  /**
   * 新增一条消息，自动维护 seq、会话计数与 lastMessageAt
   */
  async addMessage(conversationId: string, message: Omit<NewChatMessage, 'id' | 'conversationId' | 'seq'>): Promise<ChatMessageRow> {
    const rawDb = getDB();
    if (!rawDb) {
      throw new Error('[db] Database is not initialized.');
    }

    const now = Date.now();
    const payload = {
      id: randomUUID(),
      content: message.content,
      conversationId,
      createdAt: (message as any).createdAt ?? now,
      metadata: message.metadata ?? null,
      name: message.name ?? null,
      role: message.role,
      toolCallId: message.toolCallId ?? null,
      updatedAt: now
    };

    const insertMessage = rawDb.prepare(
      `INSERT INTO chat_messages (
        id,
        conversation_id,
        role,
        content,
        name,
        tool_call_id,
        seq,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @conversationId,
        @role,
        @content,
        @name,
        @toolCallId,
        (SELECT COALESCE(MAX(seq), 0) + 1 FROM chat_messages WHERE conversation_id = @conversationId),
        @metadata,
        @createdAt,
        @updatedAt
      )
      RETURNING
        id,
        conversation_id AS conversationId,
        role,
        content,
        name,
        tool_call_id AS toolCallId,
        seq,
        metadata,
        created_at AS createdAt,
        updated_at AS updatedAt,
        deleted_at AS deletedAt`
    );
    const updateConversation = rawDb.prepare(
      `UPDATE conversations
      SET
        messages_count = COALESCE(messages_count, 0) + 1,
        last_message_at = @updatedAt,
        updated_at = @updatedAt
      WHERE id = @conversationId`
    );

    const runInTransaction = rawDb.transaction((params: typeof payload) => {
      const row = insertMessage.get(params) as ChatMessageRow | undefined;
      if (!row) {
        throw new Error(`[db] Failed to insert chat message for conversation ${params.conversationId}.`);
      }
      updateConversation.run({
        conversationId: params.conversationId,
        updatedAt: params.updatedAt
      });
      return row;
    });

    return ((runInTransaction as any).immediate ? (runInTransaction as any).immediate(payload) : runInTransaction(payload)) as ChatMessageRow;
  },

  async listConversations(filter: { includeDeleted?: boolean } = {}, limit = 100, offset = 0): Promise<ConversationRow[]> {
    const db = getOrm();
    let q = db.select().from(conversations);
    const wheres: any[] = [];
    if (!filter.includeDeleted) wheres.push(isNull(conversations.deletedAt));
    if (wheres.length) q = q.where(and(...wheres));
    return q
      .orderBy(desc(conversations.pinned as any), desc(conversations.lastMessageAt as any), desc(conversations.updatedAt as any))
      .limit(limit)
      .offset(offset);
  },

  async listMessages(conversationId: string, limit = 1000, offset = 0): Promise<ChatMessageRow[]> {
    const db = getOrm();
    return db
      .select()
      .from(chat_messages)
      .where(and(eq(chat_messages.conversationId, conversationId), isNull(chat_messages.deletedAt)))
      .orderBy(chat_messages.seq as any)
      .limit(limit)
      .offset(offset);
  },

  async listMessagesAfterSeq(conversationId: string, afterSeq: number, limit = 1000): Promise<ChatMessageRow[]> {
    const db = getOrm();
    return db
      .select()
      .from(chat_messages)
      .where(and(eq(chat_messages.conversationId, conversationId), isNull(chat_messages.deletedAt), gt(chat_messages.seq, afterSeq)))
      .orderBy(chat_messages.seq as any)
      .limit(limit);
  },

  async renameConversation(id: string, title: string): Promise<ConversationRow | undefined> {
    const db = getOrm();
    const now = Date.now();
    await db
      .update(conversations)
      .set({ title, updatedAt: now } as any)
      .where(eq(conversations.id, id))
      .run();
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  },

  /** 物理删除会话（及其消息，FK ON DELETE CASCADE） */
  async deleteConversations(ids: string[]): Promise<number> {
    if (!ids?.length) return 0;
    const db = getOrm();
    // Delete conversations; FK should cascade to messages.
    let deleted = 0;
    (db as any).transaction((tx: any) => {
      const res = tx.delete(conversations).where(inArray(conversations.id, ids)).run?.();
      deleted = (res as any)?.changes ?? 0;
    });
    return deleted;
  },

  /** 永久删除单个会话 */
  async deleteConversation(id: string): Promise<boolean> {
    if (!id) return false;
    const db = getOrm();
    (db as any).transaction((tx: any) => {
      tx.delete(conversations).where(eq(conversations.id, id)).run?.();
    });
    return true;
  }
};
