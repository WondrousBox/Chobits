import { useTranslation } from 'react-i18next';
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
  defaultLabel,
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
  const { t } = useTranslation('chat');
  const resolvedDefaultLabel = defaultLabel ?? t('components.codingWorkspace.selectProject');
  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        disabled={disabled}
        className={cn('max-w-44', triggerClassName)}
        onClick={() => void onPick()}
        title={workspaceRoot || t('components.codingWorkspace.pickDirectory')}
      >
        <TbFolderCode className={cn('shrink-0', iconClassName)} />
        <span className="truncate">{workspaceLabel || resolvedDefaultLabel}</span>
      </Button>
      {workspaceRoot && onClear && (
        <Button type="button" variant={clearVariant} size={clearSize} disabled={disabled} className={clearClassName} onClick={onClear} title={t('components.codingWorkspace.clearDirectory')}>
          <TbX className={iconClassName} />
        </Button>
      )}
    </>
  );
}
