import { EditorEvents } from '@tiptap/react';
import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { UnifiedEditor } from '@/components/Editor';

import { createResourceCardSlashItem, createResourceUploadHandler } from '../../utils/resourceCardEditor';
import { useResourceTabContext } from './ResourceTabContext';

const NotesTab: React.FC = () => {
  const { resource } = useResourceTabContext();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 使用 ref 保存最新的 resourceId，避免闭包问题
  const resourceIdRef = useRef<string | null>(null);

  useEffect(() => {
    resourceIdRef.current = resource?.id || null;
  }, [resource?.id]);

  // 加载笔记内容
  useEffect(() => {
    const loadNote = async (): Promise<void> => {
      if (!resource?.id) return;

      setLoading(true);
      try {
        const noteData = await window.YUA.ai.getResourceNote(resource.id);
        if (noteData) {
          setContent(noteData.content || '');
          setNoteId(noteData.id);
        } else {
          // 没有笔记，使用默认值
          setContent('');
          setNoteId(null);
        }
      } catch (error) {
        console.error('加载笔记失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadNote();
  }, [resource?.id]);

  // 实际的保存函数（不再使用标题）
  const saveNote = useCallback(async (markdown: string) => {
    const resourceId = resourceIdRef.current;
    if (!resourceId) return;

    setIsSaving(true);
    try {
      const result = await window.YUA.ai.saveNote({
        resourceId,
        content: markdown,
        title: '笔记'
      });

      if (result.success && result.noteId) {
        setNoteId(result.noteId);
        console.log('✓ 笔记已自动保存');
      } else {
        console.error('保存笔记失败:', result.message);
      }
    } catch (error) {
      console.error('保存笔记失败:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // 创建防抖保存函数（2秒防抖，避免频繁保存）
  const debouncedSave = useMemo(
    () =>
      debounce(
        (markdown: string) => {
          saveNote(markdown);
        },
        500,
        { trailing: true, leading: false }
      ),
    [saveNote]
  );

  // 清理防抖函数
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // 编辑器更新回调
  const handleUpdate = useCallback(
    (e: EditorEvents['update']) => {
      const markdown = (e.editor.storage as any).markdown?.getMarkdown?.() || e.editor.getHTML();
      debouncedSave(markdown);
    },
    [debouncedSave]
  );

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

  const handleResourceUpload = useMemo(
    () =>
      createResourceUploadHandler({
        workspaceId: resource?.workspaceId,
        folderId: resource?.folderId
      }),
    [resource?.workspaceId, resource?.folderId]
  );

  const resourceSlashItem = useMemo(() => createResourceCardSlashItem(pickResourceFile), [pickResourceFile]);

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
        <span>加载笔记中...</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden relative">
      {isSaving && <div className="absolute top-2 right-2 z-50 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded-md border">保存中...</div>}
      <UnifiedEditor
        content={content}
        noteId={noteId || undefined}
        showBubbleMenu
        showPlayerControls
        showMediaButtons
        onUpdate={handleUpdate}
        onResourceUpload={handleResourceUpload}
        slashCommandConfig={{
          items: ({ defaultItems }) => [resourceSlashItem, ...defaultItems]
        }}
      />
    </div>
  );
};

export default NotesTab;
