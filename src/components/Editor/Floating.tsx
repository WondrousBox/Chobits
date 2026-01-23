import { Editor } from '@tiptap/react';
import { FloatingMenu } from '@tiptap/react';
import { TbH1, TbH2, TbListNumbers } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

interface BubbleProps {
  editor: Editor;
}

function Floating({ editor }: BubbleProps): JSX.Element | null {
  if (!editor) {
    return null;
  }

  return editor ? (
    <FloatingMenu className="ml-28 rounded-md bg-primary text-primary-foreground" tippyOptions={{ duration: 100 }} editor={editor}>
      <Button size={'icon'} variant={editor.isActive('heading', { level: 1 }) ? 'default' : 'ghost'} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <TbH1 />
      </Button>
      <Button size={'icon'} variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'ghost'} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <TbH2 />
      </Button>
      <Button size={'icon'} onClick={() => editor.chain().focus().toggleBulletList().run()} variant={editor.isActive('bulletList') ? 'default' : 'ghost'}>
        <TbListNumbers />
      </Button>
    </FloatingMenu>
  ) : null;
}

export default Floating;
