import { PluginKey } from '@tiptap/pm/state';
import { Editor, Extension, Range, ReactRenderer } from '@tiptap/react';
import Suggestion, { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TbCode, TbFile, TbH1, TbH2, TbH3, TbList, TbListNumbers, TbLoader, TbLollipop, TbMessage2, TbQuote, TbSquareCheck, TbTextSize } from 'react-icons/tb';
import tippy from 'tippy.js';

import { type EditorCommandAction, editorCommandActions } from '../commandActions';
import type { AICompletionHandler } from '../UnifiedEditor/types';
import { getResourceUploadHandler, insertResourceCardFromFile } from './resourceCard';

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: ReactNode;
  searchTerms?: string[];
  /**
   * 是否依赖上传能力（用于在未配置上传时隐藏）
   */
  requiresUpload?: boolean;
  command?: (props: SlashCommandCommandProps) => void;
}

export interface SlashCommandCommandProps {
  editor: Editor;
  range: Range;
}

interface SlashCommandOptions {
  suggestion: Omit<SuggestionOptions, 'editor'>;
}

export interface SlashCommandItemContext {
  editor: Editor;
  onAIComplete?: AICompletionHandler;
  defaultItems: SlashCommandItem[];
}

export type SlashCommandItems = SlashCommandItem[] | ((context: SlashCommandItemContext) => SlashCommandItem[]);

export interface SlashCommandConfig {
  items?: SlashCommandItems;
  pickImage?: () => Promise<File | null> | File | null;
  pickFile?: () => Promise<File | null> | File | null;
  onOpenFeedback?: () => void;
  feedbackUrl?: string;
}

// Storage key for dynamic AI completion handler
const AI_COMPLETE_STORAGE_KEY = 'aiComplete';

const Command = Extension.create<SlashCommandOptions>({
  name: 'slash-command',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: any }) => {
          props.command({ editor, range });
        }
      }
    };
  },
  addStorage() {
    return {
      [AI_COMPLETE_STORAGE_KEY]: undefined as AICompletionHandler | undefined
    };
  },
  addProseMirrorPlugins() {
    const baseSuggestion = {
      editor: this.editor,
      ...this.options.suggestion
    };
    const primaryChar = baseSuggestion.char ?? '/';
    const chars = Array.from(new Set([primaryChar, '、']));
    return chars.map((char) =>
      Suggestion({
        ...baseSuggestion,
        char,
        pluginKey: new PluginKey(`slash-command-${char}`)
      })
    );
  }
});

const createAIItem = (): SlashCommandItem => ({
  title: 'AI续写',
  description: '使用 AI 来扩展你的想法。',
  searchTerms: ['gpt', 'ai', 'complete', 'generate'],
  icon: <TbLollipop />
});

const pickUploadFile = async (config?: SlashCommandConfig): Promise<File | null> => {
  if (config?.pickFile) {
    const result = await config.pickFile();
    return result ?? null;
  }

  if (config?.pickImage) {
    const result = await config.pickImage();
    return result ?? null;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return await new Promise<File | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
};

const runActionWithRange = (editor: Editor, range: Range, action: EditorCommandAction): void => {
  editor.chain().focus().deleteRange(range).run();
  action.run(editor);
};

const createDefaultItems = (config?: SlashCommandConfig, editor?: Editor): SlashCommandItem[] => {
  const feedbackUrl = config?.feedbackUrl ?? '/feedback';
  const openFeedback = () => {
    if (config?.onOpenFeedback) {
      config.onOpenFeedback();
      return;
    }
    if (typeof window !== 'undefined') {
      window.open(feedbackUrl, '_blank');
    }
  };

  const { paragraph, taskList, heading1, heading2, heading3, bulletList, orderedList, blockquote, codeBlock } = editorCommandActions;

  const items: SlashCommandItem[] = [
    {
      title: 'Send Feedback',
      description: 'Let us know how we can improve.',
      icon: <TbMessage2 />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        editor.chain().focus().deleteRange(range).run();
        openFeedback();
      }
    },
    {
      title: '文本',
      description: '使用普通的文本开始输入。',
      searchTerms: ['p', 'paragraph'],
      icon: <TbTextSize />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, paragraph);
      }
    },
    {
      title: '待办列表',
      description: '使用待办列表跟踪任务。',
      searchTerms: ['todo', 'task', 'list', 'check', 'checkbox'],
      icon: <TbSquareCheck />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, taskList);
      }
    },
    {
      title: '标题一',
      description: '大标题',
      searchTerms: ['title', 'big', 'large', 'h1'],
      icon: <TbH1 />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, heading1);
      }
    },
    {
      title: '标题二',
      description: '中等标题',
      searchTerms: ['subtitle', 'medium', 'h2'],
      icon: <TbH2 />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, heading2);
      }
    },
    {
      title: '标题三',
      description: '小标题',
      searchTerms: ['subtitle', 'small', 'h3'],
      icon: <TbH3 />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, heading3);
      }
    },
    {
      title: '无序列表',
      description: '创建带小点的无序列表。',
      searchTerms: ['unordered', 'point', 'bullet'],
      icon: <TbList />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, bulletList);
      }
    },
    {
      title: '有序列表',
      description: '创建带数字的有序列表。',
      searchTerms: ['ordered', 'number'],
      icon: <TbListNumbers />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, orderedList);
      }
    },
    {
      title: '引用',
      description: '创建一个引用段落',
      searchTerms: ['blockquote', 'quote'],
      icon: <TbQuote />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, blockquote);
      }
    },
    {
      title: '代码',
      description: '插入代码片段',
      searchTerms: ['codeblock', 'code'],
      icon: <TbCode />,
      command: ({ editor, range }: SlashCommandCommandProps) => {
        runActionWithRange(editor, range, codeBlock);
      }
    }
  ];

  if (editor && getResourceUploadHandler(editor)) {
    items.push({
      title: '插入文件',
      description: '上传文件并插入资源卡片',
      searchTerms: ['file', 'upload', 'resource', 'image'],
      requiresUpload: true,
      icon: <TbFile />,
      command: async ({ editor, range }: SlashCommandCommandProps) => {
        editor.chain().focus().deleteRange(range).run();
        const file = await pickUploadFile(config);
        if (!file) {
          return;
        }
        await insertResourceCardFromFile(editor, file);
      }
    });
  }

  return items;
};

