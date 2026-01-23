import './index.scss';

import { utils } from '@aim-packages/subtitle';
import {
  // Editor,
  EditorContent,
  EditorEvents,
  useEditor
} from '@tiptap/react';
import { debounce } from 'lodash-es';
import { useCallback, useEffect, useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import { Input } from '../ui/input';
import { EditorBubbleMenu } from './Bubble';
import DEFAULT_EDITOR_CONTENT from './default-content';
import { extensions } from './extensions';
import MenuBar from './MenuBar';
import { TiptapEditorProps as editorProps } from './props';
// import Floating from './Floating'

const saveNote = debounce(
  (value: EditorEvents['update'], title: string, onUpdate?: (e: EditorEvents['update'], title: string) => void) => {
    onUpdate && onUpdate(value, title);
  },
  1000,
  {
    trailing: true
  }
);

interface TiptapProps {
  content?: string;
  title?: string;
  noteId?: string;
  onUpdate?: (e: EditorEvents['update'], title: string) => void;
}

const Tiptap = ({ content, title, noteId, onUpdate }: TiptapProps): JSX.Element => {
  const [currentTitle, setCurrentTitle] = useState(title || '');
  const [hasBlur, setHasBlur] = useState(false);
  const [mini, setMini] = useState(false);
  const editor = useEditor({
    extensions,
    editorProps,
    content: content || DEFAULT_EDITOR_CONTENT,
    onUpdate: (e: EditorEvents['update']) => {
      saveNote(e, currentTitle, onUpdate);
    }
  });

  const handleKeyup = (e: any) => {
    if (e.key === 'Enter') {
      editor?.commands.focus();
    }
  };

  const handleScreenshotsData = useCallback(
    (event: any, msg: { type: 'send:file:completed'; data: string }) => {
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

  const copyPlainText = useCallback(() => { }, [editor]);

  const copyMD = useCallback(() => { }, [editor]);

  const copyHTML = useCallback(() => { }, [editor]);

  const saveMD = useCallback(() => { }, [editor, title]);

  const saveNotion = useCallback(() => { }, [editor]);

  const handleClickBottom = () => {
    const json = editor?.getJSON();
    if (json?.content) {
      const lastBlock = json.content[json.content.length - 1];
      if ((lastBlock.type === 'image' || lastBlock.type === 'codeBlock') && editor) {
        // // 获取当前选区
        // const { from, to } = editor.state.selection
        // // 获取选区的节点
        // const selectedNode = editor.state.doc.nodeAt(from)
        // // 创建要插入的新节点
        // const newNode = editor.schema.nodes.paragraph.create({}, editor.schema.text("要插入的内容"))
        // 在选区的节点后面插入新节点
        // editor.commands.insertContentAt(json.content.length + 1, {
        //   "type": "paragraph",
        // })
        if (lastBlock.type === 'codeBlock') {
          editor.commands.exitCode();
          setTimeout(() => {
            editor.commands.insertContent([
              {
                type: 'paragraph'
              }
            ]);
          }, 0);
        } else {
          editor.commands.insertContent([
            json.content[json.content.length - 1],
            {
              type: 'paragraph'
            }
          ]);
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

  useEffect(() => {
    return () => { };
  }, [copyPlainText, copyMD, copyHTML, saveMD, saveNotion]);

  const handleBlur = () => {
    setHasBlur(true);
  };
  return (
    <div className="Tiptap">
      <ScrollArea style={{ display: mini ? 'none' : 'block' }} className="h-full relative mx-auto min-h-[500px] w-full md:w-[650px] bg-background text-foreground">
        {
          <Input
            className={`p-2 font-extrabold w-full outline-none border-b border-b-border rounded-none border-l-0 border-r-0 border-t-0 text-2xl${hasBlur && !currentTitle ? ' border-b-red-400' : ''}`}
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
            placeholder="输入标题"
            onKeyUp={handleKeyup}
            onBlur={handleBlur}
          />
        }
        {editor && <EditorBubbleMenu editor={editor} />}
        {/*editor && <Floating editor={editor} />*/}
        <div id="editorContainer">
          <EditorContent editor={editor} />
        </div>
        <div onClick={handleClickBottom} className="h-96"></div>
      </ScrollArea>
      {editor && (
        <div className="fixed bottom-0 w-full">
          <MenuBar mini={mini} editor={editor} />
        </div>
      )}
    </div>
  );
};

export default Tiptap;
