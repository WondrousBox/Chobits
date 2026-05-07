export type EmojiPackStorageKind = 'userData' | 'workspace';

export interface EmojiPackSettings {
  lastImportedPackId?: string;
}

export interface EmojiPackFileEntry {
  kind: 'file';
  name: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
}

export interface EmojiPackFolderEntry {
  kind: 'folder';
  name: string;
  relativePath: string;
  childFolderCount: number;
  fileCount: number;
  totalFileCount: number;
}

export type EmojiPackTreeEntry = EmojiPackFileEntry | EmojiPackFolderEntry;

export interface EmojiPackManifest {
  id: string;
  name: string;
  sourcePath?: string;
  storageKind: EmojiPackStorageKind;
  workspaceId?: string;
  workspaceRootPath?: string;
  resourcesRootPath: string;
  rootPath: string;
  importedAt: number;
  updatedAt: number;
  totalFileCount: number;
  totalFolderCount: number;
  topLevelFolders: string[];
  topLevelFiles: string[];
  tree: EmojiPackTreeFolder;
}

export interface EmojiPackTreeFolder {
  kind: 'folder';
  name: string;
  relativePath: string;
  children: EmojiPackTreeNode[];
}

export type EmojiPackTreeNode = EmojiPackTreeFolder | EmojiPackTreeFile;

export interface EmojiPackTreeFile {
  kind: 'file';
  name: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  title: string;
}

export interface EmojiPackSummary {
  id: string;
  name: string;
  storageKind: EmojiPackStorageKind;
  workspaceId?: string;
  rootPath: string;
  importedAt: number;
  updatedAt: number;
  totalFileCount: number;
  totalFolderCount: number;
  topLevelFolders: string[];
  topLevelFiles: string[];
  previewUrls: string[];
}

export type EmojiPackListNode =
  | (EmojiPackFolderEntry & {
      packId: string;
      packName: string;
    })
  | (EmojiPackFileEntry & {
      packId: string;
      packName: string;
      url: string;
    });

export interface EmojiPackImportResult {
  ok: boolean;
  pack?: EmojiPackSummary;
  sourcePath: string;
  error?: string;
}

export interface EmojiPackSearchResult {
  packId: string;
  packName: string;
  name: string;
  relativePath: string;
  title: string;
  url: string;
  mimeType: string;
  score: number;
}
