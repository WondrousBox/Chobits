import { MainSchedulerService, type MainSchedulerServiceOptions } from './service';

let sharedScheduler: MainSchedulerService | null = null;

export function getMainSchedulerService(options?: MainSchedulerServiceOptions): MainSchedulerService {
  if (!sharedScheduler) {
    sharedScheduler = new MainSchedulerService(options);
  }
  return sharedScheduler;
}

export function resetMainSchedulerServiceForTest(service: MainSchedulerService | null = null): void {
  sharedScheduler?.stop();
  sharedScheduler = service;
}
