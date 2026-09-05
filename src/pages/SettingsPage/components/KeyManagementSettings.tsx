import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbLoader2, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { SettingGroup, SettingItem } from './SettingComponents';

const KeyManagementSettings: React.FC = () => {
  const { t } = useTranslation('ai');
  const [isClearing, setIsClearing] = useState(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const handleClearAllKeys = async (): Promise<void> => {
    setIsClearing(true);
    try {
      const result = await window.chobits.ai.clearAllSecrets();
      if (result.ok) {
        setIsConfirmDialogOpen(false);
      }
    } catch (error) {
      console.error('清理密钥失败:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <SettingGroup title={t('keys.groupTitle')}>
        <SettingItem
          title={t('keys.clear.label')}
          description={t('keys.clear.description')}
          action={
            <Button size="sm" variant="destructive" disabled={isClearing} onClick={() => setIsConfirmDialogOpen(true)}>
              {isClearing ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  {t('keys.clear.clearing')}
                </>
              ) : (
                <>
                  <TbTrash />
                  {t('keys.clear.action')}
                </>
              )}
            </Button>
          }
        />
      </SettingGroup>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>{t('keys.clear.confirmTitle')}</DialogTitle>
            <DialogDescription>{t('keys.clear.confirmDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>
              {t('keys.clear.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleClearAllKeys} disabled={isClearing}>
              {isClearing ? (
                <>
                  <TbLoader2 className="animate-spin" />
                  {t('keys.clear.clearing')}
                </>
              ) : (
                t('keys.clear.confirmAction')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default KeyManagementSettings;
