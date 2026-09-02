import React, { useCallback, useMemo } from 'react';
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

const INTENT_OPTIONS: Array<{ value: IntentCategory; label: string; description: string }> = [
  { value: 'encouragement', label: '鼓励', description: '更偏向打气和继续前进' },
  { value: 'reminder', label: '提醒', description: '轻量提醒任务、节奏和注意点' },
  { value: 'empathy', label: '共情', description: '更关注安抚和陪伴感' },
  { value: 'planning', label: '计划', description: '更偏向下一步和安排建议' },
  { value: 'reflection', label: '反思', description: '更偏向感悟和自我观察' },
  { value: 'philosophy', label: '哲思', description: '更偏向一句短感悟' },
  { value: 'playful', label: '有趣', description: '更偏向轻松玩笑和俏皮表达' }
];

const TONE_OPTIONS: Array<{ value: TonePreference; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'gentle', label: '温柔' },
  { value: 'playful', label: '俏皮' },
  { value: 'calm', label: '沉静' },
  { value: 'firm', label: '笃定' },
  { value: 'curious', label: '好奇' },
  { value: 'tender', label: '体贴' }
];

const STATUS_OPTIONS: Array<{ value: HistoryStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'spoken', label: '已说出' },
  { value: 'generated', label: '仅生成' },
  { value: 'skipped', label: '已跳过' },
  { value: 'failed', label: '执行失败' }
];

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

function getStatusLabel(status: HistoryStatus): string {
  switch (status) {
    case 'spoken':
      return '已说出';
    case 'generated':
      return '仅生成';
    case 'skipped':
      return '已跳过';
    case 'failed':
      return '执行失败';
    default:
      return status;
  }
}

function getIntentLabel(intent?: IntentCategory): string {
  return INTENT_OPTIONS.find((item) => item.value === intent)?.label ?? '未分类';
}

function getToneLabel(tone?: string): string {
  return TONE_OPTIONS.find((item) => item.value === tone)?.label ?? tone ?? '自动';
}

function getReasonLabel(reason?: string): string | undefined {
  switch (reason) {
    case 'generation_in_progress':
      return '已有生成任务进行中';
    case 'preferences_disabled':
      return '主动发言已关闭';
    case 'daily_limit_reached':
      return '已达到今日上限';
    case 'cooldown_active':
      return '仍在冷却时间内';
    case 'no_provider_context':
      return '缺少可用 AI 上下文';
    case 'duplicate_text':
      return '与最近文案重复';
    case 'intent_overrepresented':
      return '最近同类发言过多';
    case 'parse_failed':
      return '模型输出解析失败';
    case 'intent_filtered':
      return '生成类别不在允许范围';
    case 'first_activity_timeout':
      return '等待模型首个响应超时';
    case 'stream_idle_timeout':
      return '模型输出中断超时';
    case 'generation_max_timeout':
      return '生成总时长超时';
    case 'generation_failed':
      return '生成失败';
    default:
      return reason;
  }
}

export const SpontaneousUtteranceItem: React.FC<{
  state: SpontaneousUtteranceSettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div
      className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors', state.preferences.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}
    >
      <TbMessage2Heart className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">主动发言</div>
      <div className="line-clamp-1 text-xs text-muted-foreground">控制主动发言频率、风格偏好，并查看历史记录。</div>
    </div>
    <div onClick={(event) => event.stopPropagation()}>
      <Switch checked={state.preferences.enabled} onCheckedChange={(checked) => void state.updatePreferences({ enabled: checked })} disabled={state.isLoading} />
    </div>
  </div>
);

function HistoryCard({ item }: { item: SpontaneousUtteranceHistoryItem }): JSX.Element {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn('text-[10px]', getStatusBadgeClass(item.status))}>
          {getStatusLabel(item.status)}
        </Badge>
        {item.intentCategory && (
          <Badge variant="secondary" className="text-[10px]">
            {getIntentLabel(item.intentCategory)}
          </Badge>
        )}
        {item.tone && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {getToneLabel(item.tone)}
          </Badge>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground" title={getHistoryTime(item.timestamp)}>
          {formatRelativeTime(item.timestamp)}
        </span>
      </div>

      <div className="mt-2 text-sm font-medium text-foreground">{item.text || '这次没有生成可展示的文案。'}</div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {item.executedAction && <span>动作: {item.executedAction}</span>}
        {item.fallbackAction && !item.executedAction && <span>回退动作: {item.fallbackAction}</span>}
        {item.reason && <span>原因: {getReasonLabel(item.reason)}</span>}
        {item.fallbackUsed != null && <span>{item.fallbackUsed ? '使用了回退动作' : '动作来自 AI/风格映射'}</span>}
      </div>

      {item.whyThisFits && <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.whyThisFits}</p>}
    </div>
  );
}

