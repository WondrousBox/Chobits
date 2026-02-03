import React from 'react';
import { TbExternalLink } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import { isDocumentFile, isEbookFile, isPdfFile, isPresentationFile, isSpreadsheetFile, makeResSrc } from '../../utils/resourceProtocol';
import { isSubtitleFile } from '../../utils/subtitleUtils';
import { ResourceSubtitlePlayer, TextPlayer } from '../Players';
import { useResourceTabContext } from './ResourceTabContext';

/**
 * 内容 Tab 组件
 * 用于显示文本类型资源的内容：字幕、JSON、TXT、PDF等
 */
const ContentTab: React.FC = () => {
  const { resource, mediaDuration, mediaPlayerRef } = useResourceTabContext();

  const isSubtitle = isSubtitleFile(resource?.filePath);
  const isPdf = isPdfFile(resource?.filePath);
  const isDocument = isDocumentFile(resource?.filePath);
  const isSpreadsheet = isSpreadsheetFile(resource?.filePath);
  const isPresentation = isPresentationFile(resource?.filePath);
  const isEbook = isEbookFile(resource?.filePath);
  const isOffice = isDocument || isSpreadsheet || isPresentation;

  const title = resource.title || resource.filePath || resource.url || resource.id;
  const fileSrc = resource.filePath ? makeResSrc(resource.filePath) : resource.url;

  // 字幕文件：使用 ResourceSubtitlePlayer（负责从资源加载字幕内容）
  if (isSubtitle) {
    return (
      <div className="h-full overflow-auto">
        <ResourceSubtitlePlayer resource={resource} mediaDuration={mediaDuration} mediaPlayerRef={mediaPlayerRef} />
      </div>
    );
  }

  // PDF 文件：使用 iframe 预览
  if (isPdf && fileSrc) {
    return (
      <div className="h-full w-full">
        <iframe src={fileSrc} className="w-full h-full border-0" title={title} />
      </div>
    );
  }

  // Office 文档和电子书：显示文件信息和打开按钮
  if ((isOffice || isEbook) && resource.filePath) {
    const fileExt = resource.filePath.split('.').pop()?.toUpperCase() || '文档';
    const fileTypeLabel = isDocument ? 'Word 文档' : isSpreadsheet ? 'Excel 表格' : isPresentation ? 'PowerPoint 演示文稿' : isEbook ? '电子书' : '文档';

    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-6xl text-muted-foreground/50">{fileExt}</div>
        <div className="text-sm text-muted-foreground text-center">
          <div className="font-medium">{title}</div>
          <div className="text-xs mt-1">{fileTypeLabel}</div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            // 使用系统默认程序打开文件
            window.YUA.file['file:openInDefaultApp'](resource.filePath!);
          }}
        >
          <TbExternalLink className="w-4 h-4 mr-2" />
          用默认程序打开
        </Button>
      </div>
    );
  }

  // 其他文本文件（JSON、TXT、MD等）：使用 TextPlayer
  return (
    <div className="h-full overflow-auto">
      <TextPlayer resource={resource} />
    </div>
  );
};

export default ContentTab;
