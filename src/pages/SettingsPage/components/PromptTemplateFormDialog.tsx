import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type PromptTemplateFormValues = {
  name: string;
  content: string;
  type?: 'system' | 'user';
};

export default function PromptTemplateFormDialog(props: {
  open: boolean;
  mode: 'create' | 'edit';
  title?: string;
  initialValues: PromptTemplateFormValues;
  onClose: () => void;
  onSubmit: (values: PromptTemplateFormValues) => void;
}): JSX.Element {
  const { open, mode, title, initialValues, onClose, onSubmit } = props;
  const [values, setValues] = useState<PromptTemplateFormValues>(initialValues);

  // Initialize values when dialog opens using onOpenChange to avoid setState in effect lint warning

  const submit = (): void => {
    if (!values.name?.trim()) {
      alert('名称必填');
      return;
    }
    onSubmit({ name: values.name.trim(), content: values.content || '', type: values.type || 'user' });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setValues(initialValues);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title || (mode === 'create' ? '新建模板' : '编辑模板')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">名称</span>
            <Input className="h-9" placeholder="模板名称" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">内容</span>
            <Textarea className="min-h-[140px] block w-full box-border" placeholder="模板内容" value={values.content} onChange={(e) => setValues((v) => ({ ...v, content: e.target.value }))} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit}>{mode === 'create' ? '创建' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
