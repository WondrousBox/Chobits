import { TbLoader2, TbMicrophone, TbMicrophoneOff } from 'react-icons/tb';

import { type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import ChatFooterActionButton from './ChatFooterActionButton';

export interface SpeechInputButtonProps {
  disabled?: boolean;
  interimText?: string;
  isBusy?: boolean;
  isListening?: boolean;
  onToggle: () => void | Promise<void>;
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
  onToggle,
  buttonVariant = 'outline',
  listeningVariant = 'destructive',
  buttonSize = 'icon',
  className
}: SpeechInputButtonProps): JSX.Element {
  const tooltipText = interimText ? interimText : isListening ? '点击停止语音输入' : '语音输入';

  return (
    <ChatFooterActionButton
      tooltip={tooltipText}
      ariaLabel={isListening ? '停止语音输入' : '开始语音输入'}
      icon={isBusy ? <TbLoader2 className="animate-spin" /> : isListening ? <TbMicrophoneOff /> : <TbMicrophone />}
      disabled={disabled || isBusy}
      onClick={onToggle}
      buttonVariant={isListening ? listeningVariant : buttonVariant}
      buttonSize={buttonSize}
      className={cn(isListening ? 'rounded-full animate-pulse' : 'rounded-full', className)}
    />
  );
}
