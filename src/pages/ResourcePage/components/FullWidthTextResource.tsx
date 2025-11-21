import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import React, { useEffect, useState } from 'react';

import { ResourceItem } from '@/types';

interface FullWidthTextResourceProps {
  item: ResourceItem;
  onPreview?: () => void;
}

const FullWidthTextResource: React.FC<FullWidthTextResourceProps> = ({ item, onPreview }) => {
  const [content, setContent] = useState<string>('');

  // 加载文本内容
  useEffect(() => {
    const loadContent = async () => {
      if (item.contentText) {
        setContent(item.contentText);
        return;
      }
      if (item.filePath) {
        try {
          const result = await (window as any).YUA?.file['file:readContent'](item.filePath, 50000); // 限制 50KB
          if (result?.success && result.content) {
            setContent(result.content);
          }
        } catch (e) {
          console.warn('load text content failed', e);
        }
      }
    };
    loadContent();
  }, [item]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: content,
    editable: false, // 只读模式
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none p-4 min-h-[200px]'
      }
    }
  });

  // 当内容变化时更新编辑器
  useEffect(() => {
    if (editor && content && editor.getHTML() !== content) {
      // 如果是纯文本，尝试转换为 HTML
      if (!content.includes('<') && !content.includes('&')) {
        // 简单的文本转 HTML：保留换行
        const htmlContent = content
          .split('\n')
          .map((line) => `<p>${line || '<br>'}</p>`)
          .join('');
        editor.commands.setContent(htmlContent);
      } else {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  if (!content) {
    return (
      <div className="border rounded-lg p-8 bg-muted/30 text-center text-muted-foreground">
        <p>暂无内容</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden" onClick={onPreview}>
      <div className="border-b p-2 bg-muted/30">
        <h3 className="text-sm font-medium truncate">{item.title || item.filePath?.split('/').pop() || '文本资源'}</h3>
      </div>
      <div className="overflow-y-auto max-h-[600px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default FullWidthTextResource;
