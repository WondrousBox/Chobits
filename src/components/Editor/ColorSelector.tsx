import { Editor } from '@tiptap/react';
import clsx from 'clsx';
import { Dispatch, FC, SetStateAction } from 'react';
import { TbCheck, TbChevronDown } from 'react-icons/tb';

export interface BubbleColorMenuItem {
  name: string;
  color: string;
}

interface ColorSelectorProps {
  editor: Editor;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export const ColorSelector: FC<ColorSelectorProps> = ({ editor, isOpen, setIsOpen }) => {
  const items: BubbleColorMenuItem[] = [
    {
      name: '默认',
      color: ''
    },
    {
      name: '紫色',
      color: '#9333EA'
    },
    {
      name: '红色',
      color: '#E00000'
    },
    {
      name: '蓝色',
      color: '#2563EB'
    },
    {
      name: '绿色',
      color: '#008A00'
    },
    {
      name: '橙色',
      color: '#FFA500'
    },
    {
      name: '粉红色',
      color: '#BA4081'
    },
    {
      name: '灰色',
      color: '#A8A29E'
    }
  ];

  const activeItem = items.find(({ color }) => editor.isActive('textStyle', { color }));

  return (
    <div className="relative h-full">
      <button className="flex h-full items-center gap-1 p-2 text-sm font-medium text-foreground hover:bg-accent active:bg-accent/80" onClick={() => setIsOpen(!isOpen)}>
        <span style={{ color: activeItem?.color || '' }}>A</span>

        <TbChevronDown className="h-4 w-4 " />
      </button>

      {isOpen && (
        <section className="fixed top-full z-[99999] mt-1 flex w-48 flex-col overflow-hidden rounded border border-border bg-popover p-1 shadow-xl animate-in fade-in slide-in-from-top-1">
          {items.map(({ name, color }, index) => (
            <button
              key={index}
              onClick={() => {
                editor.chain().focus().setColor(color).run();
                setIsOpen(false);
              }}
              className={clsx('flex items-center justify-between rounded-sm px-2 py-1 text-sm text-foreground hover:bg-accent', {
                'text-primary': editor.isActive('textStyle', { color })
              })}
            >
              <div className="flex items-center space-x-2">
                <div className="rounded-sm border border-border px-1 py-px font-medium" style={{ color }}>
                  A
                </div>
                <span>{name}</span>
              </div>
              {editor.isActive('textStyle', { color }) && <TbCheck className="h-4 w-4" />}
            </button>
          ))}
        </section>
      )}
    </div>
  );
};
