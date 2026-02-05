import '../index.scss';

import { EditorContent, EditorEvents, useEditor } from '@tiptap/react';
import { debounce, DebouncedFunc } from 'lodash-es';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

import { EditorBubbleMenu } from '../Bubble';
import DEFAULT_EDITOR_CONTENT from '../default-content';
import { createFullExtensions, setAICompleteHandler, setResourceUploadHandler } from '../extensions';
import { createEditorProps } from '../props';
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
  noteId,
  readonly = false,
  placeholder,
  className,
  style,
  toolbarPosition = 'top',
  toolbarRight,
  showBubbleMenu = false,
  showMediaButtons = false,
  mediaControls,
  editorProps: editorPropsOverride,
  onChange,
  onUpdate,
  onEditorReady,
  markdown = true,
  mentionItems,
  slashCommandConfig,
  additionalExtensions = [],
  onImageUpload,
  onResourceUpload,
  onAIComplete,
  shouldKeepToolbarVisible
}: UnifiedEditorProps): JSX.Element => {
  const [isFocused, setIsFocused] = useState(false);
  const hideToolbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowUpload = Boolean(onResourceUpload);
  const resolvedOnImageUpload = allowUpload ? onImageUpload : undefined;
  const resolvedSlashCommandConfig = useMemo(() => {
    if (!slashCommandConfig) {
      return slashCommandConfig;
    }
    const { items, ...rest } = slashCommandConfig;
    if (allowUpload) {
      return slashCommandConfig;
    }

    if (!items) {
      return rest;
    }

    const filterItems = (itemsToFilter: typeof items extends (infer U)[] ? U[] : any[]) =>
      (itemsToFilter as any[]).filter((item) => !(item as { requiresUpload?: boolean })?.requiresUpload);

    const filteredItems = typeof items === 'function' ? (ctx: any) => filterItems(items(ctx)) : filterItems(items);
    return {
      ...rest,
      items: filteredItems
    };
  }, [slashCommandConfig, allowUpload]);

  const isNoteLayout = toolbarPosition === 'bottom';

  void noteId;

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

  const resolvedEditorProps = useMemo(
    () =>
      editorPropsOverride ??
      createEditorProps(resolvedOnImageUpload, {
        disableFileHandlers: Boolean(onResourceUpload)
      }),
    [editorPropsOverride, resolvedOnImageUpload, onResourceUpload]
  );

  // 统一使用完整扩展（slash、mention、代码块等）
  // AI 续写通过 useEffect 动态同步，不需要在这里传入 onAIComplete
  const extensions = [
    ...createFullExtensions({
      mentionItems,
      placeholder,
      onImageUpload: resolvedOnImageUpload,
      slashCommandConfig: resolvedSlashCommandConfig
    }),
    ...additionalExtensions
  ];

  const initialContent = content || DEFAULT_EDITOR_CONTENT;

  const editor = useEditor({
    extensions,
    editorProps: resolvedEditorProps,
    content: initialContent,
    editable: !readonly,
    onUpdate: (e: EditorEvents['update']) => {
      if (onUpdate) saveNoteRef.current?.(e);
      if (onChange && markdown) {
        onChange((e.editor.storage as any).markdown?.getMarkdown?.() || e.editor.getHTML());
      } else if (onChange) {
        onChange(e.editor.getHTML());
      }
    },
    onFocus: () => {
      if (readonly) return;
      cancelHideToolbar();
      setIsFocused(true);
    },
    onBlur: () => {
      if (readonly) return;
      // 延迟检测，因为焦点转移可能尚未完成
      hideToolbarTimeoutRef.current = setTimeout(() => {
        // 检测是否有 Radix UI 的 Popover/Dropdown/Dialog 打开
        // Radix UI 的 Portal 内容会有这些 data 属性
        const hasOpenPopover =
          shouldKeepToolbarVisible?.() ??
          (typeof document !== 'undefined' && Boolean(document.querySelector('[data-radix-popper-content-wrapper], [data-radix-menu-content], [data-state="open"][role="dialog"]')));
        // 如果有 Popover 打开，不隐藏工具栏
        if (hasOpenPopover) {
          return;
        }
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

  // 同步 AI 续写处理函数
  useEffect(() => {
    if (editor) {
      setAICompleteHandler(editor, onAIComplete);
    }
  }, [editor, onAIComplete]);

  // 同步资源上传处理函数
  useEffect(() => {
    if (editor) {
      setResourceUploadHandler(editor, onResourceUpload);
    }
  }, [editor, onResourceUpload]);

  // 同步 editable 状态
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readonly);
    }
  }, [editor, readonly]);

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

  // 内嵌布局：浮动/顶部/底部工具栏 + flex 内容区
  const showFloatingToolbar = toolbarPosition === 'floating' && !readonly && isFocused;

  const toolbar = (
    <UnifiedToolbar
      editor={editor}
      visible={true}
      toolbarRight={toolbarRight}
      showMediaButtons={showMediaButtons}
      mediaControls={mediaControls}
      onInteractionStart={cancelHideToolbar}
      className={showFloatingToolbar ? 'absolute left-0 z-10 w-full box-border -top-12 border border-solid rounded-lg' : toolbarPosition === 'top' ? 'rounded-t-lg' : 'rounded-b-lg'}
    />
  );

  return (
    <div className={cn('bg-background flex flex-col relative', className)} style={style}>
      {(showFloatingToolbar || (toolbarPosition === 'top' && !readonly)) && toolbar}
      <div className="flex-1 overflow-y-auto text-foreground">
        {editor && showBubbleMenu && <EditorBubbleMenu editor={editor} />}
        <EditorContent editor={editor} className={editorContentClassName} />
        <div onClick={handleClickBottom} className="h-24"></div>
      </div>
      {toolbarPosition === 'bottom' && !readonly && toolbar}
    </div>
  );
};

export default UnifiedEditor;
