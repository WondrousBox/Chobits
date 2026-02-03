import '../index.scss';

import Placeholder from '@tiptap/extension-placeholder';
import type { AnyExtension } from '@tiptap/react';
import { EditorContent, EditorEvents, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import clsx from 'clsx';
import { debounce, DebouncedFunc } from 'lodash-es';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from 'tiptap-markdown';

import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { EditorBubbleMenu } from '../Bubble';
import DEFAULT_EDITOR_CONTENT from '../default-content';
import { createFullExtensions, extensions as fullExtensions } from '../extensions';
import { TiptapEditorProps as editorProps } from '../props';
import type { UnifiedEditorProps } from './types';
import { UnifiedToolbar } from './UnifiedToolbar';

// 简洁模式的基础扩展
const createSimpleExtensions = (placeholder?: string): AnyExtension[] => [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3]
    }
  }),
  Placeholder.configure({
    placeholder: placeholder || '输入内容...'
  }),
  Markdown
];

// 防抖保存函数类型
type SaveFunction = DebouncedFunc<(value: EditorEvents['update'], title: string) => void>;

// 创建防抖保存函数
const createSaveFunction = (onUpdate?: (e: EditorEvents['update'], title: string) => void): SaveFunction =>
  debounce(
    (value: EditorEvents['update'], title: string) => {
      onUpdate?.(value, title);
    },
    1000,
    { trailing: true }
  );

/**
 * 统一富文本编辑器组件
 *
 * 整合了完整编辑器（笔记 Tab）和简洁编辑器（资源列表空白页）的功能，
 * 提供统一的 API 和可配置的显示模式。
 *
 * 使用示例：
 *
 * 1. 简洁模式（类似原 RichTextEditor）：
 * ```tsx
 * <UnifiedEditor
 *   content={content}
 *   onChange={setContent}
 *   mode="simple"
 *   placeholder="在此输入..."
 * />
 * ```
 *
 * 2. 完整模式（类似原 Tiptap 笔记编辑器）：
 * ```tsx
 * <UnifiedEditor
 *   content={content}
 *   title={title}
 *   onUpdate={handleUpdate}
 *   mode="full"
 *   showTitle
 *   showBubbleMenu
 *   showPlayerControls
 * />
 * ```
 *
 * 3. 只读模式：
 * ```tsx
 * <UnifiedEditor
 *   content={content}
 *   mode="readonly"
 *   editable={false}
 * />
 * ```
 */
export const UnifiedEditor = ({
  content = '',
  title = '',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  noteId,
  mode = 'simple',
  editable = true,
  placeholder,
  className,
  style,
  toolbarPosition,
  toolbarRight,
  showTitle = false,
  showBubbleMenu = false,
  showPlayerControls = false,
  showMediaButtons = false,
  onChange,
  onUpdate,
  onTitleChange,
  onEditorReady,
  markdown = true,
  useFullExtensions = false,
  mentionItems,
  additionalExtensions = []
}: UnifiedEditorProps): JSX.Element => {
  // 状态
  const [currentTitle, setCurrentTitle] = useState(title);
  const [hasBlur, setHasBlur] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const hideToolbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 根据模式决定显示参数
  const isFullMode = mode === 'full';
  const isReadonly = mode === 'readonly' || !editable;
  const actualToolbarPosition = toolbarPosition ?? (isFullMode ? 'bottom' : 'floating');
  const actualShowTitle = showTitle || isFullMode;
  const actualShowBubbleMenu = showBubbleMenu || isFullMode;
  const actualShowPlayerControls = showPlayerControls || isFullMode;
  const actualShowMediaButtons = showMediaButtons || isFullMode;

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

  // 选择扩展配置
  // 如果启用 useFullExtensions，即使在简洁模式下也使用完整扩展（包括 slash 命令、mention 等）
  // 如果提供了自定义 mentionItems，使用它们创建新的扩展配置
  const extensions =
    isFullMode || useFullExtensions
      ? mentionItems
        ? [...createFullExtensions(mentionItems), ...additionalExtensions]
        : [...fullExtensions, ...additionalExtensions]
      : [...createSimpleExtensions(placeholder), ...additionalExtensions];

  // 创建编辑器实例
  const editor = useEditor({
    extensions,
    editorProps: isFullMode ? editorProps : undefined,
    content: content || (isFullMode ? DEFAULT_EDITOR_CONTENT : ''),
    editable: !isReadonly,
    onUpdate: (e: EditorEvents['update']) => {
      // 完整模式使用防抖保存
      if (isFullMode && onUpdate) {
        saveNoteRef.current?.(e, currentTitle);
      }
      // 简洁模式直接调用 onChange
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

  // 同步外部内容变化（简洁模式）
  useEffect(() => {
    if (!isFullMode && editor && content) {
      const currentContent = markdown ? (editor.storage as any).markdown?.getMarkdown?.() || '' : editor.getHTML();

      if (currentContent !== content) {
        // 只有当编辑器为空时才设置内容，避免光标跳动
        if (editor.isEmpty && content) {
          editor.commands.setContent(content);
        }
      }
    }
  }, [content, editor, isFullMode, markdown]);

  // 处理标题输入的回车键
  const handleTitleKeyup = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      editor?.commands.focus();
    }
  };

  // 处理标题变更
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newTitle = e.target.value;
    setCurrentTitle(newTitle);
    onTitleChange?.(newTitle);
  };

  // 处理标题失焦
  const handleTitleBlur = (): void => {
    setHasBlur(true);
  };

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

  // 完整模式渲染
  if (isFullMode) {
    return (
      <div className={clsx('Tiptap', className)} style={style}>
        <ScrollArea className="h-full relative mx-auto min-h-[500px] w-full md:w-[650px] bg-background text-foreground">
          {actualShowTitle && (
            <Input
              className={cn('p-2 font-extrabold w-full outline-none border-b border-b-border rounded-none border-l-0 border-r-0 border-t-0 text-2xl', hasBlur && !currentTitle && 'border-b-red-400')}
              value={currentTitle}
              onChange={handleTitleChange}
              placeholder="输入标题"
              onKeyUp={handleTitleKeyup}
              onBlur={handleTitleBlur}
            />
          )}
          {editor && actualShowBubbleMenu && <EditorBubbleMenu editor={editor} />}
          <div id="editorContainer">
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

  // 简洁模式渲染
  const showFloatingToolbar = actualToolbarPosition === 'floating' && !isReadonly && isFocused;

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
      {actualToolbarPosition === 'top' && !isReadonly && (
        <UnifiedToolbar editor={editor} visible={true} toolbarRight={toolbarRight} showPlayerControls={actualShowPlayerControls} showMediaButtons={actualShowMediaButtons} className="rounded-t-lg" />
      )}
      <div className="flex-1 overflow-y-auto text-foreground">
        <EditorContent editor={editor} className="prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px] p-4" />
      </div>
      {actualToolbarPosition === 'bottom' && !isReadonly && (
        <UnifiedToolbar editor={editor} visible={true} toolbarRight={toolbarRight} showPlayerControls={actualShowPlayerControls} showMediaButtons={actualShowMediaButtons} className="rounded-b-lg" />
      )}
    </div>
  );
};

export default UnifiedEditor;
