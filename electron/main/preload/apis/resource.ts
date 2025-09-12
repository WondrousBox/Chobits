import { getOrm } from '../../db';
import { resources } from '../../db/schema';
import { eq } from 'drizzle-orm';

export async function addResource(resource: any) {
  const db = getOrm();
  await db.insert(resources).values(resource);
}

export async function listResources() {
  const db = getOrm();
  return await db.select().from(resources).all();
}

export async function getResource(id: string) {
  const db = getOrm();
  return await db.select().from(resources).where(eq(resources.id, id)).get();
}

export async function deleteResource(id: string) {
  const db = getOrm();
  await db.delete(resources).where(eq(resources.id, id));
}
