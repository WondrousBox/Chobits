import type { PointerEvent, ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface ChatFooterActionButtonProps {
  tooltip?: ReactNode;
  ariaLabel: string;
  icon: ReactNode;
  onClick?: () => void | Promise<void>;
  // 长按交互：按下/移动/松开（设置后 onClick 不再生效）
  onPressStart?: (event: PointerEvent<HTMLButtonElement>) => void | Promise<void>;
  onPressMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPressEnd?: (event: PointerEvent<HTMLButtonElement>) => void | Promise<void>;
  disabled?: boolean;
  buttonVariant?: ButtonProps['variant'];
  buttonSize?: ButtonProps['size'];
  className?: string;
}

export default function ChatFooterActionButton({
  tooltip,
  ariaLabel,
  icon,
  onClick,
  onPressStart,
  onPressMove,
  onPressEnd,
  disabled = false,
  buttonVariant = 'ghost',
  buttonSize = 'icon',
  className
}: ChatFooterActionButtonProps): JSX.Element {
  const isPressAndHold = Boolean(onPressStart || onPressEnd);
  const button = (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      disabled={disabled}
      className={className}
      title={typeof tooltip === 'string' ? tooltip : ariaLabel}
      onClick={() => {
        if (isPressAndHold) return;
        void onClick?.();
      }}
      onPointerDown={(event) => {
        if (!isPressAndHold || disabled) return;
        // 捕获指针，保证移动/松开时即使光标移出按钮也能收到事件
        event.currentTarget.setPointerCapture(event.pointerId);
        void onPressStart?.(event);
      }}
      onPointerMove={(event) => {
        if (!isPressAndHold) return;
        onPressMove?.(event);
      }}
      onPointerUp={(event) => {
        if (!isPressAndHold) return;
        void onPressEnd?.(event);
      }}
      onPointerCancel={(event) => {
        if (!isPressAndHold) return;
        void onPressEnd?.(event);
      }}
      aria-label={ariaLabel}
    >
      {icon}
    </Button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
