import Placeholder from '@tiptap/extension-placeholder';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import clsx from 'clsx';
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Redo, Strikethrough, Undo } from 'lucide-react';
import { ReactNode, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  toolbarRight?: ReactNode;
  editable?: boolean;
}

const Toolbar = ({ editor, visible, toolbarRight, className }: { editor: Editor | null; visible: boolean; toolbarRight?: ReactNode; className?: string }): JSX.Element | null => {
  if (!editor || !visible) {
    return null;
  }

  return (
    <div className={clsx(['border-b p-1 flex flex-wrap gap-1 items-center justify-between bg-muted/30 transition-opacity'], className)}>
      <div className="flex flex-wrap gap-1 items-center">
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo" className="w-8 h-8">
          <Undo />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo" className="w-8 h-8">
          <Redo />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBold().run()} className={cn('w-8 h-8', editor.isActive('bold') && 'bg-muted')} title="Bold">
          <Bold />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleItalic().run()} className={cn('w-8 h-8', editor.isActive('italic') && 'bg-muted')} title="Italic">
          <Italic />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleStrike().run()} className={cn('w-8 h-8', editor.isActive('strike') && 'bg-muted')} title="Strike">
          <Strikethrough />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={cn('w-8 h-8', editor.isActive('heading', { level: 1 }) && 'bg-muted')}
          title="Heading 1"
        >
          <Heading1 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={cn('w-8 h-8', editor.isActive('heading', { level: 2 }) && 'bg-muted')}
          title="Heading 2"
        >
          <Heading2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={cn('w-8 h-8', editor.isActive('heading', { level: 3 }) && 'bg-muted')}
          title="Heading 3"
        >
          <Heading3 />
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn('w-8 h-8', editor.isActive('bulletList') && 'bg-muted')} title="Bullet List">
          <List />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={cn('w-8 h-8', editor.isActive('orderedList') && 'bg-muted')}
          title="Ordered List"
        >
          <ListOrdered />
        </Button>

        {/* <Separator orientation="vertical" className="h-6 mx-1" />
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cn('w-8 h-8', editor.isActive('blockquote') && 'bg-muted')} title="Blockquote">
          <Quote />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={cn('w-8 h-8', editor.isActive('codeBlock') && 'bg-muted')} title="Code Block">
          <Code />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().setHorizontalRule().run()} className="w-8 h-8" title="Horizontal Rule">
          <Minus />
        </Button> */}
      </div>
      {toolbarRight && <div className="flex items-center gap-2 ml-auto">{toolbarRight}</div>}
    </div>
  );
};

export const RichTextEditor = ({ value, onChange, placeholder, className, toolbarRight, editable = true }: RichTextEditorProps): JSX.Element => {
  const [isFocused, setIsFocused] = useState(false);
  const hideToolbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHideToolbar = (): void => {
    if (hideToolbarTimeoutRef.current) {
      clearTimeout(hideToolbarTimeoutRef.current);
      hideToolbarTimeoutRef.current = null;
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Write something...'
      })
    ],
    content: value,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onFocus: () => {
      if (!editable) return;
      cancelHideToolbar();
      setIsFocused(true);
    },
    onBlur: () => {
      if (!editable) return;
      hideToolbarTimeoutRef.current = setTimeout(() => {
        setIsFocused(false);
        hideToolbarTimeoutRef.current = null;
      }, 200);
    },
    editorProps: {
      attributes: {
        // Add a root class `tiptap` so placeholder CSS can target it.
        class: 'tiptap prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px] p-4'
      }
    }
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Update editor content if value changes externally
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      // Only update if the content is different to avoid cursor jumping
      // This is a simple check, for more complex cases might need better diffing
      if (editor.getText() === '' && value === '') return;
      // editor.commands.setContent(value);
      // Note: setContent can reset cursor position.
      // Usually controlled inputs with Tiptap are tricky.
      // If the parent controls the state, we might need to be careful.
      // For now, we'll assume the parent updates `value` based on `onChange`
      // and we don't want to re-set it on every keystroke loop.
      // But if the parent changes it (e.g. loading data), we need to update.

      // A common pattern is to only set content if it's drastically different or on mount.
      // But here we'll just check if it matches roughly.
    }
  }, [value, editor]);

  // Actually, for a controlled component, we should update if the prop changes.
  // But Tiptap is imperative.
  // Let's stick to: Initial content is set. Updates push out.
  // If we need to reset, we might need a key or a specific method.
  // For this implementation, I'll assume `value` is the initial value or the source of truth.
  // If we want true two-way binding without cursor jumps, we need to compare content.

  useEffect(() => {
    if (editor && value && editor.getHTML() !== value) {
      // Check if the content is actually different (ignoring empty p tags if needed, etc)
      // For now, let's just set it if it's completely different (like loading a new doc)
      // or if the editor is empty.
      if (editor.isEmpty && value) {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor]);

  useEffect(() => {
    return () => {
      cancelHideToolbar();
    };
  }, []);

  return (
    <div className={cn('border rounded-md bg-background flex flex-col relative', className)}>
      <Toolbar editor={editor} visible={editable && isFocused} toolbarRight={toolbarRight} className="absolute left-0 z-10 w-full box-border -top-8" />
      <div className="flex-1 overflow-y-auto text-foreground">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
