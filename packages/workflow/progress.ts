import type { NodeRunState } from './types.js';

export function calculateWorkflowProgress(nodes: Record<string, NodeRunState>): number {
  const states = Object.values(nodes);
  if (states.length === 0) return 0;

  const total = states.reduce((sum, state) => {
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'skipped') return sum + 100;
    if (state.status !== 'running') return sum;
    return sum + Math.max(0, Math.min(100, state.progress ?? 0));
  }, 0);

  return Math.round(total / states.length);
}
