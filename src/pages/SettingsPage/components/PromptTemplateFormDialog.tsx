import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
  isOpen: boolean;
  mode: 'create' | 'edit';
  title?: string;
  initialValues: PromptTemplateFormValues;
  onClose: () => void;
  onSubmit: (values: PromptTemplateFormValues) => void;
}): JSX.Element {
  const { isOpen, mode, title, initialValues, onClose, onSubmit } = props;
  const { t } = useTranslation('settings');
  const [values, setValues] = useState<PromptTemplateFormValues>(initialValues);

  // Initialize values when dialog opens using onOpenChange to avoid setState in effect lint warning

  const submit = (): void => {
    if (!values.name?.trim()) {
      alert(t('prompt.dialog.nameRequired'));
      return;
    }
    onSubmit({ name: values.name.trim(), content: values.content || '', type: values.type || 'user' });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
        else setValues(initialValues);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title || (mode === 'create' ? t('prompt.dialog.createTitle') : t('prompt.dialog.editTitle'))}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">{t('prompt.dialog.nameLabel')}</span>
            <Input className="h-9" placeholder={t('prompt.dialog.namePlaceholder')} value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">{t('prompt.dialog.contentLabel')}</span>
            <Textarea
              className="min-h-[140px] block w-full box-border"
              placeholder={t('prompt.dialog.contentPlaceholder')}
              value={values.content}
              onChange={(e) => setValues((v) => ({ ...v, content: e.target.value }))}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit}>{mode === 'create' ? t('common.create') : t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
