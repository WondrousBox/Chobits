import type { TFunction } from 'i18next';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TbClock, TbHistory, TbMessage2Heart, TbRefresh, TbSparkles } from 'react-icons/tb';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatRelativeTime, getHistoryTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { SettingGroup, SettingItem } from '@/pages/SettingsPage/components/SettingComponents';

import type { HistoryStatus, IntentCategory, SpontaneousUtteranceHistoryItem, SpontaneousUtteranceSettingsState, TonePreference } from './useSpontaneousUtteranceSettings';
import { useSpontaneousUtteranceSettings } from './useSpontaneousUtteranceSettings';

const INTENT_OPTIONS: Array<{ value: IntentCategory }> = [
  { value: 'encouragement' },
  { value: 'reminder' },
  { value: 'empathy' },
  { value: 'planning' },
  { value: 'reflection' },
  { value: 'philosophy' },
  { value: 'playful' }
];

const TONE_OPTIONS: Array<{ value: TonePreference }> = [{ value: 'auto' }, { value: 'gentle' }, { value: 'playful' }, { value: 'calm' }, { value: 'firm' }, { value: 'curious' }, { value: 'tender' }];

const STATUS_OPTIONS: Array<{ value: HistoryStatus | 'all' }> = [{ value: 'all' }, { value: 'spoken' }, { value: 'generated' }, { value: 'skipped' }, { value: 'failed' }];

function getStatusBadgeClass(status: HistoryStatus): string {
  switch (status) {
    case 'spoken':
      return 'border-emerald-500/30 text-emerald-600';
    case 'generated':
      return 'border-sky-500/30 text-sky-600';
    case 'skipped':
      return 'border-amber-500/30 text-amber-600';
    case 'failed':
      return 'border-red-500/30 text-red-600';
    default:
      return 'border-border text-muted-foreground';
  }
}

function getStatusLabel(t: TFunction, status: HistoryStatus): string {
  switch (status) {
    case 'spoken':
    case 'generated':
    case 'skipped':
    case 'failed':
      return t(`spontaneous.history.status.${status}`);
    default:
      return status;
  }
}

function getIntentLabel(t: TFunction, intent?: IntentCategory): string {
  if (!intent) return t('spontaneous.history.intentUncategorized');
  return INTENT_OPTIONS.some((item) => item.value === intent) ? t(`spontaneous.intents.options.${intent}.label`) : t('spontaneous.history.intentUncategorized');
}

function getToneLabel(t: TFunction, tone?: string): string {
  if (!tone) return t('spontaneous.tone.options.auto');
  return TONE_OPTIONS.some((item) => item.value === tone) ? t(`spontaneous.tone.options.${tone}`) : tone;
}

function getReasonLabel(t: TFunction, reason?: string): string | undefined {
  switch (reason) {
    case 'generation_in_progress':
    case 'preferences_disabled':
    case 'daily_limit_reached':
    case 'cooldown_active':
    case 'no_provider_context':
    case 'duplicate_text':
    case 'intent_overrepresented':
    case 'parse_failed':
    case 'intent_filtered':
    case 'first_activity_timeout':
    case 'stream_idle_timeout':
    case 'generation_max_timeout':
    case 'generation_failed':
      return t(`spontaneous.history.reasons.${reason}`);
    default:
      return reason;
  }
}

