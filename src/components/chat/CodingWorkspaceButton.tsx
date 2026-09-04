import { TbFolderCode, TbX } from 'react-icons/tb';

import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CodingWorkspaceButtonProps {
  workspaceRoot?: string;
  workspaceLabel?: string;
  defaultLabel?: string;
  onPick: () => void | Promise<void>;
  onClear?: () => void;
  triggerVariant?: ButtonProps['variant'];
  triggerSize?: ButtonProps['size'];
  triggerClassName?: string;
  clearVariant?: ButtonProps['variant'];
  clearSize?: ButtonProps['size'];
  clearClassName?: string;
  iconClassName?: string;
  disabled?: boolean;
}

export default function CodingWorkspaceButton({
  workspaceRoot,
  workspaceLabel,
  defaultLabel = '选择项目',
  onPick,
  onClear,
  triggerVariant = 'outline',
  triggerSize = 'sm',
  triggerClassName,
  clearVariant = 'ghost',
  clearSize = 'icon',
  clearClassName,
  iconClassName,
  disabled = false
}: CodingWorkspaceButtonProps): JSX.Element {
  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        disabled={disabled}
        className={cn('max-w-44', triggerClassName)}
        onClick={() => void onPick()}
        title={workspaceRoot || '选择项目目录'}
      >
        <TbFolderCode className={cn('shrink-0', iconClassName)} />
        <span className="truncate">{workspaceLabel || defaultLabel}</span>
      </Button>
      {workspaceRoot && onClear && (
        <Button type="button" variant={clearVariant} size={clearSize} disabled={disabled} className={clearClassName} onClick={onClear} title="清除项目目录">
          <TbX className={iconClassName} />
        </Button>
      )}
    </>
  );
}
