/**
 * RichTextEditor - 向后兼容的包装组件
 *
 * 此组件现在基于 UnifiedEditor 实现，提供与原有 API 完全兼容的接口。
 * 建议新代码直接使用 UnifiedEditor 组件。
 *
 * @deprecated 请使用 @/components/Editor/UnifiedEditor 代替
 */
import { ReactNode, useMemo } from 'react';

import type { AICompletionHandler } from '@/components/Editor';
import { UnifiedEditor } from '@/components/Editor';
import { resourceMentionItems } from '@/components/Editor/extensions';

import type { ResourceUploadContext } from '../utils/resourceCardEditor';
import { createResourceUploadHandler } from '../utils/resourceCardEditor';

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
  const resourceUploadHandler = useMemo(() => {
    if (!resourceUploadContext) {
      return undefined;
    }
    return createResourceUploadHandler({
      workspaceId: resourceUploadContext.workspaceId,
      folderId: resourceUploadContext.folderId
    });
  }, [resourceUploadContext?.workspaceId, resourceUploadContext?.folderId]);

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
    />
  );
};