export const SpontaneousUtteranceItem: React.FC<{
  state: SpontaneousUtteranceSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => {
  const { t } = useTranslation('speech');
  return (
    <div onClick={onSelect} className={cn('flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
          state.preferences.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
        )}
      >
        <TbMessage2Heart className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{t('spontaneous.item.title')}</div>
        <div className="line-clamp-1 text-xs text-muted-foreground">{t('spontaneous.item.description')}</div>
      </div>
      <div onClick={(event) => event.stopPropagation()}>
        <Switch checked={state.preferences.enabled} onCheckedChange={(checked) => void state.updatePreferences({ enabled: checked })} disabled={state.isLoading} />
      </div>
    </div>
  );
};

function HistoryCard({ item }: { item: SpontaneousUtteranceHistoryItem }): JSX.Element {
  const { t } = useTranslation('speech');
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('text-[10px]', getStatusBadgeClass(item.status))}>
          {getStatusLabel(t, item.status)}
        </Badge>
        {item.intentCategory && (
          <Badge variant="secondary" className="text-[10px]">
            {getIntentLabel(t, item.intentCategory)}
          </Badge>
        )}
        {item.tone && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {getToneLabel(t, item.tone)}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground" title={getHistoryTime(item.timestamp)}>
          {formatRelativeTime(item.timestamp)}
        </span>
      </div>

      <div className="mt-2 text-sm font-medium text-foreground">{item.text || t('spontaneous.history.card.noText')}</div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {item.executedAction && <span>{t('spontaneous.history.card.action', { action: item.executedAction })}</span>}
        {item.fallbackAction && !item.executedAction && <span>{t('spontaneous.history.card.fallbackAction', { action: item.fallbackAction })}</span>}
        {item.reason && <span>{t('spontaneous.history.card.reason', { reason: getReasonLabel(t, item.reason) })}</span>}
        {item.didUseFallback != null && <span>{item.didUseFallback ? t('spontaneous.history.card.usedFallback') : t('spontaneous.history.card.aiMapped')}</span>}
      </div>

      {item.whyThisFits && <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.whyThisFits}</p>}
    </div>
  );
}

