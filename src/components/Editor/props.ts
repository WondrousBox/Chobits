import { EditorProps } from '@tiptap/pm/view';

import type { ImageUploadHandler } from './UnifiedEditor/types';

/**
 * 默认的图片上传处理函数
 * 仅做基础验证，实际上传逻辑应从外部传入
 */
export const defaultImageUploadHandler: ImageUploadHandler = async (file: File) => {
  // 检查是否为图片
  if (!file.type.includes('image/')) {
    console.warn('File type not supported:', file.type);
    return;
  }

  // 检查文件大小（最大 50MB）
  if (file.size / 1024 / 1024 > 50) {
    console.warn('File size too big (max 50MB):', file.size);
    return;
  }

  // 返回空，实际上传逻辑应从外部传入
  return;
};

/**
 * 创建可配置的 Tiptap 编辑器属性
 * @param onImageUpload 图片上传处理函数
 */
export const createEditorProps = (onImageUpload?: ImageUploadHandler): EditorProps => ({
  attributes: {
    class: 'prose-lg prose-headings:font-display focus:outline-none'
  },
  handleDOMEvents: {
    keydown: (_view, event) => {
      // 当 slash command 激活时阻止默认事件
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
        const slashCommand = document.querySelector('#slash-command');
        if (slashCommand) {
          return true;
        }
      }
    }
  },
  handlePaste: (_view, event) => {
    if (event.clipboardData?.files?.[0]) {
      event.preventDefault();
      const file = event.clipboardData.files[0];
      const handler = onImageUpload || defaultImageUploadHandler;
      handler(file);
      return true;
    }
    return false;
  },
  handleDrop: (_view, event, _slice, moved) => {
    if (!moved && event.dataTransfer?.files?.[0]) {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      const handler = onImageUpload || defaultImageUploadHandler;
      handler(file);
      return true;
    }
    return false;
  }
});

/**
 * 默认的 Tiptap 编辑器属性（使用默认图片上传处理）
 */
export const TiptapEditorProps: EditorProps = createEditorProps();
