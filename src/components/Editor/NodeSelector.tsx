import { Editor } from '@tiptap/react';
import clsx from 'clsx';
import { Dispatch, FC, SetStateAction } from 'react';
import { TbCheck, TbChevronDown, TbCode, TbH1, TbH2, TbH3, TbList, TbListNumbers, TbQuote, TbSquareCheck, TbTextSize } from 'react-icons/tb';

import { BubbleMenuItem } from './Bubble';

interface NodeSelectorProps {
  editor: Editor;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export const NodeSelector: FC<NodeSelectorProps> = ({ editor, isOpen, setIsOpen }) => {
  const items: BubbleMenuItem[] = [
    {
      name: 'Text',
      icon: TbTextSize,
      command: () => editor.chain().focus().toggleNode('paragraph', 'paragraph').run(),
      // I feel like there has to be a more efficient way to do this – feel free to PR if you know how!
      isActive: () => editor.isActive('paragraph') && !editor.isActive('bulletList') && !editor.isActive('orderedList')
    },
    {
      name: '标题1',
      icon: TbH1,
      command: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editor.isActive('heading', { level: 1 })
    },
    {
      name: '标题2',
      icon: TbH2,
      command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive('heading', { level: 2 })
    },
    {
      name: '标题3',
      icon: TbH3,
      command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive('heading', { level: 3 })
    },
    {
      name: '待办',
      icon: TbSquareCheck,
      command: () => editor.chain().focus().toggleTaskList().run(),
      isActive: () => editor.isActive('taskItem')
    },
    {
      name: '无序列表',
      icon: TbList,
      command: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive('bulletList')
    },
    {
      name: '有序列表',
      icon: TbListNumbers,
      command: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive('orderedList')
    },
    {
      name: '引用',
      icon: TbQuote,
      command: () => editor.chain().focus().toggleNode('paragraph', 'paragraph').toggleBlockquote().run(),
      isActive: () => editor.isActive('blockquote')
    },
    {
      name: '代码',
      icon: TbCode,
      command: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => editor.isActive('codeBlock')
    }
  ];

  const activeItem = items.filter((item) => item.isActive()).pop() ?? {
    name: '多段'
  };

  return (
    <div className="relative h-full">
      <button className="flex h-full items-center gap-1 p-2 text-sm font-medium text-stone-600 hover:bg-stone-100 active:bg-stone-200" onClick={() => setIsOpen(!isOpen)}>
        <span>{activeItem?.name}</span>

        <TbChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <section className="fixed top-full z-[99999] mt-1 flex w-48 flex-col overflow-hidden rounded border border-stone-200 bg-white p-1 shadow-xl animate-in fade-in slide-in-from-top-1">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.command();
                setIsOpen(false);
              }}
              className={clsx('flex items-center justify-between rounded-sm px-2 py-1 text-sm text-stone-600 hover:bg-stone-100', {
                'text-blue-600': item.isActive()
              })}
            >
              <div className="flex items-center space-x-2">
                <div className="rounded-sm border border-stone-200 p-1">
                  <item.icon className="h-3 w-3" />
                </div>
                <span>{item.name}</span>
              </div>
              {activeItem.name === item.name && <TbCheck className="h-4 w-4" />}
            </button>
          ))}
        </section>
      )}
    </div>
  );
};