export const SpontaneousUtteranceDetailContent: React.FC<{ state: SpontaneousUtteranceSettingsState }> = ({ state }) => {
  const { preferences, isLoading, history, historyLoading, query, setQuery, statusFilter, setStatusFilter, intentFilter, setIntentFilter, loadHistory, updatePreferences } = state;

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
    return <div className="p-4 text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <Tabs defaultValue="settings" className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">主动发言</h2>
          <p className="text-sm text-muted-foreground">让精灵根据上下文主动说一句话，并保留可查询历史。</p>
        </div>
        <TabsList>
          <TabsTrigger value="settings">
            <TbSparkles className="h-4 w-4" />
            设置
          </TabsTrigger>
          <TabsTrigger value="history">
            <TbHistory className="h-4 w-4" />
            历史
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="settings" className="space-y-5">
        <SettingGroup title="总览">
          <SettingItem
            title="启用主动发言"
            description={preferences.enabled ? '闲置时，精灵会在符合频率限制时主动生成一句话。' : '关闭后仍保留历史，但不再主动生成。'}
            action={<Switch checked={preferences.enabled} onCheckedChange={(checked) => void updatePreferences({ enabled: checked })} />}
          />
          <SettingItem title="最近一次说出" description={latestSpoken ? `${formatRelativeTime(latestSpoken.timestamp)} · ${latestSpoken.text || '无文案'}` : '还没有可展示的主动发言记录'} />
        </SettingGroup>

        <SettingGroup title="频率控制">
          <div className="space-y-4 px-4 py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">冷却时间</span>
                <span className="text-muted-foreground">{preferences.cooldownMinutes} 分钟</span>
              </div>
              <Slider value={[preferences.cooldownMinutes]} min={5} max={120} step={5} onValueChange={([value]) => void updatePreferences({ cooldownMinutes: value })} />
              <p className="text-xs text-muted-foreground">两次 AI 主动发言之间至少间隔多久。</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">每日上限</span>
                <span className="text-muted-foreground">{preferences.dailyLimit} 次</span>
              </div>
              <Slider value={[preferences.dailyLimit]} min={1} max={16} step={1} onValueChange={([value]) => void updatePreferences({ dailyLimit: value })} />
              <p className="text-xs text-muted-foreground">避免高活跃场景下过于频繁地打扰你。</p>
            </div>
          </div>
        </SettingGroup>

        <SettingGroup title="风格偏好">
          <div className="space-y-2 px-4 py-3">
            <label className="text-sm font-medium text-foreground">偏好语气</label>
            <Select value={preferences.preferredTone} onValueChange={(value) => void updatePreferences({ preferredTone: value as TonePreference })}>
              <SelectTrigger>
                <SelectValue placeholder="选择语气" />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">只作为偏好倾向。上下文更强时，仍会优先贴合当前状态。</p>
          </div>
        </SettingGroup>

        <SettingGroup title="允许类别">
          <div className="space-y-3 px-4 py-3">
            {INTENT_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-start gap-3">
                <Checkbox checked={allowedSet.has(option.value)} onCheckedChange={(checked) => handleToggleIntent(option.value, checked)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">至少保留一个类别，避免精灵失去可生成范围。</p>
          </div>
        </SettingGroup>
      </TabsContent>

      <TabsContent value="history" className="space-y-4">
        <SettingGroup title="查询">
          <div className="space-y-3 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文案、原因、动作..." className="flex-1" />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as HistoryStatus | 'all')}>
                <SelectTrigger className="md:w-40">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={intentFilter} onValueChange={(value) => setIntentFilter(value as IntentCategory | 'all')}>
                <SelectTrigger className="md:w-40">
                  <SelectValue placeholder="类别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类别</SelectItem>
                  {INTENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadHistory()}>
                <TbRefresh className={cn('h-4 w-4', historyLoading && 'animate-spin')} />
                刷新
              </Button>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TbClock className="h-3.5 w-3.5" />
              最近展示 {history.length} 条记录，包含已说出、跳过和失败事件。
            </div>
          </div>
        </SettingGroup>

        <SettingGroup title="记录">
          <ScrollArea className="h-[480px]">
            <div className="space-y-3 p-3">
              {historyLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">加载历史中...</div>
              ) : history.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">当前筛选条件下还没有主动发言记录。</div>
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
