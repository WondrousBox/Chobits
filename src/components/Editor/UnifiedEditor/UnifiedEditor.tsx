import '../index.scss';

import { EditorContent, EditorEvents, useEditor } from '@tiptap/react';
import { debounce, DebouncedFunc } from 'lodash-es';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { EditorBubbleMenu } from '../Bubble';
import DEFAULT_EDITOR_CONTENT from '../default-content';
import { createFullExtensions, extensions as fullExtensions } from '../extensions';
import { TiptapEditorProps as editorProps } from '../props';
import type { UnifiedEditorProps } from './types';
import { UnifiedToolbar } from './UnifiedToolbar';

// 防抖保存函数类型
type SaveFunction = DebouncedFunc<(value: EditorEvents['update']) => void>;

// 创建防抖保存函数
const createSaveFunction = (onUpdate?: (e: EditorEvents['update']) => void): SaveFunction =>
  debounce(
    (value: EditorEvents['update']) => {
      onUpdate?.(value);
    },
    1000,
    { trailing: true }
  );
export const UnifiedEditor = ({
  content = '',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  noteId,
  mode = 'full',
  editable = true,
  placeholder,
  className,
  style,
  toolbarPosition = 'bottom',
  toolbarRight,
  showBubbleMenu = false,
  showPlayerControls = false,
  showMediaButtons = false,
  onChange,
  onUpdate,
  onEditorReady,
  markdown = true,
  mentionItems,
  additionalExtensions = []
}: UnifiedEditorProps): JSX.Element => {
  const [isFocused, setIsFocused] = useState(false);
  const hideToolbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isReadonly = mode === 'readonly' || !editable;
  const isNoteLayout = toolbarPosition === 'bottom';
  const actualShowBubbleMenu = showBubbleMenu || isNoteLayout;
  const actualShowPlayerControls = showPlayerControls || isNoteLayout;
  const actualShowMediaButtons = showMediaButtons || isNoteLayout;

  // 创建防抖保存函数
  const saveNoteRef = useRef<SaveFunction | null>(null);
  useEffect(() => {
    saveNoteRef.current = createSaveFunction(onUpdate);
    return () => {
      saveNoteRef.current?.cancel();
    };
  }, [onUpdate]);

  // 取消隐藏工具栏的计时器
  const cancelHideToolbar = (): void => {
    if (hideToolbarTimeoutRef.current) {
      clearTimeout(hideToolbarTimeoutRef.current);
      hideToolbarTimeoutRef.current = null;
    }
  };

  // 统一使用完整扩展（slash、mention、代码块等）
  const extensions = mentionItems ? [...createFullExtensions(mentionItems), ...additionalExtensions] : [...fullExtensions, ...additionalExtensions];

  const initialContent = content || (isNoteLayout ? DEFAULT_EDITOR_CONTENT : '');

  const editor = useEditor({
    extensions,
    editorProps,
    content: initialContent,
    editable: !isReadonly,
    onUpdate: (e: EditorEvents['update']) => {
      if (onUpdate) saveNoteRef.current?.(e);
      if (onChange && markdown) {
        onChange((e.editor.storage as any).markdown?.getMarkdown?.() || e.editor.getHTML());
      } else if (onChange) {
        onChange(e.editor.getHTML());
      }
    },
    onFocus: () => {
      if (isReadonly) return;
      cancelHideToolbar();
      setIsFocused(true);
    },
    onBlur: () => {
      if (isReadonly) return;
      hideToolbarTimeoutRef.current = setTimeout(() => {
        setIsFocused(false);
        hideToolbarTimeoutRef.current = null;
      }, 200);
    }
  });

  // 编辑器就绪回调
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // 同步 editable 状态
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadonly);
    }
  }, [editor, isReadonly]);

  // 同步外部 content（非笔记布局时，仅当编辑器为空时写入，避免光标跳动）
  useEffect(() => {
    if (!isNoteLayout && editor && content) {
      const currentContent = markdown ? (editor.storage as any).markdown?.getMarkdown?.() || '' : editor.getHTML();
      if (currentContent !== content && editor.isEmpty) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor, isNoteLayout, markdown]);

  // 处理截图数据（完整模式）- 保留以便将来使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleScreenshotsData = useCallback(
    (_event: unknown, msg: { type: 'send:file:completed'; data: string }) => {
      if (msg.type === 'send:file:completed') {
        editor?.commands.insertContent([
          {
            type: 'image',
            attrs: {
              src: 'aim:///' + msg.data,
              alt: null,
              title: null
            }
          },
          {
            type: 'paragraph'
          }
        ]);
        setTimeout(() => {
          editor?.commands.focus('end');
        }, 0);
      }
    },
    [editor]
  );

  // 处理点击底部空白区域
  const handleClickBottom = (): void => {
    const json = editor?.getJSON();
    if (json?.content && editor) {
      const lastBlock = json.content[json.content.length - 1];
      if (lastBlock.type === 'image' || lastBlock.type === 'codeBlock') {
        if (lastBlock.type === 'codeBlock') {
          editor.commands.exitCode();
          setTimeout(() => {
            editor.commands.insertContent([{ type: 'paragraph' }]);
          }, 0);
        } else {
          editor.commands.insertContent([json.content[json.content.length - 1], { type: 'paragraph' }]);
        }
        setTimeout(() => {
          editor.commands.focus('end');
        }, 0);
      }
      setTimeout(() => {
        editor?.commands.focus('end');
      }, 0);
    }
  };

  // 清理工作
  useEffect(() => {
    return () => {
      cancelHideToolbar();
    };
  }, []);

  const editorContentClassName = 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px] p-4';

  // 笔记页布局：底部固定工具栏 + ScrollArea
  if (isNoteLayout) {
    return (
      <div className={className} style={style}>
        <ScrollArea className="h-full relative mx-auto min-h-[500px] w-full md:w-[650px] bg-background text-foreground">
          {editor && actualShowBubbleMenu && <EditorBubbleMenu editor={editor} />}
          <div className={editorContentClassName}>
            <EditorContent editor={editor} />
          </div>
          <div onClick={handleClickBottom} className="h-96"></div>
        </ScrollArea>
        {editor && (
          <div className="fixed bottom-0 w-full">
            <UnifiedToolbar editor={editor} position="bottom" showMediaButtons={actualShowMediaButtons} showPlayerControls={actualShowPlayerControls} />
          </div>
        )}
      </div>
    );
  }

  // 内嵌布局：浮动/顶部/底部工具栏 + flex 内容区
  const showFloatingToolbar = toolbarPosition === 'floating' && !isReadonly && isFocused;

  return (
    <div className={cn('bg-background flex flex-col relative', className)} style={style}>
      {showFloatingToolbar && (
        <UnifiedToolbar
          editor={editor}
          visible={true}
          toolbarRight={toolbarRight}
          showPlayerControls={actualShowPlayerControls}
          showMediaButtons={actualShowMediaButtons}
          className="absolute left-0 z-10 w-full box-border -top-12 border border-solid rounded-lg"
        />
      )}
      {toolbarPosition === 'top' && !isReadonly && (
        <UnifiedToolbar editor={editor} visible={true} toolbarRight={toolbarRight} showPlayerControls={actualShowPlayerControls} showMediaButtons={actualShowMediaButtons} className="rounded-t-lg" />
      )}
      <div className="flex-1 overflow-y-auto text-foreground">
        <EditorContent editor={editor} className={editorContentClassName} />
      </div>
      {toolbarPosition === 'bottom' && !isReadonly && (
        <UnifiedToolbar editor={editor} visible={true} toolbarRight={toolbarRight} showPlayerControls={actualShowPlayerControls} showMediaButtons={actualShowMediaButtons} className="rounded-b-lg" />
      )}
    </div>
  );
};

export default UnifiedEditor;
