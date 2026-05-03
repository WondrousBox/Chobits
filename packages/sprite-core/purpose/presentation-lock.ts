export interface SpritePresentationLockSnapshot {
  ownerId: string;
  priority: number;
  acquiredAt: number;
  expiresAt: number;
  reason?: string;
}

export interface SpritePresentationRequest {
  ownerId?: string;
  priority?: number;
  ignoreLock?: boolean;
  now?: number;
}

export class SpritePresentationLock {
  private current: SpritePresentationLockSnapshot | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  getSnapshot(): SpritePresentationLockSnapshot | null {
    this.pruneExpired();
    return this.current ? { ...this.current } : null;
  }

  shouldAllow(request: SpritePresentationRequest = {}): boolean {
    const now = request.now ?? this.now();
    this.pruneExpired(now);

    if (request.ignoreLock || !this.current) {
      return true;
    }

    if (request.ownerId && request.ownerId === this.current.ownerId) {
      return true;
    }

    return (request.priority ?? 0) >= this.current.priority;
  }

  acquire(ownerId: string, priority: number, ttlMs: number, reason?: string): boolean {
    const now = this.now();
    if (!this.shouldAllow({ ownerId, priority, now })) {
      return false;
    }

    this.current = {
      ownerId,
      priority,
      acquiredAt: now,
      expiresAt: now + Math.max(0, ttlMs),
      reason
    };
    return true;
  }

  release(ownerId: string): boolean {
    this.pruneExpired();
    if (!this.current || this.current.ownerId !== ownerId) {
      return false;
    }

    this.current = null;
    return true;
  }

  clear(): void {
    this.current = null;
  }

  private pruneExpired(now = this.now()): void {
    if (this.current && this.current.expiresAt <= now) {
      this.current = null;
    }
  }
}
