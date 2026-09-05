import { useTranslation } from 'react-i18next';
import { TbWorldSearch } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface WebSearchToggleProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function WebSearchToggle({ isEnabled, onToggle }: WebSearchToggleProps): JSX.Element {
  const { t } = useTranslation('chat');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8 rounded-full', isEnabled && 'bg-primary/10 text-primary')}
          onClick={(e) => {
            e.preventDefault();
            onToggle(!isEnabled);
          }}
          aria-label={isEnabled ? t('components.webSearch.disable') : t('components.webSearch.enable')}
        >
          <TbWorldSearch />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isEnabled ? t('components.webSearch.disable') : t('components.webSearch.enableTooltip')}</TooltipContent>
    </Tooltip>
  );
}
