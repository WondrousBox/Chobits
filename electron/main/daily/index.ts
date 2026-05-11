import { initDailyCareIPC } from './ipc-main';
import { DailyCareService } from './service';
import type { NoticeDispatcherResolver, WindowResolver } from './types';

let instance: DailyCareService | null = null;

export function initDailyCare(windowResolver: WindowResolver, noticeDispatcherResolver?: NoticeDispatcherResolver): DailyCareService {
  if (!instance) {
    instance = new DailyCareService(windowResolver, noticeDispatcherResolver);
    initDailyCareIPC(instance);
    instance.start();
  }
  return instance;
}

export function getDailyCareService(): DailyCareService | null {
  return instance;
}
