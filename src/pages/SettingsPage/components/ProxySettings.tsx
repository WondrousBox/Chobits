import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbCheck, TbLoader, TbNetwork, TbPlus, TbRefresh, TbTestPipe, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { SettingGroup, SettingItem } from './SettingComponents';

type ProxyType = 'none' | 'system' | 'custom';
type ProxyAgentType = 'http' | 'socks5';

interface CustomProxy {
  type: ProxyAgentType;
  hostname: string;
  port: number;
  isActive: boolean;
}

interface ProxyConfig {
  type: ProxyType;
  proxies?: CustomProxy[];
}

const ProxySettings: React.FC = () => {
  const { t } = useTranslation('settings');
  const [config, setConfig] = useState<ProxyConfig>({ type: 'none' });
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [systemProxyInfo, setSystemProxyInfo] = useState<{ host: string; port: string } | null>(null);
  const debounceTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const [localProxies, setLocalProxies] = useState<CustomProxy[]>([]);

  const loadConfig = async (): Promise<void> => {
    try {
      const result = await window.chobits.proxy['proxy:get-config']();
      if (result) {
        setConfig(result);
      }
    } catch (error) {
      console.error('Failed to load proxy config:', error);
      toast.error(t('proxy.toast.loadFailed.title'), { description: t('proxy.toast.loadFailed.description') });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时异步加载代理配置,setState 均在 await 之后
    loadConfig();
  }, []);

  useEffect(() => {
    if (config.proxies) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 配置加载后同步到本地编辑态,有意为之
      setLocalProxies(config.proxies);
    }
  }, [config.proxies]);

  const handleTypeChange = async (type: ProxyType): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await window.chobits.proxy['proxy:set-config']({ config: { type } });
      if (result?.ok && result.config) {
        setConfig(result.config);
        toast.success(t('proxy.toast.setSuccess.title'), { description: t('proxy.toast.setSuccess.description') });
        if (type === 'system') {
          await loadSystemProxy();
        }
      } else {
        throw new Error(result?.error || t('proxy.toast.setFailed.title'));
      }
    } catch (error: any) {
      toast.error(t('proxy.toast.setFailed.title'), { description: error.message || t('proxy.toast.setFailed.description') });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSystemProxy = async (): Promise<void> => {
    try {
      const result = await window.chobits.proxy['proxy:get-system-proxy']();
      if (result?.ok && result.proxy) {
        setSystemProxyInfo(result.proxy);
      } else {
        setSystemProxyInfo(null);
      }
    } catch (error) {
      console.error('Failed to load system proxy:', error);
      setSystemProxyInfo(null);
    }
  };

  const handleTestProxy = async (): Promise<void> => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await window.chobits.proxy['proxy:test']();
      if (result?.ok) {
        setTestResult({ ok: true, message: t('proxy.test.connected', { latency: result.latency }) });
      } else {
        throw new Error(result?.error || t('proxy.test.failed'));
      }
    } catch (error: any) {
      setTestResult({ ok: false, message: error.message || t('proxy.test.connectFailed') });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddProxy = async (): Promise<void> => {
    const newProxy: Omit<CustomProxy, 'isActive'> = {
      type: 'http',
      hostname: '127.0.0.1',
      port: 7890
    };

    try {
      const result = await window.chobits.proxy['proxy:add-custom']({ proxy: newProxy });
      if (result?.ok && result.config) {
        setConfig(result.config);
        if (result.config.proxies) {
          setLocalProxies(result.config.proxies);
        }
        toast.success(t('proxy.toast.addSuccess.title'), { description: t('proxy.toast.addSuccess.description') });
      } else {
        throw new Error(result?.error || t('proxy.toast.addFailed.title'));
      }
    } catch (error: any) {
      toast.error(t('proxy.toast.addFailed.title'), { description: error.message || t('proxy.toast.addFailed.description') });
    }
  };

  const handleUpdateProxyImmediate = async (index: number, updates: Partial<CustomProxy>): Promise<void> => {
    try {
      const result = await window.chobits.proxy['proxy:update-custom']({ index, proxy: updates });
      if (result?.ok && result.config) {
        setConfig(result.config);
        if (result.config.proxies) {
          setLocalProxies(result.config.proxies);
        }
        toast.success(t('proxy.toast.updateSuccess.title'), { description: t('proxy.toast.updateSuccess.description') });
      } else {
        throw new Error(result?.error || t('proxy.toast.updateFailed.title'));
      }
    } catch (error: any) {
      toast.error(t('proxy.toast.updateFailed.title'), { description: error.message || t('proxy.toast.updateFailed.description') });
    }
  };

  const handleUpdateProxyDebounced = (index: number, updates: Partial<CustomProxy>): void => {
    setLocalProxies((prev) => {
      const newProxies = [...prev];
      if (newProxies[index]) {
        newProxies[index] = { ...newProxies[index], ...updates };
      }
      return newProxies;
    });

    const existingTimer = debounceTimersRef.current.get(index);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        const result = await window.chobits.proxy['proxy:update-custom']({ index, proxy: updates });
        if (result?.ok && result.config) {
          setConfig(result.config);
          if (result.config.proxies) {
            setLocalProxies(result.config.proxies);
          }
        } else {
          throw new Error(result?.error || '更新失败');
        }
      } catch (error: any) {
        console.error('防抖保存失败:', error);
        await loadConfig();
      } finally {
        debounceTimersRef.current.delete(index);
      }
    }, 600);

    debounceTimersRef.current.set(index, timer);
  };

  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const handleRemoveProxy = async (index: number): Promise<void> => {
    const timer = debounceTimersRef.current.get(index);
    if (timer) {
      clearTimeout(timer);
      debounceTimersRef.current.delete(index);
    }

    try {
      const result = await window.chobits.proxy['proxy:remove-custom']({ index });
      if (result?.ok && result.config) {
        setConfig(result.config);
        if (result.config.proxies) {
          setLocalProxies(result.config.proxies);
        }
        toast.success(t('proxy.toast.removeSuccess.title'), { description: t('proxy.toast.removeSuccess.description') });
      } else {
        throw new Error(result?.error || t('proxy.toast.removeFailed.title'));
      }
    } catch (error: any) {
      toast.error(t('proxy.toast.removeFailed.title'), { description: error.message || t('proxy.toast.removeFailed.description') });
    }
  };

  return (
    <div className="p-4 space-y-6">
      <SettingGroup title={t('proxy.mode.groupTitle')}>
        <SettingItem
          title={t('proxy.mode.label')}
          description={t('proxy.mode.description')}
          action={
            <RadioGroup value={config.type} onValueChange={(v) => handleTypeChange(v as ProxyType)} className="flex items-center gap-4" disabled={isLoading}>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="none" id="none" />
                <label htmlFor="none" className="text-sm cursor-pointer">
                  {t('proxy.mode.options.none')}
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="system" id="system" />
                <label htmlFor="system" className="text-sm cursor-pointer">
                  {t('proxy.mode.options.system')}
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="custom" id="custom" />
                <label htmlFor="custom" className="text-sm cursor-pointer">
                  {t('proxy.mode.options.custom')}
                </label>
              </div>
            </RadioGroup>
          }
        />
        {config.type === 'system' && (
          <SettingItem
            title={t('proxy.systemInfo.label')}
            description={systemProxyInfo ? `${systemProxyInfo.host}:${systemProxyInfo.port}` : t('proxy.systemInfo.notDetected')}
            action={
              <Button size="sm" variant="outline" onClick={loadSystemProxy}>
                <TbRefresh />
                {t('proxy.refresh')}
              </Button>
            }
          />
        )}
      </SettingGroup>

      {config.type === 'custom' && (
        <SettingGroup title={t('proxy.custom.groupTitle')}>
          {localProxies.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <TbNetwork className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-3">{t('proxy.custom.empty')}</p>
              <Button size="sm" onClick={handleAddProxy}>
                <TbPlus />
                {t('proxy.custom.add')}
              </Button>
            </div>
          ) : (
            <>
              {localProxies.map((proxy, index) => (
                <div key={index} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Select value={proxy.type} onValueChange={(value: ProxyAgentType) => handleUpdateProxyImmediate(index, { type: value })}>
                      <SelectTrigger className="w-24 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="http">HTTP</SelectItem>
                        <SelectItem value="socks5">SOCKS5</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="flex-1 h-8" value={proxy.hostname} onChange={(e) => handleUpdateProxyDebounced(index, { hostname: e.target.value })} placeholder="127.0.0.1" />
                    <Input className="w-20 h-8" type="number" value={proxy.port} onChange={(e) => handleUpdateProxyDebounced(index, { port: parseInt(e.target.value) || 0 })} placeholder="7890" />
                    <Button size="sm" variant={proxy.isActive ? 'default' : 'outline'} onClick={() => handleUpdateProxyImmediate(index, { isActive: true })} disabled={proxy.isActive}>
                      {proxy.isActive && <TbCheck />}
                      {proxy.isActive ? t('proxy.custom.enabled') : t('proxy.custom.enable')}
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveProxy(index)}>
                      <TbTrash />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 border-t border-border">
                <Button size="sm" variant="outline" onClick={handleAddProxy}>
                  <TbPlus />
                  {t('proxy.custom.add')}
                </Button>
              </div>
            </>
          )}
        </SettingGroup>
      )}

      <SettingGroup title={t('proxy.test.groupTitle')}>
        <SettingItem
          title={t('proxy.test.label')}
          description={t('proxy.test.description')}
          action={
            <div className="flex items-center gap-3">
              {testResult && <span className={`text-xs ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>{testResult.message}</span>}
              <Button size="sm" variant="outline" onClick={handleTestProxy} disabled={isTesting}>
                {isTesting ? <TbLoader className="animate-spin" /> : <TbTestPipe />}
                {isTesting ? t('proxy.test.testing') : t('proxy.test.button')}
              </Button>
            </div>
          }
        />
      </SettingGroup>
    </div>
  );
};

export default ProxySettings;
