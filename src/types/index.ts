export interface VersionInfo {
  update: boolean;
  version: string;
  newVersion?: string;
}

export interface ErrorType {
  message: string;
  error: Error;
}

// RSS 相关类型
export * from '../../electron/main/handlers/rss/types';
