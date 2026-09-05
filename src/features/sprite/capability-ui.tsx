import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { useTranslation } from 'react-i18next';
import { TbLock } from 'react-icons/tb';

import { getSpriteCapabilityLockedReason } from '@/features/sprite/capability-guard';
import { cn } from '@/lib/utils';

export const SpriteCapabilityLockedNotice: React.FC<{
  capability?: SpriteCapabilityState | null;
  hint?: string;
  className?: string;
}> = ({ capability, hint, className }) => {
  const { t } = useTranslation('speech');
  if (!capability || capability.status !== 'locked') return null;

  const capabilityName = t(`capability.${capability.id}`, { defaultValue: capability.name });
  const resolvedHint = hint ?? t('capability.unavailableHint');

  return (
    <div className={cn('rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-amber-100', className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
          <TbLock className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium text-amber-200">{t('capability.locked', { name: capabilityName })}</div>
          <div className="text-xs text-amber-100/90">{getSpriteCapabilityLockedReason(capability, t)}</div>
          <div className="text-xs text-amber-100/70">{resolvedHint}</div>
        </div>
      </div>
    </div>
  );
};
