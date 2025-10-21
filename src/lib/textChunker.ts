export type Chunk = { content: string; index: number; count: number };

/**
 * Simple character-based chunker with overlap (mirrors main/embedding/chunker)
 * - maxChars: max characters per chunk
 * - overlap: overlapping characters between adjacent chunks to keep context
 */
export function chunkText(
  text: string,
  maxChars = 1200,
  overlap = 120
): Chunk[] {
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

/**
 * Optional paragraph-aware splitter: split by paragraph/sentence first, then pack.
 */
export function smartChunks(
  text: string,
  maxChars = 1200,
  overlap = 120
): Chunk[] {
  const cleaned = (text || '').replace(/\r\n|\r/g, '\n');
  const paras = cleaned
    .split(/\n{2,}|(?<=[。！？!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let buf = '';
  for (const p of paras) {
    if ((buf + (buf ? ' ' : '') + p).length <= maxChars) {
      buf = buf ? `${buf} ${p}` : p;
    } else {
      if (buf) out.push(buf);
      if (p.length <= maxChars) {
        buf = p;
      } else {
        // fallback to raw chunking for very long paragraph
        const raw = chunkText(p, maxChars, Math.min(60, Math.floor(overlap/2))).map(c => c.content);
        out.push(...raw);
        buf = '';
      }
    }
  }
  if (buf) out.push(buf);
  // apply overlap
  if (overlap > 0 && out.length > 1) {
    const overlapped: string[] = [];
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      if (i === 0) {
        overlapped.push(cur);
      } else {
        const prev = out[i - 1];
        const tail = prev.slice(Math.max(0, prev.length - overlap));
        overlapped.push(tail + cur);
      }
    }
    return overlapped.map((content, index) => ({ content, index, count: overlapped.length }));
  }
  return out.map((content, index) => ({ content, index, count: out.length }));
}