export const SpontaneousUtteranceDetailContent: React.FC<{ state: SpontaneousUtteranceSettingsState }> = ({ state }) => {
  const { t } = useTranslation('speech');
  const { preferences, isLoading, history, isHistoryLoading, query, setQuery, statusFilter, setStatusFilter, intentFilter, setIntentFilter, loadHistory, updatePreferences } = state;

  const latestSpoken = useMemo(() => history.find((item) => item.status === 'spoken'), [history]);
  const allowedSet = useMemo(() => new Set(preferences.allowedIntentCategories), [preferences.allowedIntentCategories]);

  const handleToggleIntent = useCallback(
    (intent: IntentCategory, checked: boolean | 'indeterminate'): void => {
      const nextChecked = checked === true;
      const current = preferences.allowedIntentCategories;

      if (!nextChecked && current.length === 1 && current.includes(intent)) {
        return;
      }

      const next = nextChecked ? Array.from(new Set([...current, intent])) : current.filter((item) => item !== intent);
      void updatePreferences({ allowedIntentCategories: next });
    },
    [preferences.allowedIntentCategories, updatePreferences]
  );

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{t('spontaneous.loading')}</div>;
  }

  return (
    <Tabs defaultValue="settings" className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('spontaneous.header.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('spontaneous.header.description')}</p>
        </div>
        <TabsList>
          <TabsTrigger value="settings">
            <TbSparkles className="h-4 w-4" />
            {t('spontaneous.tabs.settings')}
          </TabsTrigger>
          <TabsTrigger value="history">
            <TbHistory className="h-4 w-4" />
            {t('spontaneous.tabs.history')}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="settings" className="space-y-5">
        <SettingGroup title={t('spontaneous.overview.title')}>
          <SettingItem
            title={t('spontaneous.overview.enabled.title')}
            description={preferences.enabled ? t('spontaneous.overview.enabled.descriptionOn') : t('spontaneous.overview.enabled.descriptionOff')}
            action={<Switch checked={preferences.enabled} onCheckedChange={(checked) => void updatePreferences({ enabled: checked })} />}
          />
          <SettingItem
            title={t('spontaneous.overview.latestSpoken.title')}
            description={
              latestSpoken ? `${formatRelativeTime(latestSpoken.timestamp)} · ${latestSpoken.text || t('spontaneous.overview.latestSpoken.noText')}` : t('spontaneous.overview.latestSpoken.empty')
            }
          />
        </SettingGroup>

        <SettingGroup title={t('spontaneous.frequency.title')}>
          <div className="space-y-4 px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{t('spontaneous.frequency.cooldown.label')}</span>
                <span className="text-muted-foreground">{t('spontaneous.frequency.cooldown.value', { count: preferences.cooldownMinutes })}</span>
              </div>
              <Slider value={[preferences.cooldownMinutes]} min={5} max={120} step={5} onValueChange={([value]) => void updatePreferences({ cooldownMinutes: value })} />
              <p className="text-xs text-muted-foreground">{t('spontaneous.frequency.cooldown.description')}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{t('spontaneous.frequency.dailyLimit.label')}</span>
                <span className="text-muted-foreground">{t('spontaneous.frequency.dailyLimit.value', { count: preferences.dailyLimit })}</span>
              </div>
              <Slider value={[preferences.dailyLimit]} min={1} max={16} step={1} onValueChange={([value]) => void updatePreferences({ dailyLimit: value })} />
              <p className="text-xs text-muted-foreground">{t('spontaneous.frequency.dailyLimit.description')}</p>
            </div>
          </div>
        </SettingGroup>

        <SettingGroup title={t('spontaneous.tone.title')}>
          <div className="space-y-2 px-4 py-3">
            <label className="text-sm font-medium text-foreground">{t('spontaneous.tone.label')}</label>
            <Select value={preferences.preferredTone} onValueChange={(value) => void updatePreferences({ preferredTone: value as TonePreference })}>
              <SelectTrigger>
                <SelectValue placeholder={t('spontaneous.tone.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(`spontaneous.tone.options.${option.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('spontaneous.tone.description')}</p>
          </div>
        </SettingGroup>

        <SettingGroup title={t('spontaneous.intents.title')}>
          <div className="space-y-3 px-4 py-3">
            {INTENT_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-start gap-3">
                <Checkbox checked={allowedSet.has(option.value)} onCheckedChange={(checked) => handleToggleIntent(option.value, checked)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{t(`spontaneous.intents.options.${option.value}.label`)}</div>
                  <div className="text-xs text-muted-foreground">{t(`spontaneous.intents.options.${option.value}.description`)}</div>
                </div>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">{t('spontaneous.intents.hint')}</p>
          </div>
        </SettingGroup>
      </TabsContent>

      <TabsContent value="history" className="space-y-4">
        <SettingGroup title={t('spontaneous.history.query.title')}>
          <div className="space-y-3 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('spontaneous.history.query.placeholder')} className="flex-1" />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as HistoryStatus | 'all')}>
                <SelectTrigger className="md:w-40">
                  <SelectValue placeholder={t('spontaneous.history.query.statusPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`spontaneous.history.status.${option.value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={intentFilter} onValueChange={(value) => setIntentFilter(value as IntentCategory | 'all')}>
                <SelectTrigger className="md:w-40">
                  <SelectValue placeholder={t('spontaneous.history.query.intentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('spontaneous.history.query.allIntents')}</SelectItem>
                  {INTENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`spontaneous.intents.options.${option.value}.label`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadHistory()}>
                <TbRefresh className={cn('h-4 w-4', isHistoryLoading && 'animate-spin')} />
                {t('spontaneous.history.query.refresh')}
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TbClock className="h-3.5 w-3.5" />
              {t('spontaneous.history.count', { count: history.length })}
            </div>
          </div>
        </SettingGroup>

        <SettingGroup title={t('spontaneous.history.records.title')}>
          <ScrollArea className="h-[480px]">
            <div className="space-y-3 p-3">
              {isHistoryLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{t('spontaneous.history.loading')}</div>
              ) : history.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{t('spontaneous.history.empty')}</div>
              ) : (
                history.map((item) => <HistoryCard key={`${item.utteranceId || 'entry'}-${item.timestamp}-${item.status}`} item={item} />)
              )}
            </div>
          </ScrollArea>
        </SettingGroup>
      </TabsContent>
    </Tabs>
  );
};

const SpontaneousUtteranceSettings: React.FC = () => {
  const state = useSpontaneousUtteranceSettings();
  return <SpontaneousUtteranceDetailContent state={state} />;
};

export default SpontaneousUtteranceSettings;
