import { initDailyCareIPC } from './ipc-main';
import { DailyCareService, type DailyCareServiceOptions } from './service';
import type { NoticeDispatcherResolver, WindowResolver } from './types';

let instance: DailyCareService | null = null;

export function initDailyCare(windowResolver: WindowResolver, noticeDispatcherResolver?: NoticeDispatcherResolver, options?: DailyCareServiceOptions): DailyCareService {
  if (!instance) {
    instance = new DailyCareService(windowResolver, noticeDispatcherResolver, options);
    initDailyCareIPC(instance);
    instance.start();
  }
  return instance;
}

export function getDailyCareService(): DailyCareService | null {
  return instance;
}
