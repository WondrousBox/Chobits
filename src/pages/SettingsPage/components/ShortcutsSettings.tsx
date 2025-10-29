import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type PlatformKey = 'darwin' | 'win32' | 'linux';
type ShortcutsConfig = Record<string, string | string[] | Partial<Record<PlatformKey, string | string[]>>>;
type ShortcutAction = { id: string; label: string; description?: string; type: 'single' | 'multi'; defaults: Partial<Record<PlatformKey, string | string[]>> };

const platforms: { key: PlatformKey; label: string }[] = [
  { key: 'darwin', label: 'macOS' },
  { key: 'win32', label: 'Windows' },
  { key: 'linux', label: 'Linux' }
];

const ShortcutsSettings: React.FC = () => {
  const [schema, setSchema] = useState<ShortcutAction[]>([]);
  const [cfg, setCfg] = useState<ShortcutsConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Detect current platform
  const currentPlatform: PlatformKey = ((): PlatformKey => {
    try {
      if (window.YUA?.isMac) return 'darwin';
      if (window.YUA?.isWindows) return 'win32';
      return 'linux';
    } catch {
      return 'darwin';
    }
  })();
  const currentPlatformLabel = platforms.find((p) => p.key === currentPlatform)?.label || '当前系统';

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [resCfg, resSchema] = await Promise.all([window.YUA.shortcuts['shortcuts:getConfig'](), window.YUA.shortcuts['shortcuts:getSchema']()]);
        if (mounted) {
          if (resSchema?.ok && resSchema.data) setSchema(resSchema.data);
          if (resCfg?.ok && resCfg.data) setCfg(resCfg.data);
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const listener = (_: any, data: ShortcutsConfig): void => setCfg(data);
    window.ipcRenderer?.on('shortcuts-config-updated', listener);
    return () => {
      mounted = false;
      window.ipcRenderer?.off('shortcuts-config-updated', listener as any);
    };
  }, []);

  const setValue = (id: string, platform: PlatformKey, raw: string, isMulti: boolean): void => {
    setCfg((prev) => {
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
    const val = (cfg as any)[id];
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

  const restoreDefaults = async (): Promise<void> => {
    if (!schema.length) return;
    // Build a config from schema defaults
    const next: ShortcutsConfig = {};
    for (const act of schema) next[act.id] = act.defaults as any;
    setCfg(next);
    try {
      const res = await window.YUA.shortcuts['shortcuts:setConfig'](next);
      if (res?.ok) toast.success('已恢复默认快捷键');
      else toast.error(res?.error || '恢复默认失败');
    } catch {
      toast.error('恢复默认失败');
    }
  };

  const persist = async (): Promise<void> => {
    setSaving(true);
    try {
      // Precheck
      const vr = await window.YUA.shortcuts['shortcuts:validate'](cfg);
      if (!vr?.ok || !vr.data?.ok) {
        const failures: string[] = [];
        const details = vr?.data?.details || {};
        schema.forEach((act) => {
          const arr = details[act.id] || [];
          arr.filter((r) => !r.ok).forEach((r) => failures.push(`${act.label}: ${r.accel}`));
        });
        const msg = failures.length ? `以下快捷键不可用：\n${failures.slice(0, 6).join('\n')}${failures.length > 6 ? '\n…' : ''}` : '存在不可用的快捷键，请修改后重试。';
        toast.error(msg);
        return;
      }
      const res = await window.YUA.shortcuts['shortcuts:setConfig'](cfg);
      if (res?.ok) toast.success('快捷键已保存');
      else toast.error(res?.error || '保存失败');
    } catch (e: any) {
      toast.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6 p-2">
      <div className="bg-card border border-border rounded-lg p-4 space-y-6">
        {schema.map((act) => (
          <div key={act.id} className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              {act.label}
              {act.type === 'multi' ? '（逗号分隔）' : ''}
            </div>
            {act.description && <div className="text-xs text-muted-foreground">{act.description}</div>}
            <div className="space-y-1">
              <Input
                placeholder={act.type === 'multi' ? '例如：F12, CommandOrControl+Shift+I' : '例如：CommandOrControl+K'}
                value={getDisplayValue(act.id, currentPlatform, act.type === 'multi')}
                onChange={(e) => setValue(act.id, currentPlatform, e.target.value, act.type === 'multi')}
              />
            </div>
          </div>
        ))}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={restoreDefaults} disabled={saving}>
            恢复默认
          </Button>
          <Button onClick={persist} disabled={saving}>
            {saving ? '保存中...' : '保存设置（预检）'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsSettings;
