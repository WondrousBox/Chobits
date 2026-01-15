import { useEffect, useState } from 'react';
import { TbCheck, TbEdit, TbKey, TbPlus, TbStar, TbStarFilled, TbTrash, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export type ApiKeyItem = { name: string; value: string; isDefault?: boolean };

interface ApiKeyManagerProps {
  providerId: string;
  providerLabel: string;
  fieldKey: string;
  fieldLabel: string;
  open: boolean;
  onClose: () => void;
}

interface EditDialogState {
  open: boolean;
  mode: 'add' | 'edit';
  editingItem?: ApiKeyItem;
  initialValues: { name: string; value: string };
}

export function ApiKeyManager({ providerId, providerLabel, fieldKey, fieldLabel, open, onClose }: ApiKeyManagerProps): JSX.Element {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editDialog, setEditDialog] = useState<EditDialogState>({
    open: false,
    mode: 'add',
    initialValues: { name: '', value: '' }
  });

  const loadApiKeys = async (): Promise<void> => {
    setLoading(true);
    try {
      const keys = await window.YUA.ai.getProviderApiKeys(providerId, fieldKey);
      setApiKeys(keys || []);
    } catch (error) {
      console.error('Failed to load API keys:', error);
      setApiKeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadApiKeys();
    }
  }, [open, providerId, fieldKey]);

  const handleAdd = async (): Promise<void> => {
    if (!editDialog.initialValues.name.trim() || !editDialog.initialValues.value.trim()) {
      return;
    }
    try {
      await window.YUA.ai.addProviderApiKey(providerId, fieldKey, {
        name: editDialog.initialValues.name.trim(),
        value: editDialog.initialValues.value.trim()
      });
      await loadApiKeys();
      setEditDialog({ open: false, mode: 'add', initialValues: { name: '', value: '' } });
    } catch (error: any) {
      alert(error?.message || '添加失败');
    }
  };

  const handleUpdate = async (): Promise<void> => {
    if (!editDialog.editingItem || !editDialog.initialValues.name.trim() || !editDialog.initialValues.value.trim()) {
      return;
    }
    try {
      await window.YUA.ai.updateProviderApiKey(providerId, fieldKey, editDialog.editingItem.name, {
        name: editDialog.initialValues.name.trim(),
        value: editDialog.initialValues.value.trim()
      });
      await loadApiKeys();
      setEditDialog({ open: false, mode: 'add', initialValues: { name: '', value: '' } });
    } catch (error: any) {
      alert(error?.message || '更新失败');
    }
  };

  const handleDelete = async (itemName: string): Promise<void> => {
    if (!confirm(`确定要删除 "${itemName}" 吗？`)) {
      return;
    }
    try {
      await window.YUA.ai.removeProviderApiKey(providerId, fieldKey, itemName);
      await loadApiKeys();
    } catch (error: any) {
      alert(error?.message || '删除失败');
    }
  };

  const handleSetDefault = async (itemName: string): Promise<void> => {
    try {
      await window.YUA.ai.setDefaultProviderApiKey(providerId, fieldKey, itemName);
      await loadApiKeys();
    } catch (error: any) {
      alert(error?.message || '设置失败');
    }
  };

  const openAddDialog = (): void => {
    setEditDialog({
      open: true,
      mode: 'add',
      initialValues: { name: '', value: '' }
    });
  };

  const openEditDialog = (item: ApiKeyItem): void => {
    setEditDialog({
      open: true,
      mode: 'edit',
      editingItem: item,
      initialValues: { name: item.name, value: item.value }
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TbKey className="w-5 h-5" />
              <span>API Key 管理 - {providerLabel}</span>
            </DialogTitle>
            <DialogDescription>
              管理 {fieldLabel} 的多个 API Keys
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TbKey className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无 API Keys</p>
                <p className="text-sm">点击下方按钮添加第一个 API Key</p>
              </div>
            ) : (
              <div className="space-y-2">
                {apiKeys.map((item) => (
                  <div key={item.name} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.name}</span>
                        {item.isDefault && (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                            <TbStarFilled className="w-3 h-3" />
                            默认
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground font-mono truncate">
                        {item.value.slice(0, 8)}***{item.value.slice(-4)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!item.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="设为默认"
                          onClick={() => handleSetDefault(item.name)}
                        >
                          <TbStar className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        title="编辑"
                        onClick={() => openEditDialog(item)}
                      >
                        <TbEdit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="删除"
                        onClick={() => handleDelete(item.name)}
                      >
                        <TbTrash className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              className="w-full"
              variant="outline"
              onClick={openAddDialog}
            >
              <TbPlus className="w-4 h-4 mr-2" />
              添加 API Key
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => setEditDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editDialog.mode === 'add' ? '添加 API Key' : '编辑 API Key'}
            </DialogTitle>
            <DialogDescription>
              {editDialog.mode === 'add' ? '输入新的 API Key 信息' : '修改 API Key 信息'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">名称</label>
              <Input
                value={editDialog.initialValues.name}
                onChange={(e) => setEditDialog((prev) => ({
                  ...prev,
                  initialValues: { ...prev.initialValues, name: e.target.value }
                }))}
                placeholder="例如：个人账号、公司账号"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">API Key</label>
              <Input
                type="password"
                value={editDialog.initialValues.value}
                onChange={(e) => setEditDialog((prev) => ({
                  ...prev,
                  initialValues: { ...prev.initialValues, value: e.target.value }
                }))}
                placeholder="输入完整的 API Key"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialog((prev) => ({ ...prev, open: false }))}
            >
              取消
            </Button>
            <Button onClick={editDialog.mode === 'add' ? handleAdd : handleUpdate}>
              {editDialog.mode === 'add' ? '添加' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default ApiKeyManager;
