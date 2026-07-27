export function onAbort(signal: AbortSignal | undefined, abort: () => void): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    abort();
    return () => {};
  }

  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}
