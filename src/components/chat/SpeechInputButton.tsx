import { type PointerEvent, useRef, useState } from 'react';
import { TbLoader2, TbMicrophone, TbMicrophoneOff, TbX } from 'react-icons/tb';

import { type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import ChatFooterActionButton from './ChatFooterActionButton';

export interface SpeechInputButtonProps {
  disabled?: boolean;
  interimText?: string;
  isBusy?: boolean;
  isListening?: boolean;
  onPressStart: () => void | Promise<void>;
  // 松开且不在取消按钮上：正常结束（自动发送）
  onPressEnd: () => void | Promise<void>;
  // 松开时位于取消按钮上：取消发送
  onCancel: () => void | Promise<void>;
  buttonVariant?: ButtonProps['variant'];
  listeningVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
  className?: string;
}

export default function SpeechInputButton({
  disabled = false,
  interimText = '',
  isBusy = false,
  isListening = false,
  onPressStart,
  onPressEnd,
  onCancel,
  buttonVariant = 'outline',
  listeningVariant = 'destructive',
  buttonSize = 'icon',
  className
}: SpeechInputButtonProps): JSX.Element {
  const cancelRef = useRef<HTMLDivElement | null>(null);
  const [isCancelHover, setIsCancelHover] = useState(false);

  const isOverCancel = (clientX: number, clientY: number): boolean => {
    const rect = cancelRef.current?.getBoundingClientRect();
    return Boolean(rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom);
  };

  const handlePressMove = (event: PointerEvent<HTMLButtonElement>): void => {
    if (!isListening) {
      return;
    }

    setIsCancelHover(isOverCancel(event.clientX, event.clientY));
  };

  const handlePressEnd = (event: PointerEvent<HTMLButtonElement>): void => {
    const shouldCancel = isListening && isOverCancel(event.clientX, event.clientY);
    setIsCancelHover(false);

    if (shouldCancel) {
      void onCancel();
      return;
    }

    void onPressEnd();
  };

  const tooltipText = isCancelHover ? '松开取消' : interimText ? interimText : isListening ? '松开自动发送，左滑取消' : '按住说话';

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {isListening && (
        <div
          ref={cancelRef}
          aria-hidden
          className={cn(
            'pointer-events-none flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-yellow-950 shadow transition-transform',
            isCancelHover && 'scale-125 bg-yellow-500'
          )}
        >
          <TbX className="h-4 w-4" />
        </div>
      )}
      <ChatFooterActionButton
        tooltip={tooltipText}
        ariaLabel={isListening ? '松开结束语音输入' : '按住开始语音输入'}
        icon={isBusy ? <TbLoader2 className="animate-spin" /> : isListening ? <TbMicrophoneOff /> : <TbMicrophone />}
        disabled={disabled}
        onPressStart={() => void onPressStart()}
        onPressMove={handlePressMove}
        onPressEnd={handlePressEnd}
        buttonVariant={isListening ? listeningVariant : buttonVariant}
        buttonSize={buttonSize}
        className={cn(isListening ? 'rounded-full animate-pulse' : 'rounded-full', className)}
      />
    </span>
  );
}
