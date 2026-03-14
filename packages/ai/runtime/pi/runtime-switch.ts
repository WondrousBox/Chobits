import type { ChatRequest } from '../../types';

export const PI_RUNTIME_ID = 'pi';
export const PI_RUNTIME_PREVIEW_ID = 'pi-preview';

export function getPiRuntimePreference(req: Pick<ChatRequest, 'extras'>): string | undefined {
  const runtime = req.extras?.runtime;
  if (typeof runtime !== 'string') return undefined;
  return runtime.trim().toLowerCase();
}

export function isPiRuntimeRequested(req: Pick<ChatRequest, 'extras'>): boolean {
  const runtime = getPiRuntimePreference(req);
  return runtime === PI_RUNTIME_ID || runtime === PI_RUNTIME_PREVIEW_ID;
}
