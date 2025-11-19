import { initDailyCareIPC } from './ipc-main';
import { DailyCareService } from './service';
import type { WindowResolver } from './types';

let instance: DailyCareService | null = null;

export function initDailyCare(windowResolver: WindowResolver): DailyCareService {
  if (!instance) {
    instance = new DailyCareService(windowResolver);
    initDailyCareIPC(instance);
    instance.start();
  }
  return instance;
}

export function getDailyCareService(): DailyCareService | null {
  return instance;
}
