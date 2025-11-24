export interface VersionInfo {
  update: boolean;
  version: string;
  newVersion?: string;
}

export interface ErrorType {
  message: string;
  error: Error;
}
