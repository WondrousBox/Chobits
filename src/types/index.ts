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
  | "image"
  | "video"
  | "audio"
  | "text"
  | "file"
  | "subtitle"
  | "document"
  | "link"
  | "other";


export type SelectedResourceFileType = {
  _id?: string;
  path: string;
  name?: string;
  url?: string;
  size?: number;
  type?: ResourceTypes;
  extension?: string;
  file?: File;
};

export interface ResourceItem {
  id: string
  title?: string
  type: string
  filePath?: string
  url?: string
  thumbnailPath?: string
  createdAt?: number
  // 下载来源信息
  domain?: string
  sourceName?: string
  authorName?: string
  description?: string
}