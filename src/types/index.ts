export interface VersionInfo {
  update: boolean
  version: string
  newVersion?: string
}

export interface ErrorType {
  message: string
  error: Error
}


export type ResourceTypes =
  | "doc"
  | "audio"
  | "video"
  | "image"
  | "subtitle"
  | "file"
  | "url";

export type SelectedResourceFileType = {
  _id?: string;
  path: string;
  name?: string;
  url?: string;
  size?: number;
  type?: ResourceTypes;
  extension?: string;
  isUrl?: boolean;
};