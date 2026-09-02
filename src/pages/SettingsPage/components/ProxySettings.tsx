import { useEffect, useRef, useState } from 'react';
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
  active: boolean;
}

interface ProxyConfig {
  type: ProxyType;
  proxies?: CustomProxy[];
}

const ProxySettings: React.FC = () => {
  const [config, setConfig] = useState<ProxyConfig>({ type: 'none' });
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [systemProxyInfo, setSystemProxyInfo] = useState<{ host: string; port: string } | null>(null);
  const debounceTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const [localProxies, setLocalProxies] = useState<CustomProxy[]>([]);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (config.proxies) {
      setLocalProxies(config.proxies);
    }
  }, [config.proxies]);

  const loadConfig = async (): Promise<void> => {
    try {
      const result = await window.chobits.proxy['proxy:get-config']();
      if (result) {
        setConfig(result);
      }
    } catch (error) {
      console.error('Failed to load proxy config:', error);
      toast.error('加载失败', { description: '无法加载代理配置' });
    }
  };

  const handleTypeChange = async (type: ProxyType): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await window.chobits.proxy['proxy:set-config']({ config: { type } });
      if (result?.ok && result.config) {
        setConfig(result.config);
        toast.success('设置成功', { description: '代理配置已更新' });
        if (type === 'system') {
          await loadSystemProxy();
        }
      } else {
        throw new Error(result?.error || '设置失败');
      }
    } catch (error: any) {
      toast.error('设置失败', { description: error.message || '无法更新代理配置' });
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
        setTestResult({ ok: true, message: `连接正常，延迟: ${result.latency}ms` });
      } else {
        throw new Error(result?.error || '测试失败');
      }
    } catch (error: any) {
      setTestResult({ ok: false, message: error.message || '无法连接到代理服务器' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddProxy = async (): Promise<void> => {
    const newProxy: Omit<CustomProxy, 'active'> = {
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
        toast.success('添加成功', { description: '已添加新的代理配置' });
      } else {
        throw new Error(result?.error || '添加失败');
      }
    } catch (error: any) {
      toast.error('添加失败', { description: error.message || '无法添加代理配置' });
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
        toast.success('更新成功', { description: '代理配置已更新' });
      } else {
        throw new Error(result?.error || '更新失败');
      }
    } catch (error: any) {
      toast.error('更新失败', { description: error.message || '无法更新代理配置' });
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
        toast.success('删除成功', { description: '代理配置已删除' });
      } else {
        throw new Error(result?.error || '删除失败');
      }
    } catch (error: any) {
      toast.error('删除失败', { description: error.message || '无法删除代理配置' });
    }
  };

  const proxyTypeLabel = {
    none: '禁用代理',
    system: '系统代理',
    custom: '自定义代理'
  };

  return (
    <div className="p-4 space-y-6">
      <SettingGroup title="代理模式">
        <SettingItem
          title="代理类型"
          description="选择网络代理模式"
          action={
            <RadioGroup value={config.type} onValueChange={(v) => handleTypeChange(v as ProxyType)} className="flex items-center gap-4" disabled={isLoading}>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="none" id="none" />
                <label htmlFor="none" className="text-sm cursor-pointer">
                  禁用
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="system" id="system" />
                <label htmlFor="system" className="text-sm cursor-pointer">
                  系统
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="custom" id="custom" />
                <label htmlFor="custom" className="text-sm cursor-pointer">
                  自定义
                </label>
              </div>
            </RadioGroup>
          }
        />
        {config.type === 'system' && (
          <SettingItem
            title="系统代理信息"
            description={systemProxyInfo ? `${systemProxyInfo.host}:${systemProxyInfo.port}` : '未检测到系统代理'}
            action={
              <Button size="sm" variant="outline" onClick={loadSystemProxy}>
                <TbRefresh className="h-4 w-4 mr-1" />
                刷新
              </Button>
            }
          />
        )}
      </SettingGroup>

      {config.type === 'custom' && (
        <SettingGroup title="自定义代理">
          {localProxies.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <TbNetwork className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-3">暂无代理配置</p>
              <Button size="sm" onClick={handleAddProxy}>
                <TbPlus className="h-4 w-4 mr-1" />
                添加代理
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
                    <Input
                      className="flex-1 h-8"
                      value={proxy.hostname}
                      onChange={(e) => handleUpdateProxyDebounced(index, { hostname: e.target.value })}
                      placeholder="127.0.0.1"
                    />
                    <Input
                      className="w-20 h-8"
                      type="number"
                      value={proxy.port}
                      onChange={(e) => handleUpdateProxyDebounced(index, { port: parseInt(e.target.value) || 0 })}
                      placeholder="7890"
                    />
                    <Button size="sm" variant={proxy.active ? 'default' : 'outline'} onClick={() => handleUpdateProxyImmediate(index, { active: true })} disabled={proxy.active}>
                      {proxy.active && <TbCheck className="h-4 w-4 mr-1" />}
                      {proxy.active ? '已启用' : '启用'}
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveProxy(index)}>
                      <TbTrash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 border-t border-border">
                <Button size="sm" variant="outline" onClick={handleAddProxy}>
                  <TbPlus className="h-4 w-4 mr-1" />
                  添加代理
                </Button>
              </div>
            </>
          )}
        </SettingGroup>
      )}

      <SettingGroup title="网络测试">
        <SettingItem
          title="测试代理连接"
          description="检测当前代理配置是否正常工作"
          action={
            <div className="flex items-center gap-3">
              {testResult && (
                <span className={`text-xs ${testResult.ok ? 'text-green-600' : 'text-destructive'}`}>{testResult.message}</span>
              )}
              <Button size="sm" variant="outline" onClick={handleTestProxy} disabled={isTesting}>
                {isTesting ? <TbLoader className="h-4 w-4 mr-1 animate-spin" /> : <TbTestPipe className="h-4 w-4 mr-1" />}
                {isTesting ? '测试中...' : '测试'}
              </Button>
            </div>
          }
        />
      </SettingGroup>
    </div>
  );
};

export default ProxySettings;
