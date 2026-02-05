import type { Editor } from '@tiptap/react';

export type EditorCommandAction = {
  run: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
  canRun?: (editor: Editor) => boolean;
};

export const editorCommandActions: Record<string, EditorCommandAction> = {
  undo: {
    run: (editor) => {
      editor.chain().focus().undo().run();
    },
    canRun: (editor) => editor.can().undo()
  },
  redo: {
    run: (editor) => {
      editor.chain().focus().redo().run();
    },
    canRun: (editor) => editor.can().redo()
  },
  bold: {
    run: (editor) => {
      editor.chain().focus().toggleBold().run();
    },
    isActive: (editor) => editor.isActive('bold')
  },
  italic: {
    run: (editor) => {
      editor.chain().focus().toggleItalic().run();
    },
    isActive: (editor) => editor.isActive('italic')
  },
  underline: {
    run: (editor) => {
      editor.chain().focus().toggleUnderline().run();
    },
    isActive: (editor) => editor.isActive('underline')
  },
  strike: {
    run: (editor) => {
      editor.chain().focus().toggleStrike().run();
    },
    isActive: (editor) => editor.isActive('strike')
  },
  code: {
    run: (editor) => {
      editor.chain().focus().toggleCode().run();
    },
    isActive: (editor) => editor.isActive('code')
  },
  paragraph: {
    run: (editor) => {
      editor.chain().focus().toggleNode('paragraph', 'paragraph').run();
    },
    isActive: (editor) => editor.isActive('paragraph') && !editor.isActive('bulletList') && !editor.isActive('orderedList')
  },
  heading1: {
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
    isActive: (editor) => editor.isActive('heading', { level: 1 })
  },
  heading2: {
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
    isActive: (editor) => editor.isActive('heading', { level: 2 })
  },
  heading3: {
    run: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
    isActive: (editor) => editor.isActive('heading', { level: 3 })
  },
  taskList: {
    run: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
    isActive: (editor) => editor.isActive('taskItem')
  },
  bulletList: {
    run: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
    isActive: (editor) => editor.isActive('bulletList')
  },
  orderedList: {
    run: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
    isActive: (editor) => editor.isActive('orderedList')
  },
  blockquote: {
    run: (editor) => {
      editor.chain().focus().toggleNode('paragraph', 'paragraph').toggleBlockquote().run();
    },
    isActive: (editor) => editor.isActive('blockquote')
  },
  codeBlock: {
    run: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    },
    isActive: (editor) => editor.isActive('codeBlock')
  }
};
