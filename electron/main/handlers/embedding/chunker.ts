export type Chunk = { content: string; index: number; count: number };

export function chunkText(text: string, maxChars = 1200, overlap = 120): Chunk[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + maxChars, clean.length);
    const slice = clean.slice(start, end);
    chunks.push({ content: slice, index: chunks.length, count: 0 });
    if (end === clean.length) break;
    start = Math.max(0, end - overlap);
  }
  const count = chunks.length;
  for (const c of chunks) c.count = count;
  return chunks;
}
