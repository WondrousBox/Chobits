/**
 * sherpa 能力守卫的依赖注入点。
 *
 * sherpa 的 IPC handler 需要校验 sprite 能力状态并广播能力变化，
 * 但能力系统归属 sprite-core（sprite-core → sherpa 单向依赖）。
 * 由 sprite-core 侧（handler/sprite-manager-ipc.ts）在模块加载时注入真实实现；
 * 未注入时降级为 noop + console.warn，保证 sherpa 独立加载时不崩溃。
 */

export interface SherpaCapabilityChangedPayload {
  source?: string;
}

export interface SherpaCapabilityGuards {
  assertActive(capabilityId: string): unknown;
  assertUnlocked(capabilityId: string): unknown;
  notifyChanged(payload?: SherpaCapabilityChangedPayload): void;
}

let guards: SherpaCapabilityGuards | null = null;
let fallbackWarned = false;

export function setSherpaCapabilityGuards(next: SherpaCapabilityGuards): void {
  guards = next;
}

function getSherpaCapabilityGuards(): SherpaCapabilityGuards {
  if (guards) return guards;
  if (!fallbackWarned) {
    fallbackWarned = true;
    console.warn('[sherpa] capability guards not injected; capability assertions are skipped');
  }
  return fallbackGuards;
}

const fallbackGuards: SherpaCapabilityGuards = {
  assertActive() {
    /* noop */
  },
  assertUnlocked() {
    /* noop */
  },
  notifyChanged() {
    /* noop */
  }
};

export function assertSherpaCapabilityActive(capabilityId: string): void {
  getSherpaCapabilityGuards().assertActive(capabilityId);
}

export function assertSherpaCapabilityUnlocked(capabilityId: string): void {
  getSherpaCapabilityGuards().assertUnlocked(capabilityId);
}

export function notifySherpaCapabilityChanged(payload?: SherpaCapabilityChangedPayload): void {
  getSherpaCapabilityGuards().notifyChanged(payload);
}
