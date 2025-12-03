import React, { useState } from 'react';
import { TbLoader2, TbPlayerPlay } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface UrlInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  running?: boolean;
  onConfirm: (url: string) => Promise<void> | void;
}

const UrlInputDialog: React.FC<UrlInputDialogProps> = ({ open, onOpenChange, disabled, running, onConfirm }) => {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setUrl('');
      setSubmitting(false);
    }
    onOpenChange(nextOpen);
  };

  const isValidUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (!url.trim() || submitting) return;
    const trimmedUrl = url.trim();
    if (!isValidUrl(trimmedUrl)) {
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(trimmedUrl);
      handleOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>输入链接</DialogTitle>
          <DialogDescription>请输入要作为工作流输入的网址链接</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full"
            autoFocus
            disabled={submitting || running}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleConfirm();
              }
            }}
          />
          {url.trim() && !isValidUrl(url.trim()) && <p className="mt-2 text-sm text-destructive">请输入有效的网址（以 http:// 或 https:// 开头）</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting || running}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!url.trim() || !isValidUrl(url.trim()) || submitting || running || disabled}>
            {submitting ? (
              <>
                <TbLoader2 className="mr-2 h-4 w-4 animate-spin" />
                运行中...
              </>
            ) : (
              <>
                <TbPlayerPlay className="mr-2 h-4 w-4" />
                运行
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UrlInputDialog;
