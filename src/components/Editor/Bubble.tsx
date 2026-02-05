import { BubbleMenu, BubbleMenuProps, Editor } from '@tiptap/react';
import clsx from 'clsx';
import { FC, useState } from 'react';
import { TbBold, TbCode, TbItalic, TbStrikethrough, TbUnderline } from 'react-icons/tb';

import { ColorSelector } from './ColorSelector';
import { NodeSelector } from './NodeSelector';

export interface BubbleMenuItem {
  name: string;
  isActive: () => boolean;
  command: () => void;
  icon: typeof TbBold;
}

type EditorBubbleMenuProps = Omit<BubbleMenuProps, 'children'>;

export const EditorBubbleMenu: FC<EditorBubbleMenuProps> = (props) => {
  const [isNodeSelectorOpen, setIsNodeSelectorOpen] = useState(false);
  const [isColorSelectorOpen, setIsColorSelectorOpen] = useState(false);

  const { editor } = props;

  // 如果 editor 为空，不渲染
  if (!editor) {
    return null;
  }

  const items: BubbleMenuItem[] = [
    {
      name: 'bold',
      isActive: () => editor.isActive('bold'),
      command: () => editor.chain().focus().toggleBold().run(),
      icon: TbBold
    },
    {
      name: 'italic',
      isActive: () => editor.isActive('italic'),
      command: () => editor.chain().focus().toggleItalic().run(),
      icon: TbItalic
    },
    {
      name: 'underline',
      isActive: () => editor.isActive('underline'),
      command: () => editor.chain().focus().toggleUnderline().run(),
      icon: TbUnderline
    },
    {
      name: 'strike',
      isActive: () => editor.isActive('strike'),
      command: () => editor.chain().focus().toggleStrike().run(),
      icon: TbStrikethrough
    },
    {
      name: 'code',
      isActive: () => editor.isActive('code'),
      command: () => editor.chain().focus().toggleCode().run(),
      icon: TbCode
    }
  ];

  const bubbleMenuProps: EditorBubbleMenuProps = {
    ...props,
    shouldShow: ({ editor: e }) => {
      // don't show if image is selected
      if (e.isActive('image')) {
        return false;
      }
      return e.view.state.selection.content().size > 0;
    },
    tippyOptions: {
      moveTransition: 'transform 0.15s ease-out',
      onHidden: () => {
        setIsNodeSelectorOpen(false);
        setIsColorSelectorOpen(false);
      }
    }
  };

  return (
    <BubbleMenu {...bubbleMenuProps} className="flex overflow-hidden rounded border border-border bg-popover shadow-xl">
      <NodeSelector
        editor={editor as Editor}
        isOpen={isNodeSelectorOpen}
        setIsOpen={() => {
          setIsNodeSelectorOpen(!isNodeSelectorOpen);
          setIsColorSelectorOpen(false);
        }}
      />

      {items.map((item, index) => (
        <button key={index} onClick={item.command} className="p-2 text-foreground hover:bg-accent active:bg-accent/80">
          <item.icon
            className={clsx('h-4 w-4', {
              'text-primary': item.isActive()
            })}
          />
        </button>
      ))}
      <ColorSelector
        editor={editor as Editor}
        isOpen={isColorSelectorOpen}
        setIsOpen={() => {
          setIsColorSelectorOpen(!isColorSelectorOpen);
          setIsNodeSelectorOpen(false);
        }}
      />
    </BubbleMenu>
  );
};
