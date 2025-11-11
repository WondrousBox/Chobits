import { useEffect, useState } from 'react';
import { TbCheck, TbNetwork, TbPlus, TbRefresh, TbTestPipe, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [systemProxyInfo, setSystemProxyInfo] = useState<{ host: string; port: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async (): Promise<void> => {
    try {
      const result = await window.YUA.proxy?.getConfig();
      if (result) {
        setConfig(result);
      }
    } catch (error) {
      console.error('Failed to load proxy config:', error);
      toast.error('加载失败', { description: '无法加载代理配置' });
    }
  };

  const handleTypeChange = async (type: ProxyType): Promise<void> => {
    setLoading(true);
    try {
      // 切换类型时保留现有的代理列表，不清空
      const result = await window.YUA.proxy?.setConfig({ config: { type } });
      if (result?.ok && result.config) {
        setConfig(result.config);
        toast.success('设置成功', { description: '代理配置已更新' });

        // 如果选择系统代理，自动获取系统代理信息
        if (type === 'system') {
          await loadSystemProxy();
        }
      } else {
        throw new Error(result?.error || '设置失败');
      }
    } catch (error: any) {
      toast.error('设置失败', { description: error.message || '无法更新代理配置' });
    } finally {
      setLoading(false);
    }
  };

  const loadSystemProxy = async (): Promise<void> => {
    try {
      const result = await window.YUA.proxy?.getSystemProxy();
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
    setTesting(true);
    try {
      const result = await window.YUA.proxy?.test();
      if (result?.ok) {
        toast.success('测试成功', { description: `代理连接正常，延迟: ${result.latency}ms` });
      } else {
        throw new Error(result?.error || '测试失败');
      }
    } catch (error: any) {
      toast.error('测试失败', { description: error.message || '无法连接到代理服务器' });
    } finally {
      setTesting(false);
    }
  };

  const handleAddProxy = async (): Promise<void> => {
    const newProxy: Omit<CustomProxy, 'active'> = {
      type: 'http',
      hostname: '',
      port: 7890
    };

    try {
      const result = await window.YUA.proxy?.addCustom({ proxy: newProxy });
      if (result?.ok && result.config) {
        setConfig(result.config);
        toast.success('添加成功', { description: '已添加新的代理配置' });
      } else {
        throw new Error(result?.error || '添加失败');
      }
    } catch (error: any) {
      toast.error('添加失败', { description: error.message || '无法添加代理配置' });
    }
  };

  const handleUpdateProxy = async (index: number, updates: Partial<CustomProxy>): Promise<void> => {
    try {
      const result = await window.YUA.proxy?.updateCustom({ index, proxy: updates });
      if (result?.ok && result.config) {
        setConfig(result.config);
        toast.success('更新成功', { description: '代理配置已更新' });
      } else {
        throw new Error(result?.error || '更新失败');
      }
    } catch (error: any) {
      toast.error('更新失败', { description: error.message || '无法更新代理配置' });
    }
  };

  const handleRemoveProxy = async (index: number): Promise<void> => {
    try {
      const result = await window.YUA.proxy?.removeCustom({ index });
      if (result?.ok && result.config) {
        setConfig(result.config);
        toast.success('删除成功', { description: '代理配置已删除' });
      } else {
        throw new Error(result?.error || '删除失败');
      }
    } catch (error: any) {
      toast.error('删除失败', { description: error.message || '无法删除代理配置' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">代理设置</h3>
            <p className="text-sm text-muted-foreground mb-4">配置网络代理以访问受限资源</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <input type="radio" id="none" name="proxyType" value="none" checked={config.type === 'none'} onChange={() => handleTypeChange('none')} disabled={loading} className="w-4 h-4" />
              <label htmlFor="none" className="cursor-pointer">
                禁用代理
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input type="radio" id="system" name="proxyType" value="system" checked={config.type === 'system'} onChange={() => handleTypeChange('system')} disabled={loading} className="w-4 h-4" />
              <label htmlFor="system" className="cursor-pointer">
                系统代理
              </label>
              {config.type === 'system' && (
                <div className="ml-4 flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={loadSystemProxy} className="h-8">
                    <TbRefresh className="w-4 h-4 mr-1" />
                    刷新
                  </Button>
                  {systemProxyInfo && (
                    <span className="text-sm text-muted-foreground">
                      {systemProxyInfo.host}:{systemProxyInfo.port}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <input type="radio" id="custom" name="proxyType" value="custom" checked={config.type === 'custom'} onChange={() => handleTypeChange('custom')} disabled={loading} className="w-4 h-4" />
              <label htmlFor="custom" className="cursor-pointer">
                自定义代理
              </label>
            </div>
          </div>

          {config.type === 'custom' && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">代理列表</span>
                <Button variant="outline" size="sm" onClick={handleAddProxy} className="h-8">
                  <TbPlus className="w-4 h-4 mr-1" />
                  添加代理
                </Button>
              </div>

              {config.proxies && config.proxies.length > 0 ? (
                <div className="space-y-3">
                  {config.proxies.map((proxy, index) => (
                    <div key={index} className={`border rounded-lg p-4 ${proxy.active ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      <div className="grid grid-cols-12 gap-4 items-end">
                        <div className="col-span-2">
                          <span className="text-sm font-medium mb-2 block">类型</span>
                          <Select value={proxy.type} onValueChange={(value: ProxyAgentType) => handleUpdateProxy(index, { type: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="http">HTTP</SelectItem>
                              <SelectItem value="socks5">SOCKS5</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-5">
                          <span className="text-sm font-medium mb-2 block">地址</span>
                          <Input value={proxy.hostname} onChange={(e) => handleUpdateProxy(index, { hostname: e.target.value })} placeholder="127.0.0.1 或 proxy.example.com" />
                        </div>
                        <div className="col-span-2">
                          <span className="text-sm font-medium mb-2 block">端口</span>
                          <Input type="number" value={proxy.port} onChange={(e) => handleUpdateProxy(index, { port: parseInt(e.target.value) || 0 })} placeholder="7890" />
                        </div>
                        <div className="col-span-3 flex items-end gap-2">
                          <Button variant={proxy.active ? 'default' : 'outline'} size="sm" onClick={() => handleUpdateProxy(index, { active: true })} className="h-8 flex-1" disabled={proxy.active}>
                            {proxy.active ? (
                              <>
                                <TbCheck className="w-4 h-4 mr-1" />
                                当前代理
                              </>
                            ) : (
                              '设为当前'
                            )}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveProxy(index)} className="h-8 w-8">
                            <TbTrash className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TbNetwork className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>暂无代理配置</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end border-t pt-4">
            <Button onClick={handleTestProxy} disabled={testing || config.type === 'none'} variant="outline">
              <TbTestPipe className="w-4 h-4 mr-2" />
              {testing ? '测试中...' : '测试代理连接'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProxySettings;
