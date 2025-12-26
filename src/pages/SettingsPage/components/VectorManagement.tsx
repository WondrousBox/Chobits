import { useEffect, useState } from 'react';
import { TbAlertCircle, TbDatabase, TbRefresh, TbSearch, TbServer, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    <div className="space-y-6 p-6">
      {/* 统计概览 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>向量统计</CardTitle>
              <CardDescription>按服务商和模型分组的向量文档统计</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={loadStatistics} disabled={loading}>
              <TbRefresh className={loading ? 'animate-spin' : ''} />
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-4">
                <div className="flex-1">
                  <Label>服务商筛选</Label>
                  <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                    <SelectTrigger>
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
                </div>
                <div className="flex-1">
                  <Label>模型筛选</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger>
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
                </div>
                <div className="flex-1">
                  <Label>搜索</Label>
                  <div className="relative">
                    <TbSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="搜索服务商..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="pl-8" />
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-sm text-muted-foreground">
                  总计: <span className="font-semibold text-foreground">{totalDocuments}</span> 个文档
                </div>
              </div>

              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {filteredStats.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">没有找到匹配的统计信息</div>
                  ) : (
                    filteredStats.map((provider) => (
                      <Card key={provider.providerId}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <TbServer className="h-5 w-5" />
                              <CardTitle className="text-lg">{provider.providerId || '未知服务商'}</CardTitle>
                              <Badge variant="secondary">{provider.total} 个文档</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {provider.models.map((model, idx) => (
                              <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                                <div className="flex items-center gap-2">
                                  <TbDatabase className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{model.model || '未知模型'}</span>
                                  {model.dim && (
                                    <Badge variant="outline" className="text-xs">
                                      {model.dim}D
                                    </Badge>
                                  )}
                                </div>
                                <Badge>{model.count} 个</Badge>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      {/* 重新向量化 */}
      <Card>
        <CardHeader>
          <CardTitle>重新向量化</CardTitle>
          <CardDescription>查找并重新向量化不符合目标服务商和模型的文档</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>目标服务商</Label>
              <Input placeholder="如: openai" value={targetProvider} onChange={(e) => setTargetProvider(e.target.value)} />
            </div>
            <div>
              <Label>目标模型</Label>
              <Input placeholder="如: text-embedding-3-small" value={targetModel} onChange={(e) => setTargetModel(e.target.value)} />
            </div>
            <div>
              <Label>目标维度（可选）</Label>
              <Input type="number" placeholder="如: 1536" value={targetDim || ''} onChange={(e) => setTargetDim(e.target.value ? parseInt(e.target.value, 10) : undefined)} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={findDocumentsNeedingReembedding} disabled={reembeddingLoading || !targetProvider || !targetModel}>
              <TbSearch />
              查找需要重新向量化的文档
            </Button>
            {reembeddingDocs.length > 0 && (
              <Button variant="outline" onClick={() => setReembeddingDocs([])}>
                <TbX />
                清空列表
              </Button>
            )}
          </div>

          {reembeddingDocs.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  找到 <span className="font-semibold text-foreground">{reembeddingDocs.length}</span> 个需要重新向量化的文档
                </div>
                <Button onClick={handleReembed} disabled={!targetProvider || !targetModel || !targetDim || !!reembeddingProgress}>
                  <TbRefresh />
                  开始重新向量化
                </Button>
              </div>

              {reembeddingProgress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>进度</span>
                    <span>
                      {reembeddingProgress.current} / {reembeddingProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div className="bg-primary h-full transition-all" style={{ width: `${(reembeddingProgress.current / reembeddingProgress.total) * 100}%` }} />
                  </div>
                </div>
              )}

              <ScrollArea className="h-[300px] border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>当前服务商</TableHead>
                      <TableHead>当前模型</TableHead>
                      <TableHead>当前维度</TableHead>
                      <TableHead>内容预览</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reembeddingDocs.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs">{doc.id.slice(0, 8)}...</TableCell>
                        <TableCell>
                          <Badge variant={doc.currentProviderId ? 'default' : 'secondary'}>{doc.currentProviderId || '未设置'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={doc.currentModel ? 'default' : 'secondary'}>{doc.currentModel || '未设置'}</Badge>
                        </TableCell>
                        <TableCell>{doc.currentDim ? `${doc.currentDim}D` : '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{doc.content.slice(0, 50)}...</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}

          {reembeddingDocs.length === 0 && !reembeddingLoading && (
            <div className="text-center py-8 text-muted-foreground">
              <TbAlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <div>请先填写目标服务商和模型，然后点击"查找"按钮</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
