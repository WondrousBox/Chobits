import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import ChatFooterActionButton, { type ChatFooterActionButtonProps } from './ChatFooterActionButton';
import SpeechInputButton, { type SpeechInputButtonProps } from './SpeechInputButton';

export interface ChatFooterActionItem extends ChatFooterActionButtonProps {
  key?: string;
}

export interface ChatFooterActionsProps {
  children?: ReactNode;
  actions?: ChatFooterActionItem[];
  speechInput?: SpeechInputButtonProps;
  className?: string;
  actionButtonClassName?: string;
  speechButtonClassName?: string;
}

export default function ChatFooterActions({ children, actions, speechInput, className, actionButtonClassName, speechButtonClassName }: ChatFooterActionsProps): JSX.Element {
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {children}
      {actions?.map(({ key, className: itemClassName, ...action }, index) => (
        <ChatFooterActionButton key={key || `${action.ariaLabel}-${index}`} className={cn(actionButtonClassName, itemClassName)} {...action} />
      ))}
      {speechInput && <SpeechInputButton {...speechInput} className={cn(speechButtonClassName, speechInput.className)} />}
    </div>
  );
}
