import path from 'node:path';

/**
 * Resolve the mutable runtime data root for one app environment.
 * Packaged data keeps the existing location; dev data is isolated so a
 * packaged run cannot mark a fresh dev environment's onboarding complete.
 */
export function resolveRuntimeDataDir(userDataDir: string, isPackaged: boolean): string {
  return isPackaged ? userDataDir : path.join(userDataDir, 'dev');
}