const getSuggestionItems = ({ query, editor, config }: { query: string; editor: Editor; config?: SlashCommandConfig }): SlashCommandItem[] => {
  // 从 editor.storage 动态获取 onAIComplete
  const onAIComplete = editor.storage['slash-command']?.[AI_COMPLETE_STORAGE_KEY] as AICompletionHandler | undefined;

  const defaultItems = createDefaultItems(config, editor);
  let items: SlashCommandItem[];

  if (config?.items) {
    items = typeof config.items === 'function' ? config.items({ editor, onAIComplete, defaultItems }) : config.items;
  } else if (onAIComplete) {
    items = [createAIItem(), ...defaultItems];
  } else {
    items = defaultItems;
  }

  return items.filter((item) => {
    if (typeof query === 'string' && query.length > 0) {
      const search = query.toLowerCase();
      return item.title.toLowerCase().includes(search) || item.description.toLowerCase().includes(search) || (item.searchTerms && item.searchTerms.some((term: string) => term.includes(search)));
    }
    return true;
  });
};

/* eslint-disable react-refresh/only-export-components */
export const updateScrollView = (container: HTMLElement, item: HTMLElement): void => {
  const containerHeight = container.offsetHeight;
  const itemHeight = item ? item.offsetHeight : 0;

  const top = item.offsetTop;
  const bottom = top + itemHeight;

  if (top < container.scrollTop) {
    container.scrollTop -= container.scrollTop - top + 5;
  } else if (bottom > containerHeight + container.scrollTop) {
    container.scrollTop += bottom - containerHeight - container.scrollTop + 5;
  }
};

interface CommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
  editor: Editor;
  range: Range;
  onAIComplete?: AICompletionHandler;
}

