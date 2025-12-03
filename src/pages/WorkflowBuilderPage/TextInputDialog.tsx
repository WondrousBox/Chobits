import React, { useState } from 'react';
import { TbLoader2, TbPlayerPlay } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface TextInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  running?: boolean;
  onConfirm: (text: string) => Promise<void> | void;
}

const TextInputDialog: React.FC<TextInputDialogProps> = ({ open, onOpenChange, disabled, running, onConfirm }) => {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      setText('');
      setSubmitting(false);
    }
    onOpenChange(nextOpen);
  };

  const handleConfirm = async (): Promise<void> => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(text.trim());
      handleOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>输入文本</DialogTitle>
          <DialogDescription>请输入要作为工作流输入的文本内容</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="请输入文本..."
            className="min-h-[120px] resize-none"
            autoFocus
            disabled={submitting || running}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void handleConfirm();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting || running}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={!text.trim() || submitting || running || disabled}>
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

export default TextInputDialog;
