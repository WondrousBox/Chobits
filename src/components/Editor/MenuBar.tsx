import { Editor } from '@tiptap/react';
import { useCallback, useEffect, useState } from 'react';
import {
  // TbArrowLeft, TbArrowRight, TbCirclePlus, TbCodeDots, TbLineDashed, TbTextSize, TbX,
  // TbQuote, TbSpacingVertical, TbH1, TbH2, TbH3, TbH4, TbH5, TbH6, TbClearAll, TbCode, TbList, TbListNumbers,
  TbCamera,
  // TbClock,
  // TbClock2,
  TbFlag3,
  TbPlayerPauseFilled,
  TbPlayerPlayFilled,
  TbPlayerTrackNextFilled,
  TbPlayerTrackPrevFilled
  // TbMicrophone, TbMovie, TbPhoto, TbPlus,
  // TbVideo
} from 'react-icons/tb';

import { Button } from '@/components/ui/button';
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuLabel,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu"

interface MenuBarProps {
  editor: Editor;
  mini?: boolean;
}

function MenuBar({ editor, mini }: MenuBarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [recorderUUID, setRecorderUUID] = useState<any>('');

  return editor ? (
    <div className={`flex items-center w-full p-1${mini ? ' justify-center' : ' justify-between'}`}>
      {/* <Button
        size={'icon'}
        variant={'outline'}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={
          !editor.can()
            .chain()
            .focus()
            .undo()
            .run()
        }
      >
        <TbArrowLeft />
      </Button>
      <Button
        size={'icon'}
        variant={'outline'}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={
          !editor.can()
            .chain()
            .focus()
            .redo()
            .run()
        }
      >
        <TbArrowRight />
      </Button> */}

      {!mini && !recorderUUID && (
        <div className="flex items-center gap-1">
          {/* <Button
          size={'icon'}
          variant={'outline'}
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={
            !editor.can()
              .chain()
              .focus()
              .toggleCode()
              .run()
          }
          className={editor.isActive('code') ? 'font-bold' : ''}
        >
          <TbCode />
        </Button> */}
          {/* <Button
          size={'icon'}
          variant={'outline'}
          onClick={() => editor.chain().focus().unsetAllMarks().run() && editor.chain().focus().clearNodes().run()}
        >
          <TbClearAll />
        </Button> */}
          <Button size={'icon'} variant={'outline'} onClick={() => window.AIM.player.screenshot()}>
            <TbCamera />
          </Button>
          <Button size={'icon'} variant={'outline'} onClick={() => window.AIM.player.getCurrentTime()}>
            <TbFlag3 />
          </Button>
          {/* <Button
          size={'icon'}
          variant={'outline'}
          onClick={() => editor.commands.setCountdown({})}
        >
          <TbClock />
        </Button> */}
          {/* <Button
          size={'icon'}
          variant={'outline'}
          onClick={() => editor.commands.setStatus({})}
        >
          <TbClock2 />
        </Button> */}
        </div>
      )}
      {
        <div>
          <Button
            size={'icon'}
            variant={'ghost'}
            onClick={() => {
              window.AIM.player.seekBackward(15);
            }}
          >
            <TbPlayerTrackPrevFilled />
          </Button>
          {!isPlaying && (
            <Button
              size={'icon'}
              variant={'ghost'}
              onClick={() => {
                setIsPlaying(true);
                window.AIM.player.play();
              }}
            >
              <TbPlayerPlayFilled />
            </Button>
          )}
          {isPlaying && (
            <Button
              size={'icon'}
              variant={'ghost'}
              onClick={() => {
                setIsPlaying(false);
                window.AIM.player.pause();
              }}
            >
              <TbPlayerPauseFilled />
            </Button>
          )}
          <Button
            size={'icon'}
            variant={'ghost'}
            onClick={() => {
              window.AIM.player.seekForward(15);
            }}
          >
            <TbPlayerTrackNextFilled />
          </Button>
        </div>
      }
      {/* 
      <Button
        size={'icon'}
        variant={'outline'}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'font-bold' : ''}
      >
        <TbCodeDots />
      </Button>
      <Button
        size={'icon'}
        variant={'outline'}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <TbLineDashed />
      </Button>
      <Button
        size={'icon'}
        variant={'outline'}
        onClick={() => editor.chain().focus().setHardBreak().run()}
      >
        <TbSpacingVertical />
      </Button>
      */}
      {/* <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size={'icon'} variant={'ghost'}><TbPlus /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>图片</DropdownMenuLabel>
          <DropdownMenuItem><TbPhoto className='mr-1' />本地图片</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>音频</DropdownMenuLabel>
          <DropdownMenuItem><TbMicrophone />录音🚧</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>视频</DropdownMenuLabel>
          <DropdownMenuItem><TbMovie />播放器🚧</DropdownMenuItem>
          <DropdownMenuItem><TbVideo />录屏🚧</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu> */}
    </div>
  ) : null;
}

export default MenuBar;
