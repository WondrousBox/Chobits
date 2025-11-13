import React, { useState } from 'react';
import { TbCheck, TbCopy } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface WorkflowJsonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  json: string;
}

const WorkflowJsonDialog: React.FC<WorkflowJsonDialogProps> = ({ open, onOpenChange, json }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] w-[700px]">
        <DialogHeader>
          <DialogTitle>工作流 JSON</DialogTitle>
          <DialogDescription>工作流 JSON 定义，可用于导入到其他系统</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <TbCheck className="mr-1" />
                  已复制
                </>
              ) : (
                <>
                  <TbCopy className="mr-1" />
                  复制
                </>
              )}
            </Button>
          </div>
          <Textarea value={json} readOnly className="font-mono text-xs min-h-[400px] resize-none bg-muted w-[670px]" onClick={(e) => (e.target as HTMLTextAreaElement).select()} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowJsonDialog;
