import type { ReactNode } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface ChatFooterActionButtonProps {
  tooltip?: ReactNode;
  ariaLabel: string;
  icon: ReactNode;
  onClick?: () => void | Promise<void>;
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
  disabled = false,
  buttonVariant = 'ghost',
  buttonSize = 'icon',
  className
}: ChatFooterActionButtonProps): JSX.Element {
  const button = (
    <Button
      type="button"
      variant={buttonVariant}
      size={buttonSize}
      disabled={disabled}
      className={className}
      title={typeof tooltip === 'string' ? tooltip : ariaLabel}
      onClick={() => {
        void onClick?.();
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
