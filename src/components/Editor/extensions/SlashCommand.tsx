import { Editor, Extension, Range } from '@tiptap/react';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TbCode, TbH1, TbH2, TbH3, TbList, TbListNumbers, TbLollipop, TbMessage2, TbPhoto, TbQuote, TbSquareCheck, TbTextSize } from 'react-icons/tb';
// import { useCompletion } from "ai/react";
import tippy from 'tippy.js';

import { handleImageUpload } from '../props';

interface CommandItemProps {
  title: string;
  description: string;
  icon: ReactNode;
}

interface CommandProps {
  editor: Editor;
  range: Range;
}

const Command = Extension.create({
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
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion
      })
    ];
  }
});

const getSuggestionItems = ({ query }: { query: string }) => {
  return [
    {
      title: 'AI续写',
      description: '使用 AI 来扩展你的想法。',
      searchTerms: ['gpt'],
      icon: <TbLollipop className="w-7" />
    },
    {
      title: 'Send Feedback',
      description: 'Let us know how we can improve.',
      icon: <TbMessage2 size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).run();
        window.open('/feedback', '_blank');
      }
    },
    {
      title: '文本',
      description: '使用普通的文本开始输入。',
      searchTerms: ['p', 'paragraph'],
      icon: <TbTextSize size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).toggleNode('paragraph', 'paragraph').run();
      }
    },
    {
      title: '待办列表',
      description: '使用待办列表跟踪任务。',
      searchTerms: ['todo', 'task', 'list', 'check', 'checkbox'],
      icon: <TbSquareCheck size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run();
      }
    },
    {
      title: '标题一',
      description: '大标题',
      searchTerms: ['title', 'big', 'large'],
      icon: <TbH1 size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
      }
    },
    {
      title: '标题二',
      description: '中等标题',
      searchTerms: ['subtitle', 'medium'],
      icon: <TbH2 size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
      }
    },
    {
      title: '标题三',
      description: '小标题',
      searchTerms: ['subtitle', 'small'],
      icon: <TbH3 size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
      }
    },
    {
      title: '无序列表',
      description: '创建带小点的无序列表。',
      searchTerms: ['unordered', 'point'],
      icon: <TbList size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      }
    },
    {
      title: '有序列表',
      description: '创建带数字的有序列表。',
      searchTerms: ['ordered'],
      icon: <TbListNumbers size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      }
    },
    {
      title: '引用',
      description: '创建一个引用段落',
      searchTerms: ['blockquote'],
      icon: <TbQuote size={18} />,
      command: ({ editor, range }: CommandProps) => editor.chain().focus().deleteRange(range).toggleNode('paragraph', 'paragraph').toggleBlockquote().run()
    },
    {
      title: '代码',
      description: '插入代码片段',
      searchTerms: ['codeblock'],
      icon: <TbCode size={18} />,
      command: ({ editor, range }: CommandProps) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
    {
      title: 'Image',
      description: 'Upload an image from your computer.',
      searchTerms: ['photo', 'picture', 'media'],
      icon: <TbPhoto size={18} />,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).run();
        // upload image
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (event) => {
          if (input.files?.length) {
            const file = input.files[0];
            return handleImageUpload(file, editor.view, event);
          }
        };
        input.click();
      }
    }
  ].filter((item) => {
    if (typeof query === 'string' && query.length > 0) {
      const search = query.toLowerCase();
      return item.title.toLowerCase().includes(search) || item.description.toLowerCase().includes(search) || (item.searchTerms && item.searchTerms.some((term: string) => term.includes(search)));
    }
    return true;
  });
};

export const updateScrollView = (container: HTMLElement, item: HTMLElement) => {
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

const CommandList = ({ items, command, editor, range }: { items: CommandItemProps[]; command: any; editor: any; range: any }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const complete = (text: string) => {
    console.log(text);
    console.log(range);
  };
  const isLoading = false;

  // const { complete, isLoading } = useCompletion({
  //   id: "novel",
  //   api: "/api/generate",
  //   onResponse: (response) => {
  //     if (response.status === 429) {
  //       alert("你今天的请求已达到上限。");
  //       return;
  //     }
  //     editor.chain().focus().deleteRange(range).run();
  //   },
  //   onFinish: (_prompt, completion) => {
  //     // highlight the generated text
  //     editor.commands.setTextSelection({
  //       from: range.from,
  //       to: range.from + completion.length,
  //     });
  //   },
  //   onError: () => {
  //     alert("出错了！");
  //   },
  // });

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        if (item.title === 'AI续写') {
          const text = editor.getText();
          complete(text);
        } else {
          command(item);
        }
      }
    },
    [complete, command, editor, items]
  );

  useEffect(() => {
    const navigationKeys = ['ArrowUp', 'ArrowDown', 'Enter'];
    const onKeyDown = (e: KeyboardEvent) => {
      if (navigationKeys.includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') {
          setSelectedIndex((selectedIndex + items.length - 1) % items.length);
          return true;
        }
        if (e.key === 'ArrowDown') {
          setSelectedIndex((selectedIndex + 1) % items.length);
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
  }, [items, selectedIndex, setSelectedIndex, selectItem]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

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
      {items.map((item: CommandItemProps, index: number) => {
        return (
          <button
            className={`flex w-full items-center space-x-2 rounded-md px-2 py-1 text-left text-sm text-foreground hover:bg-accent ${index === selectedIndex ? 'bg-accent text-foreground' : ''}`}
            key={index}
            onClick={() => selectItem(index)}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background">{item.title === 'AI续写' && isLoading ? <div>加载动画</div> : item.icon}</div>
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

const renderItems = () => {
  let component: ReactRenderer | null = null;
  let popup: any | null = null;

  return {
    onStart: (props: { editor: Editor; clientRect: DOMRect }) => {
      component = new ReactRenderer(CommandList, {
        props,
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
    onUpdate: (props: { editor: Editor; clientRect: DOMRect }) => {
      component?.updateProps(props);

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

const SlashCommand = Command.configure({
  suggestion: {
    items: getSuggestionItems,
    render: renderItems
  }
});

export default SlashCommand;
