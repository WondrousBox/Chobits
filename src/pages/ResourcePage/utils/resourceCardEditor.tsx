import { FileUp } from 'lucide-react';

import type { ResourceCardData, ResourceUploadHandler, SlashCommandItem } from '@/components/Editor/extensions';
import { insertResourceCardFromFile } from '@/components/Editor/extensions';
import { getLocalPathForFile } from '@/lib/local-file-path';

import { addResourcesFromSelectedFiles } from '../services/resourceService';
import type { SelectedResourceFileType } from '../types';
import { isImageFile, makeResSrc } from './resourceProtocol';

export type ResourceUploadContext = {
  workspaceId?: string | null;
  folderId?: string | null;
};

export const createResourceUploadHandler = (context: ResourceUploadContext): ResourceUploadHandler => {
  return async (file) => {
    const localPath = getLocalPathForFile(file);
    const files: SelectedResourceFileType[] = [
      {
        path: localPath || file.name,
        localPath,
        relativePath: `./${file.name}`,
        name: file.name,
        size: file.size,
        file
      }
    ];

    const [uploaded] = await addResourcesFromSelectedFiles(files, {
      workspaceId: context.workspaceId || undefined,
      folderId: context.folderId || undefined
    });

    if (!uploaded) {
      return null;
    }

    const previewUrl = uploaded.thumbnailPath ? makeResSrc(uploaded.thumbnailPath) : uploaded.filePath && isImageFile(uploaded.filePath) ? makeResSrc(uploaded.filePath) : undefined;

    const cardData: ResourceCardData = {
      resourceId: uploaded.id,
      title: uploaded.title || file.name,
      description: uploaded.description,
      type: uploaded.type,
      sizeBytes: uploaded.sizeBytes,
      filePath: uploaded.filePath,
      previewUrl,
      thumbnailPath: uploaded.thumbnailPath,
      mimeType: uploaded.mimeType,
      status: uploaded.status || 'ready'
    };

    return cardData;
  };
};

export const createResourceCardSlashItem = (pickFile: () => Promise<File | null>): SlashCommandItem => ({
  title: '插入文件',
  description: '上传文件并插入资源卡片',
  searchTerms: ['resource', 'file', 'upload', 'card'],
  requiresUpload: true,
  icon: <FileUp className="h-4 w-4" />,
  command: async ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).run();
    const file = await pickFile();
    if (!file) return;
    await insertResourceCardFromFile(editor, file);
  }
});
