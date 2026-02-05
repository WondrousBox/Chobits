import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import type { ResourceItem } from '../../types';
import { makeResSrc } from '../../utils/resourceProtocol';
import { RichTextEditor } from '../RichTextEditor';

interface TextPlayerProps {
  resource: ResourceItem;
}

export const TextPlayer: React.FC<TextPlayerProps> = ({ resource }) => {
  const [textContent, setTextContent] = useState<string>('');
  const [loadingText, setLoadingText] = useState(false);

  const fileSrc = resource.filePath ? makeResSrc(resource.filePath) : resource.url;

  // 自动保存
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

  // 切换资源或卸载组件时，确保待保存的更改被立即保存
  useEffect(() => {
    return () => {
      debouncedSave.flush();
    };
  }, [resource.id, debouncedSave]);

  const handleTextChange = useCallback(
    (newContent: string) => {
      setTextContent(newContent);
      if (resource?.id && resource.type === 'text') {
        debouncedSave(resource.id, newContent);
      }
    },
    [resource?.id, resource.type, debouncedSave]
  );

  // 加载文本类资源内容（通过主进程读取文件内容）
  useEffect(() => {
    const data = resource;

    if (!data) {
      setTextContent('');
      return;
    }

    if (data.type === 'text' || data.type === 'document' || data.type === 'file') {
      if (data.type === 'text') {
        setTextContent(data.contentText || '');
        return;
      }

      // 优先使用 contentText
      if (data.contentText) {
        setTextContent(data.contentText || '');
        return;
      }

      // 通过主进程读取文件内容
      if (data.filePath) {
        const lower = data.filePath.toLowerCase();
        if (/(\.txt|\.md|\.log|\.json|\.csv|\.ts|\.js|\.tsx|\.jsx|\.py|\.go|\.rs|\.java|\.c|\.cpp|\.yml|\.yaml|\.toml|\.ini)$/i.test(lower)) {
          setLoadingText(true);
          window.YUA.file['file:readContent'](data.filePath)
            .then((result: any) => {
              if (result.success) {
                const content = result.content || '';
                setTextContent(content);
              } else {
                setTextContent('（无法加载文本内容）');
              }
            })
            .catch(() => setTextContent('（无法加载文本内容）'))
            .finally(() => setLoadingText(false));
          return;
        }
      }

      setTextContent('（暂无提取文本）');
    } else {
      setTextContent('');
    }
  }, [resource]);

  const isPureText = resource.type === 'text';

  return (
    <div className="flex h-full w-full flex-col text-xs text-muted-foreground">
      {isPureText || textContent ? (
        <>
          {isPureText ? (
            <div className="h-full w-full">
              <RichTextEditor value={textContent} onChange={handleTextChange} placeholder={loadingText ? '加载中…' : '暂无内容'} className="h-full w-full" style={{ height: '100%' }} />
            </div>
          ) : (
            <ScrollArea className="h-full w-full">
              <div className="box-border h-full w-full select-text overflow-auto px-4 py-3 text-left font-mono text-xs leading-relaxed">
                {loadingText ? '加载中…' : textContent || '（无文本内容）'}
              </div>
            </ScrollArea>
          )}
        </>
      ) : null}

      {!isPureText && !textContent && fileSrc && <div className="text-[11px] break-all">来源: {fileSrc}</div>}
    </div>
  );
};
