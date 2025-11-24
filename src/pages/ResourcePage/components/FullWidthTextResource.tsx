import React, { useEffect, useState } from 'react';
import { TbMaximize } from 'react-icons/tb';

import { RichTextEditor } from '@/components/common/RichTextEditor';
import { Button } from '@/components/ui/button';

import { ResourceItem } from '../types';

interface FullWidthTextResourceProps {
  item: ResourceItem;
  onPreview?: () => void;
}

const FullWidthTextResource: React.FC<FullWidthTextResourceProps> = ({ item, onPreview }) => {
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    const normalizeContent = (raw: string): string => {
      if (!raw) return '';
      const trimmed = raw.trim();
      const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(trimmed);
      if (looksLikeHtml) return raw;
      return raw
        .split('\n')
        .map((line) => `<p>${line || '<br />'}</p>`)
        .join('');
    };

    const loadContent = async (): Promise<void> => {
      if (item.contentText) {
        setContent(normalizeContent(item.contentText));
        return;
      }
      if (item.filePath) {
        try {
          const result = await (window as any).YUA?.file['file:readContent'](item.filePath, 50000);
          if (result?.success && result.content) {
            setContent(normalizeContent(result.content));
          }
        } catch (e) {
          console.warn('load text content failed', e);
        }
      }
    };
    loadContent();
  }, [item]);

  if (!content) {
    return (
      <div className="border rounded-lg p-8 bg-muted/30 text-center text-muted-foreground">
        <p>暂无内容</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden group border-ring border-solid">
      <div className="absolute top-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <Button onClick={onPreview} variant="ghost" size="icon" className="w-8 h-8">
          <TbMaximize />
        </Button>
      </div>
      <RichTextEditor value={content} onChange={() => { }} editable={false} placeholder="暂无内容" className="border-0 shadow-none" />
    </div>
  );
};

export default FullWidthTextResource;