const CommandList = ({ items, command, editor, range, onAIComplete }: CommandListProps): React.JSX.Element | null => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // 清理函数
  useEffect(() => {
    return () => {
      cancelRef.current?.();
    };
  }, []);

  // 当 items 变化时重置选中索引（使用 setTimeout 避免 setState 警告）
  const itemsLength = items.length;
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelectedIndex(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [itemsLength]);

  const handleAIComplete = useCallback((): void => {
    if (!onAIComplete) {
      console.warn('AI续写功能未配置，请传入 onAIComplete 处理函数');
      return;
    }

    const text = editor.getText();
    if (!text.trim()) {
      console.warn('编辑器内容为空，无法进行AI续写');
      return;
    }

    setIsLoading(true);

    // 先删除 slash command
    editor.chain().focus().deleteRange(range).run();

    // 记录插入位置
    const insertPos = range.from;
    let insertedLength = 0;

    const cancel = onAIComplete(
      { text, editor, range },
      {
        onChunk: (chunk: string) => {
          // 在当前位置插入新内容
          editor
            .chain()
            .focus()
            .insertContentAt(insertPos + insertedLength, chunk)
            .run();
          insertedLength += chunk.length;
        },
        onFinish: (completion: string) => {
          setIsLoading(false);
          // 高亮生成的文本
          if (completion.length > 0) {
            editor.commands.setTextSelection({
              from: insertPos,
              to: insertPos + completion.length
            });
          }
        },
        onError: (error: Error) => {
          setIsLoading(false);
          console.error('AI续写出错:', error);
        }
      }
    );

    if (cancel) {
      cancelRef.current = cancel;
    }
  }, [editor, range, onAIComplete]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        if (item.title === 'AI续写') {
          handleAIComplete();
        } else {
          command(item);
        }
      }
    },
    [handleAIComplete, command, items]
  );

  useEffect(() => {
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'Enter'];
    const onKeyDown = (e: KeyboardEvent): boolean | void => {
      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (e.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (e.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [items, selectedIndex, selectItem]);

  const commandListContainer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = commandListContainer?.current;

    const item = container?.children[selectedIndex] as HTMLElement;

    if (item && container) updateScrollView(container, item);
  }, [selectedIndex]);

  return items.length > 0 ? (
    <div
      id="slash-command"
      ref={commandListContainer}
      className="z-50 h-auto max-h-[330px] w-72 overflow-y-auto scroll-smooth rounded-md border border-border bg-popover px-1 py-2 shadow-md transition-all"
    >
      {items.map((item: SlashCommandItem, index: number) => {
        return (
          <button
            className={`flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm text-foreground hover:bg-accent ${index === selectedIndex ? 'bg-accent text-foreground' : ''}`}
            key={index}
            onClick={() => selectItem(index)}
            disabled={isLoading && item.title === 'AI续写'}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">
              {item.title === 'AI续写' && isLoading ? <TbLoader className="animate-spin" /> : item.icon}
            </div>
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  ) : null;
};

/**
 * 创建带有 AI 续写功能的渲染器
 * 从 editor.storage 动态获取 onAIComplete
 */
const createRenderItems = () => {
  return () => {
    let component: ReactRenderer | null = null;
    let popup: any | null = null;

    return {
      onStart: (props: SuggestionProps<SlashCommandItem>) => {
        // 从 editor.storage 动态获取 onAIComplete
        const onAIComplete = props.editor.storage['slash-command']?.[AI_COMPLETE_STORAGE_KEY] as AICompletionHandler | undefined;

        component = new ReactRenderer(CommandList, {
          props: {
            ...props,
            onAIComplete
          },
          editor: props.editor
        });

        // @ts-ignore
        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start'
        });
      },
      onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
        // 从 editor.storage 动态获取 onAIComplete
        const onAIComplete = props.editor.storage['slash-command']?.[AI_COMPLETE_STORAGE_KEY] as AICompletionHandler | undefined;

        component?.updateProps({
          ...props,
          onAIComplete
        });

        popup &&
          popup[0].setProps({
            getReferenceClientRect: props.clientRect
          });
      },
      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === 'Escape') {
          popup?.[0].hide();

          return true;
        }

        // @ts-ignore
        return component?.ref?.onKeyDown(props);
      },
      onExit: () => {
        popup?.[0].destroy();
        component?.destroy();
      }
    };
  };
};

/* eslint-disable react-refresh/only-export-components */
/**
 * 创建 SlashCommand 扩展
 * AI 续写功能通过 editor.storage 动态控制
 * 使用 setAICompleteHandler 来设置/更新 AI 处理函数
 */
export const createSlashCommand = (config?: SlashCommandConfig): typeof Command => {
  return Command.configure({
    suggestion: {
      items: ({ query, editor }: { query: string; editor: Editor }) => getSuggestionItems({ query, editor, config }),
      render: createRenderItems()
    }
  });
};

/**
 * 设置编辑器的 AI 续写处理函数
 * @param editor - 编辑器实例
 * @param handler - AI 续写处理函数，传入 undefined 则禁用 AI 续写
 */
export const setAICompleteHandler = (editor: Editor, handler: AICompletionHandler | undefined): void => {
  if (editor.storage['slash-command']) {
    editor.storage['slash-command'][AI_COMPLETE_STORAGE_KEY] = handler;
  }
};

/**
 * 获取编辑器当前的 AI 续写处理函数
 */
export const getAICompleteHandler = (editor: Editor): AICompletionHandler | undefined => {
  return editor.storage['slash-command']?.[AI_COMPLETE_STORAGE_KEY];
};

// 默认导出
const SlashCommand = createSlashCommand();

export default SlashCommand;
