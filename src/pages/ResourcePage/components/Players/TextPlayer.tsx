import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../types';
import { makeResSrc } from '../../utils/resourceProtocol';
import { RichTextEditor } from '../RichTextEditor';

interface TextPlayerProps {
  resource: ResourceItem;
}

const READABLE_TEXT_EXT_RE = /(\.txt|\.md|\.log|\.json|\.csv|\.ts|\.js|\.tsx|\.jsx|\.py|\.go|\.rs|\.java|\.c|\.cpp|\.yml|\.yaml|\.toml|\.ini)$/i;

function canReadFileContent(resource: ResourceItem): boolean {
  return !!resource.filePath && READABLE_TEXT_EXT_RE.test(resource.filePath.toLowerCase());
}

export const TextPlayer: React.FC<TextPlayerProps> = ({ resource }) => {
  if (resource.type === 'text') {
    return <EditableTextResource key={resource.id} resource={resource} />;
  }

  if (resource.contentText) {
    return <ReadonlyTextContent text={resource.contentText} />;
  }

  return <FileTextResource key={`${resource.id}:${resource.filePath || ''}`} resource={resource} />;
};

const EditableTextResource: React.FC<TextPlayerProps> = ({ resource }) => {
  const [textContent, setTextContent] = useState<string>(resource.contentText || '');
  const debouncedSave = useMemo(
    () =>
      debounce((id: string, content: string) => {
        if (id) {
          console.log(`[auto-save] saving resource ${id}`);
          window.YUA.resource['resource:update']({ id, patch: { contentText: content } });
        }
      }, 1000),
    []
  );

  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [debouncedSave]);

  const handleTextChange = useCallback(
    (newContent: string) => {
      setTextContent(newContent);
      if (resource.id) {
        debouncedSave(resource.id, newContent);
      }
    },
    [resource.id, debouncedSave]
  );

  return (
    <div className="flex h-full w-full flex-col text-xs text-muted-foreground">
      <div className="h-full w-full">
        <RichTextEditor
          value={textContent}
          onChange={handleTextChange}
          placeholder="暂无内容"
          className="h-full w-full"
          style={{ height: '100%' }}
          resourceUploadContext={{ workspaceId: resource.workspaceId, folderId: resource.folderId }}
        />
      </div>
    </div>
  );
};

const ReadonlyTextContent: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex h-full w-full flex-col text-xs text-muted-foreground">
    <ScrollArea className="h-full w-full">
      <div className="box-border h-full w-full select-text overflow-auto px-4 py-3 text-left font-mono text-xs leading-relaxed">{text || '（无文本内容）'}</div>
    </ScrollArea>
  </div>
);

const FileTextResource: React.FC<TextPlayerProps> = ({ resource }) => {
  const [fileTextContent, setFileTextContent] = useState<string>('');
  const fileSrc = resource.filePath ? makeResSrc(resource.filePath) : resource.url;

  useEffect(() => {
    if (!['document', 'file'].includes(resource.type) || !canReadFileContent(resource)) {
      return;
    }

    let cancelled = false;
    window.YUA.file['file:readContent'](resource.filePath!)
      .then((result: any) => {
        if (cancelled) return;
        setFileTextContent(result.success ? result.content || '' : '（无法加载文本内容）');
      })
      .catch(() => {
        if (!cancelled) setFileTextContent('（无法加载文本内容）');
      });
    return () => {
      cancelled = true;
    };
  }, [resource.filePath, resource.type]);

  if (fileTextContent) {
    return <ReadonlyTextContent text={fileTextContent} />;
  }

  return (
    <div className="flex h-full w-full flex-col text-xs text-muted-foreground">
      {fileSrc ? <div className="text-[11px] break-all">来源: {fileSrc}</div> : null}
    </div>
  );
};
