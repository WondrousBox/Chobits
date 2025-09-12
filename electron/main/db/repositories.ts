import { getOrm } from '.';
import { documents, type NewDocument, type DocumentRow } from './schema';
import { eq, inArray } from 'drizzle-orm';

export const DocumentsRepo = {
  async upsert(doc: NewDocument) {
    const db = getOrm();
    await db.insert(documents).values(doc).onConflictDoUpdate({
      target: documents.id,
      set: {
        content: doc.content,
        metadata: doc.metadata ?? null,
        embedding: doc.embedding ?? null,
      },
    });
  },
  async bulkUpsert(docs: NewDocument[]) {
    const db = getOrm();
    if (!docs.length) return;
    await db.insert(documents).values(docs).onConflictDoUpdate({
      target: documents.id,
      set: {
        content: (docs as any).excluded.content,
        metadata: (docs as any).excluded.metadata,
        embedding: (docs as any).excluded.embedding,
      },
    });
  },
  async getById(id: string): Promise<DocumentRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return rows[0];
  },
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(documents).where(inArray(documents.id, ids));
    // drizzle returns number of changes for better-sqlite3 driver
    return (res as any).changes ?? 0;
  },
  async list(limit = 100, offset = 0): Promise<DocumentRow[]> {
    const db = getOrm();
    return db.select().from(documents).limit(limit).offset(offset);
  },
};
