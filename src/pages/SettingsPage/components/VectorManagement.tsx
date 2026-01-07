import { useEffect, useState } from 'react';
import { TbAlertCircle, TbDatabase, TbLoader, TbRefresh, TbSearch, TbServer, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { SettingGroup, SettingItem } from './SettingComponents';

type ProviderStat = {
  providerId: string;
  models: Array<{ model: string | null; dim: number | null; count: number }>;
  total: number;
};

type DocumentNeedingReembedding = {
  id: string;
  content: string;
  metadata: any;
  currentProviderId: string | null;
  currentModel: string | null;
  currentDim: number | null;
};

export default function VectorManagement(): JSX.Element {
  const [statistics, setStatistics] = useState<{ providers: ProviderStat[] }>({ providers: [] });
  const [loading, setLoading] = useState(true);
  const [reembeddingDocs, setReembeddingDocs] = useState<DocumentNeedingReembedding[]>([]);
  const [reembeddingLoading, setReembeddingLoading] = useState(false);
  const [reembeddingProgress, setReembeddingProgress] = useState<{ current: number; total: number } | null>(null);

  // 筛选状态
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [searchText, setSearchText] = useState('');

  // 重新向量化配置
  const [targetProvider, setTargetProvider] = useState('');
  const [targetModel, setTargetModel] = useState('');
  const [targetDim, setTargetDim] = useState<number | undefined>(undefined);

  const loadStatistics = async (): Promise<void> => {
    try {
      setLoading(true);
      const stats = await window.YUA.vector['vector:getStatistics']();
      setStatistics(stats);
    } catch (e) {
      console.error('Failed to load statistics:', e);
      toast.error('加载失败', { description: '无法加载向量统计信息' });
    } finally {
      setLoading(false);
    }
  };

  const findDocumentsNeedingReembedding = async (): Promise<void> => {
    if (!targetProvider || !targetModel) {
      toast.error('参数不完整', { description: '请先选择目标服务商和模型' });
      return;
    }

    try {
      setReembeddingLoading(true);
      const docs = await window.YUA.vector.findDocumentsNeedingReembedding({
        providerId: targetProvider,
        model: targetModel,
        dim: targetDim
      });
      setReembeddingDocs(docs);
      toast.success('查询完成', { description: `找到 ${docs.length} 个需要重新向量化的文档` });
    } catch (e) {
      console.error('Failed to find documents:', e);
      toast.error('查询失败', { description: '无法查询需要重新向量化的文档' });
    } finally {
      setReembeddingLoading(false);
    }
  };

  const handleReembed = async (): Promise<void> => {
    if (reembeddingDocs.length === 0) {
      toast.error('没有文档', { description: '没有需要重新向量化的文档' });
      return;
    }

    if (!targetProvider || !targetModel || !targetDim) {
      toast.error('参数不完整', { description: '请填写完整的目标服务商、模型和维度' });
      return;
    }

    try {
      setReembeddingProgress({ current: 0, total: reembeddingDocs.length });
      const ids = reembeddingDocs.map((d) => d.id);
      const result = await window.YUA.vector.reembedDocuments({
        ids,
        providerId: targetProvider,
        model: targetModel,
        dim: targetDim
      });

      toast.success('重新向量化完成', { description: `成功: ${result.reembedded}, 失败: ${result.failed}` });

      // 重新加载统计信息
      await loadStatistics();
      setReembeddingDocs([]);
      setReembeddingProgress(null);
    } catch (e) {
      console.error('Failed to reembed:', e);
      toast.error('重新向量化失败', { description: String(e) });
      setReembeddingProgress(null);
    }
  };

  useEffect(() => {
    void loadStatistics();
  }, []);

  // 获取所有唯一的服务商和模型
  const allProviders = statistics.providers.map((p) => p.providerId);
  const allModels = statistics.providers.flatMap((p) => p.models.map((m) => m.model || 'unknown')).filter((v, i, a) => a.indexOf(v) === i);

  // 筛选后的统计
  const filteredStats = statistics.providers.filter((p) => {
    if (selectedProvider !== 'all' && p.providerId !== selectedProvider) return false;
    if (selectedModel !== 'all' && !p.models.some((m) => (m.model || 'unknown') === selectedModel)) return false;
    if (searchText && !p.providerId.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const totalDocuments = statistics.providers.reduce((sum, p) => sum + p.total, 0);

  return (
    <div className="space-y-4">
      {/* 向量统计 */}
      <SettingGroup title="向量统计">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">
              总计 <span className="font-medium text-foreground">{totalDocuments}</span> 个文档
            </span>
            <Button size="sm" variant="ghost" className="h-7" onClick={loadStatistics} disabled={loading}>
              {loading ? <TbLoader className="h-4 w-4 mr-1 animate-spin" /> : <TbRefresh className="h-4 w-4 mr-1" />}
              刷新
            </Button>
          </div>

          {/* 筛选器 */}
          <div className="flex items-center gap-2 mb-3">
            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="全部服务商" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部服务商</SelectItem>
                {allProviders.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-8 w-[160px]">
                <SelectValue placeholder="全部模型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模型</SelectItem>
                {allModels.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <TbSearch className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="搜索服务商..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="h-8 pl-8" />
            </div>
          </div>

          {/* 统计列表 */}
          {loading ? (
            <div className="text-center py-6 text-sm text-muted-foreground">加载中...</div>
          ) : filteredStats.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">没有找到匹配的统计信息</div>
          ) : (
            <ScrollArea className="h-[240px]">
              <div className="space-y-2">
                {filteredStats.map((provider) => (
                  <div key={provider.providerId} className="border border-border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <TbServer className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{provider.providerId || '未知服务商'}</span>
                      <Badge variant="secondary" className="text-xs">
                        {provider.total} 个
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {provider.models.map((model, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs px-2 py-1.5 bg-muted/50 rounded">
                          <div className="flex items-center gap-2">
                            <TbDatabase className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{model.model || '未知模型'}</span>
                            {model.dim && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {model.dim}D
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground">{model.count} 个</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </SettingGroup>

      {/* 重新向量化 */}
      <SettingGroup title="重新向量化">
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground">查找并重新向量化不符合目标服务商和模型的文档</p>

          <div className="flex items-center gap-2">
            <Input placeholder="目标服务商" value={targetProvider} onChange={(e) => setTargetProvider(e.target.value)} className="h-8 flex-1" />
            <Input placeholder="目标模型" value={targetModel} onChange={(e) => setTargetModel(e.target.value)} className="h-8 flex-1" />
            <Input
              type="number"
              placeholder="维度"
              value={targetDim || ''}
              onChange={(e) => setTargetDim(e.target.value ? parseInt(e.target.value, 10) : undefined)}
              className="h-8 w-20"
            />
            <Button size="sm" className="h-8" onClick={findDocumentsNeedingReembedding} disabled={reembeddingLoading || !targetProvider || !targetModel}>
              {reembeddingLoading ? <TbLoader className="h-4 w-4 mr-1 animate-spin" /> : <TbSearch className="h-4 w-4 mr-1" />}
              查找
            </Button>
          </div>

          {reembeddingDocs.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  找到 <span className="font-medium text-foreground">{reembeddingDocs.length}</span> 个文档
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReembeddingDocs([])}>
                    <TbX className="h-3.5 w-3.5 mr-1" />
                    清空
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleReembed} disabled={!targetDim || !!reembeddingProgress}>
                    <TbRefresh className="h-3.5 w-3.5 mr-1" />
                    开始向量化
                  </Button>
                </div>
              </div>

              {reembeddingProgress && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>进度</span>
                    <span>
                      {reembeddingProgress.current} / {reembeddingProgress.total}
                    </span>
                  </div>
                  <Progress value={(reembeddingProgress.current / reembeddingProgress.total) * 100} className="h-1.5" />
                </div>
              )}

              <ScrollArea className="h-[200px] border border-border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">ID</TableHead>
                      <TableHead className="text-xs">服务商</TableHead>
                      <TableHead className="text-xs">模型</TableHead>
                      <TableHead className="text-xs">维度</TableHead>
                      <TableHead className="text-xs">内容预览</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reembeddingDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs py-2">{doc.id.slice(0, 8)}...</TableCell>
                        <TableCell className="py-2">
                          <Badge variant={doc.currentProviderId ? 'default' : 'secondary'} className="text-[10px]">
                            {doc.currentProviderId || '未设置'}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant={doc.currentModel ? 'default' : 'secondary'} className="text-[10px]">
                            {doc.currentModel || '未设置'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs py-2">{doc.currentDim ? `${doc.currentDim}D` : '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground py-2">{doc.content.slice(0, 40)}...</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}

          {reembeddingDocs.length === 0 && !reembeddingLoading && (
            <div className="text-center py-6 text-muted-foreground">
              <TbAlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">填写目标配置后点击"查找"按钮</p>
            </div>
          )}
        </div>
      </SettingGroup>
    </div>
  );
}
