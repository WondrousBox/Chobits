import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbLoader, TbRefresh } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { SettingGroup } from './SettingComponents';

type PlatformKey = 'darwin' | 'win32' | 'linux';
type ShortcutsConfig = Record<string, string | string[] | Partial<Record<PlatformKey, string | string[]>>>;
type ShortcutAction = { id: string; label: string; description?: string; type: 'single' | 'multi'; defaults: Partial<Record<PlatformKey, string | string[]>> };

// 主进程 schema 中的 label 为硬编码中文,渲染层按 id 映射到 i18n key
const SHORTCUT_ACTION_LABEL_KEYS: Record<string, string> = {
  toggleChatWindow: 'shortcuts.actions.toggleChatWindow',
  toggleDevtools: 'shortcuts.actions.toggleDevtools',
  toggleMainWindow: 'shortcuts.actions.toggleMainWindow'
};

const ShortcutsSettings: React.FC = () => {
  const { t } = useTranslation('settings');
  const [schema, setSchema] = useState<ShortcutAction[]>([]);
  const [config, setConfig] = useState<ShortcutsConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // 检测当前平台
  const currentPlatform: PlatformKey = ((): PlatformKey => {
    try {
      if (window.chobits?.isMac) return 'darwin';
      if (window.chobits?.isWindows) return 'win32';
      return 'linux';
    } catch {
      return 'darwin';
    }
  })();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [configResult, schemaResult] = await Promise.all([window.chobits.shortcuts['shortcuts:get-config'](), window.chobits.shortcuts['shortcuts:get-schema']()]);
        if (mounted) {
          if (schemaResult?.ok && schemaResult.data) setSchema(schemaResult.data);
          if (configResult?.ok && configResult.data) setConfig(configResult.data);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const listener = (data: ShortcutsConfig): void => setConfig(data);
    const unsubscribeConfigUpdated = window.chobits.shortcuts.onConfigUpdated(listener);
    return () => {
      mounted = false;
      unsubscribeConfigUpdated();
    };
  }, []);

  const setValue = (id: string, platform: PlatformKey, raw: string, isMulti: boolean): void => {
    setConfig((prev) => {
      const next = { ...prev } as any;
      const current = next[id];
      const toArray = (s: string): string[] =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
      if (isMulti) {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          const obj = { ...(current as any) };
          obj[platform] = toArray(raw);
          next[id] = obj;
        } else if (Array.isArray(current)) {
          const obj: any = {};
          obj[platform] = toArray(raw);
          next[id] = obj;
        } else {
          const obj: any = {};
          obj[platform] = toArray(raw);
          next[id] = obj;
        }
      } else {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          const obj = { ...(current as any) };
          obj[platform] = raw.trim();
          next[id] = obj;
        } else if (typeof current === 'string') {
          const obj: any = {};
          obj[platform] = raw.trim();
          next[id] = obj;
        } else {
          const obj: any = {};
          obj[platform] = raw.trim();
          next[id] = obj;
        }
      }
      return next;
    });
  };

  const getDisplayValue = (id: string, platform: PlatformKey, isMulti: boolean): string => {
    const val = (config as any)[id];
    if (val == null) return '';
    if (isMulti) {
      if (Array.isArray(val)) return val.join(', ');
      if (typeof val === 'object') {
        const arr = (val as any)[platform] as any;
        if (Array.isArray(arr)) return arr.join(', ');
        if (typeof arr === 'string') return arr;
      }
      return '';
    } else {
      if (typeof val === 'string') return val;
      if (typeof val === 'object') {
        const s = (val as any)[platform];
        if (typeof s === 'string') return s;
      }
      return '';
    }
  };

  const getActionLabel = (act: ShortcutAction): string => {
    const key = SHORTCUT_ACTION_LABEL_KEYS[act.id];
    return key ? t(key) : act.label;
  };

  const restoreDefaults = async (): Promise<void> => {
    if (!schema.length) return;
    // 从 schema defaults 构建配置
    const next: ShortcutsConfig = {};
    for (const act of schema) next[act.id] = act.defaults as any;
    setConfig(next);
    try {
      const res = await window.chobits.shortcuts['shortcuts:set-config'](next);
      if (res?.ok) toast.success(t('shortcuts.toast.restored'));
      else toast.error(res?.error || t('shortcuts.toast.restoreFailed'));
    } catch {
      toast.error(t('shortcuts.toast.restoreFailed'));
    }
  };

  const persist = async (): Promise<void> => {
    setIsSaving(true);
    try {
      // 预检
      const validationResult = await window.chobits.shortcuts['shortcuts:validate'](config);
      if (!validationResult?.ok || !validationResult.data?.ok) {
        const failures: string[] = [];
        const details = validationResult?.data?.details || {};
        schema.forEach((act) => {
          const arr = details[act.id] || [];
          arr.filter((r) => !r.ok).forEach((r) => failures.push(`${getActionLabel(act)}: ${r.accelerator}`));
        });
        const msg = failures.length ? t('shortcuts.toast.invalidList', { failures: failures.slice(0, 6).join('\n') + (failures.length > 6 ? '\n…' : '') }) : t('shortcuts.toast.invalid');
        toast.error(msg);
        return;
      }
      const res = await window.chobits.shortcuts['shortcuts:set-config'](config);
      if (res?.ok) toast.success(t('shortcuts.toast.saved'));
      else toast.error(res?.error || t('shortcuts.toast.saveFailed'));
    } catch (e: any) {
      toast.error(e?.message || t('shortcuts.toast.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center text-muted-foreground">
        <TbLoader className="h-4 w-4 mr-2 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <SettingGroup title={t('shortcuts.groupTitle')}>
        <div className="divide-y divide-border">
          {schema.map((act) => (
            <div key={act.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">{getActionLabel(act)}</div>
                  {act.description && <div className="text-xs text-muted-foreground mt-0.5">{act.description}</div>}
                  {act.type === 'multi' && <div className="text-xs text-muted-foreground mt-0.5">{t('shortcuts.multiHint')}</div>}
                </div>
                <Input
                  className="w-[240px] h-8 text-sm"
                  placeholder={act.type === 'multi' ? 'F12, Cmd+Shift+I' : 'Cmd+K'}
                  value={getDisplayValue(act.id, currentPlatform, act.type === 'multi')}
                  onChange={(e) => setValue(act.id, currentPlatform, e.target.value, act.type === 'multi')}
                />
              </div>
            </div>
          ))}
        </div>
      </SettingGroup>

      <div className="flex justify-end gap-2 px-2">
        <Button size="sm" variant="outline" onClick={restoreDefaults} disabled={isSaving}>
          <TbRefresh />
          {t('shortcuts.restoreDefaults')}
        </Button>
        <Button size="sm" onClick={persist} disabled={isSaving}>
          {isSaving ? <TbLoader className="animate-spin" /> : null}
          {isSaving ? t('shortcuts.saving') : t('shortcuts.save')}
        </Button>
      </div>
    </div>
  );
};

export default ShortcutsSettings;
