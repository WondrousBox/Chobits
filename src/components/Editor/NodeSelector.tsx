import { Editor } from '@tiptap/react';
import clsx from 'clsx';
import { Dispatch, FC, SetStateAction } from 'react';
import { TbCheck, TbChevronDown, TbCode, TbH1, TbH2, TbH3, TbList, TbListNumbers, TbQuote, TbSquareCheck, TbTextSize } from 'react-icons/tb';

import { BubbleMenuItem } from './Bubble';
import { editorCommandActions } from './commandActions';

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
      action: editorCommandActions.paragraph
    },
    {
      name: '标题1',
      icon: TbH1,
      action: editorCommandActions.heading1
    },
    {
      name: '标题2',
      icon: TbH2,
      action: editorCommandActions.heading2
    },
    {
      name: '标题3',
      icon: TbH3,
      action: editorCommandActions.heading3
    },
    {
      name: '待办',
      icon: TbSquareCheck,
      action: editorCommandActions.taskList
    },
    {
      name: '无序列表',
      icon: TbList,
      action: editorCommandActions.bulletList
    },
    {
      name: '有序列表',
      icon: TbListNumbers,
      action: editorCommandActions.orderedList
    },
    {
      name: '引用',
      icon: TbQuote,
      action: editorCommandActions.blockquote
    },
    {
      name: '代码',
      icon: TbCode,
      action: editorCommandActions.codeBlock
    }
  ].map((item) => ({
    name: item.name,
    icon: item.icon,
    command: () => item.action.run(editor),
    isActive: () => item.action.isActive?.(editor) ?? false
  }));

  const activeItem = items.filter((item) => item.isActive()).pop() ?? {
    name: '多段'
  };

  return (
    <div className="relative h-full">
      <button className="flex h-full items-center gap-1 p-2 text-sm font-medium text-foreground hover:bg-accent active:bg-accent/80" onClick={() => setIsOpen(!isOpen)}>
        <span>{activeItem?.name}</span>

        <TbChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <section className="fixed top-full z-[99999] mt-1 flex w-48 flex-col overflow-hidden rounded border border-border bg-popover p-1 shadow-xl animate-in fade-in slide-in-from-top-1">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.command();
                setIsOpen(false);
              }}
              className={clsx('flex items-center justify-between rounded-sm px-2 py-1 text-sm text-foreground hover:bg-accent', {
                'text-primary': item.isActive()
              })}
            >
              <div className="flex items-center space-x-2">
                <div className="rounded-sm border border-border p-1">
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
