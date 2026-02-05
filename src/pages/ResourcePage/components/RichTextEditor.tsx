/**
 * RichTextEditor - 向后兼容的包装组件
 *
 * 此组件现在基于 UnifiedEditor 实现，提供与原有 API 完全兼容的接口。
 * 建议新代码直接使用 UnifiedEditor 组件。
 *
 * @deprecated 请使用 @/components/Editor/UnifiedEditor 代替
 */
import { ReactNode, useCallback, useMemo } from 'react';

import type { AICompletionHandler } from '@/components/Editor';
import { UnifiedEditor } from '@/components/Editor';
import type { SlashCommandItem } from '@/components/Editor/extensions';
import { resourceMentionItems } from '@/components/Editor/extensions';

import type { ResourceUploadContext } from '../utils/resourceCardEditor';
import { createResourceCardSlashItem, createResourceUploadHandler } from '../utils/resourceCardEditor';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  toolbarRight?: ReactNode;
  readonly?: boolean;
  style?: React.CSSProperties;
  resourceUploadContext?: ResourceUploadContext;
  /** AI 续写处理函数 */
  onAIComplete?: AICompletionHandler;
}

export const RichTextEditor = ({ value, onChange, placeholder, className, toolbarRight, readonly = false, style, resourceUploadContext, onAIComplete }: RichTextEditorProps): JSX.Element => {
  const pickResourceFile = useCallback((): Promise<File | null> => {
    if (typeof document === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = () => {
        resolve(input.files?.[0] ?? null);
      };
      input.click();
    });
  }, []);

  const resourceUploadHandler = useMemo(() => {
    if (!resourceUploadContext) {
      return undefined;
    }
    return createResourceUploadHandler({
      workspaceId: resourceUploadContext.workspaceId,
      folderId: resourceUploadContext.folderId
    });
  }, [resourceUploadContext?.workspaceId, resourceUploadContext?.folderId]);

  const resourceSlashItem = useMemo(
    () => (resourceUploadContext ? createResourceCardSlashItem(pickResourceFile) : null),
    [resourceUploadContext?.workspaceId, resourceUploadContext?.folderId, pickResourceFile]
  );

  const slashCommandConfig = useMemo(() => {
    if (!resourceSlashItem) {
      return undefined;
    }
    const item = resourceSlashItem;
    return {
      items: ({ defaultItems }: { defaultItems: SlashCommandItem[] }) => [item, ...defaultItems]
    };
  }, [resourceSlashItem]);

  return (
    <UnifiedEditor
      content={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      toolbarRight={toolbarRight}
      readonly={readonly}
      style={style}
      toolbarPosition="floating"
      markdown={true}
      mentionItems={resourceMentionItems}
      onAIComplete={onAIComplete}
      onResourceUpload={resourceUploadHandler}
      slashCommandConfig={slashCommandConfig}
    />
  );
};
