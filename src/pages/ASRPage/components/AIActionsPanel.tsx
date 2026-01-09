import React, { useState } from 'react';
import { TbBrain, TbLoader2, TbSparkles } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

interface AIActionsPanelProps {
  segments: Array<{
    text: string;
    translation?: string;
    start: number;
    end: number;
  }>;
  isTransparent?: boolean;
}

export const AIActionsPanel: React.FC<AIActionsPanelProps> = ({ segments, isTransparent = false }) => {
  const [selectedText, setSelectedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState('');

  // 获取所有文本
  const allText = segments.map((s) => s.text).join(' ');

  // AI操作：总结
  const handleSummarize = async (): Promise<void> => {
    if (!selectedText && !allText) return;
    setIsProcessing(true);
    setResult('');

    try {
      // TODO: 调用AI总结API
      // const summary = await window.YUA.ai.summarize({ text: selectedText || allText });
      // setResult(summary);

      // 模拟API调用
      setTimeout(() => {
        setResult('这是总结结果（待实现）');
        setIsProcessing(false);
      }, 1000);
    } catch (error) {
      console.error('总结失败:', error);
      setIsProcessing(false);
    }
  };

  // AI操作：改写
  const handleRewrite = async (): Promise<void> => {
    if (!selectedText && !allText) return;
    setIsProcessing(true);
    setResult('');

    try {
      // TODO: 调用AI改写API
      // const rewritten = await window.YUA.ai.rewrite({ text: selectedText || allText });
      // setResult(rewritten);

      // 模拟API调用
      setTimeout(() => {
        setResult('这是改写结果（待实现）');
        setIsProcessing(false);
      }, 1000);
    } catch (error) {
      console.error('改写失败:', error);
      setIsProcessing(false);
    }
  };

  // AI操作：提取要点
  const handleExtractKeyPoints = async (): Promise<void> => {
    if (!selectedText && !allText) return;
    setIsProcessing(true);
    setResult('');

    try {
      // TODO: 调用AI提取要点API
      // const keyPoints = await window.YUA.ai.extractKeyPoints({ text: selectedText || allText });
      // setResult(keyPoints);

      // 模拟API调用
      setTimeout(() => {
        setResult('这是提取的要点（待实现）');
        setIsProcessing(false);
      }, 1000);
    } catch (error) {
      console.error('提取要点失败:', error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-full border-l bg-background no-drag">
      <div className={`flex items-center gap-2 px-4 py-2 border-b ${isTransparent ? 'border-border/50' : ''}`}>
        <TbBrain className="h-4 w-4" />
        <span className="text-sm font-medium">AI 操作</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">操作文本</Label>
            <Textarea value={selectedText} onChange={(e) => setSelectedText(e.target.value)} placeholder={allText ? '留空则使用全部文本' : '请输入要操作的文本'} className="min-h-[100px] text-sm" />
            {allText && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => setSelectedText(allText)}>
                使用全部文本
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">快速操作</Label>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="justify-start" onClick={handleSummarize} disabled={isProcessing || (!selectedText && !allText)}>
                <TbSparkles className="h-4 w-4 mr-2" />
                总结
              </Button>
              <Button variant="outline" className="justify-start" onClick={handleRewrite} disabled={isProcessing || (!selectedText && !allText)}>
                <TbSparkles className="h-4 w-4 mr-2" />
                改写
              </Button>
              <Button variant="outline" className="justify-start" onClick={handleExtractKeyPoints} disabled={isProcessing || (!selectedText && !allText)}>
                <TbSparkles className="h-4 w-4 mr-2" />
                提取要点
              </Button>
            </div>
          </div>

          {isProcessing && (
            <div className="flex items-center justify-center py-4">
              <TbLoader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2 text-sm text-muted-foreground">处理中...</span>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <Label className="text-xs">结果</Label>
              <div className={`p-3 rounded-lg border ${isTransparent ? 'border-border/50 bg-background/50' : ''}`}>
                <p className="text-sm whitespace-pre-wrap">{result}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(result);
                }}
              >
                复制结果
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
