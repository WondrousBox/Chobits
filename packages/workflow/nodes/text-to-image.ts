import * as fs from 'node:fs';
import * as path from 'node:path';

import { BrowserWindow } from 'electron';

import { NodeHandler } from '../types';

/**
 * 简单的 Markdown 转 HTML 转换器
 * 支持基本的 Markdown 语法
 */
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // 代码块
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 标题
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // 斜体
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 处理列表（无序列表和有序列表）
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushList = (): void => {
    if (listItems.length > 0 && listType) {
      const tag = listType === 'ul' ? 'ul' : 'ol';
      processedLines.push(`<${tag}>${listItems.join('')}</${tag}>`);
      listItems = [];
      listType = null;
      inList = false;
    }
  };

  for (const line of lines) {
    const ulMatch = line.match(/^[*\-+] (.+)$/);
    const olMatch = line.match(/^\d+\. (.+)$/);

    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        flushList();
        listType = 'ul';
        inList = true;
      }
      listItems.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (!inList || listType !== 'ol') {
        flushList();
        listType = 'ol';
        inList = true;
      }
      listItems.push(`<li>${olMatch[1]}</li>`);
    } else {
      flushList();
      processedLines.push(line);
    }
  }
  flushList();
  html = processedLines.join('\n');

  // 段落处理：将不在标签内的文本包装成段落
  // 先按双换行分割，但保留 HTML 标签
  const blocks = html.split(/\n\n+/);
  html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      // 如果已经是 HTML 标签（如 <h1>, <ul>, <pre> 等），直接返回
      if (trimmed.startsWith('<')) {
        return trimmed;
      }
      // 否则包装成段落
      return `<p>${trimmed}</p>`;
    })
    .filter((b) => b)
    .join('\n');

  // 单换行转换为 <br>（保留段落和列表结构）
  html = html.replace(/\n/g, '<br>');

  return html;
}

/**
 * 创建渲染 HTML 的完整页面
 */
function createHtmlPage(content: string, width: number, height: number, backgroundColor: string, padding: number): string {
  const htmlContent = content.includes('<') ? content : markdownToHtml(content);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #333;
      background-color: ${backgroundColor};
      padding: ${padding}px;
      width: ${width}px;
      min-height: ${height}px;
      overflow: hidden;
    }
    h1 {
      font-size: 2em;
      margin: 0.67em 0;
      font-weight: bold;
    }
    h2 {
      font-size: 1.5em;
      margin: 0.75em 0;
      font-weight: bold;
    }
    h3 {
      font-size: 1.17em;
      margin: 0.83em 0;
      font-weight: bold;
    }
    p {
      margin: 1em 0;
    }
    ul, ol {
      margin: 1em 0;
      padding-left: 2em;
    }
    li {
      margin: 0.5em 0;
    }
    code {
      background-color: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9em;
    }
    pre {
      background-color: #f4f4f4;
      padding: 1em;
      border-radius: 5px;
      overflow-x: auto;
      margin: 1em 0;
    }
    pre code {
      background-color: transparent;
      padding: 0;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    strong {
      font-weight: bold;
    }
    em {
      font-style: italic;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
}

/**
 * 使用 BrowserWindow 渲染 HTML 并截图
 */
async function renderHtmlToImage(html: string, outputPath: string, width: number, height: number, emit: (event: string, payload?: any) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    let window: BrowserWindow | null = null;

    const cleanup = (): void => {
      if (window && !window.isDestroyed()) {
        window.close();
        window = null;
      }
    };

    try {
      emit('node:progress', { progress: 30, message: '创建渲染窗口...' });

      window = new BrowserWindow({
        width,
        height,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      emit('node:progress', { progress: 50, message: '加载内容...' });

      // 将 HTML 编码为 data URL
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
      window.loadURL(dataUrl);

      window.webContents.once('did-finish-load', async () => {
        emit('node:progress', { progress: 70, message: '渲染页面...' });

        try {
          if (window && !window.isDestroyed()) {
            // 获取实际内容高度
            const contentHeight = await window.webContents.executeJavaScript('document.body.scrollHeight');

            // 如果内容高度超过当前窗口高度，调整窗口大小
            if (contentHeight > height) {
              window.setContentSize(width, contentHeight);
            }
          }
        } catch (err) {
          console.warn('调整窗口大小失败:', err);
        }

        // 等待一小段时间确保内容完全渲染
        setTimeout(() => {
          if (!window || window.isDestroyed()) {
            reject(new Error('窗口已关闭'));
            return;
          }

          emit('node:progress', { progress: 80, message: '截图...' });

          window.webContents
            .capturePage()
            .then((image) => {
              // 根据输出格式选择不同的编码方法
              const format = outputPath.toLowerCase().endsWith('.jpg') || outputPath.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
              const buffer = format === 'jpeg' ? image.toJPEG(90) : image.toPNG();
              fs.writeFileSync(outputPath, buffer);
              cleanup();
              emit('node:progress', { progress: 100, message: '完成' });
              resolve(outputPath);
            })
            .catch((err) => {
              cleanup();
              reject(err);
            });
        }, 500); // 等待 500ms 确保内容渲染完成
      });

      window.webContents.once('did-fail-load', (_, errorCode, errorDescription) => {
        cleanup();
        reject(new Error(`页面加载失败: ${errorDescription} (${errorCode})`));
      });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export const TextToImageNode: NodeHandler = {
  spec: {
    id: 'text/to-image',
    label: '文本转图片',
    category: 'Text',
    description: '将文本（支持 Markdown）渲染成图片',
    backgroundColor: '#10b981',
    icon: 'TbPhoto',
    inputs: [
      {
        key: 'text',
        label: '文本内容',
        type: 'string',
        required: true,
        description: '要渲染的文本内容，支持 Markdown 格式'
      }
    ],
    config: [
      {
        key: 'width',
        label: '图片宽度',
        type: 'number',
        required: false,
        default: 1200,
        description: '生成图片的宽度（像素）',
        inputType: 'number'
      },
      {
        key: 'height',
        label: '图片高度',
        type: 'number',
        required: false,
        default: 800,
        description: '生成图片的高度（像素）',
        inputType: 'number'
      },
      {
        key: 'backgroundColor',
        label: '背景颜色',
        type: 'string',
        required: false,
        default: '#ffffff',
        description: '图片背景颜色（CSS 颜色值，如 #ffffff 或 white）',
        inputType: 'text'
      },
      {
        key: 'padding',
        label: '内边距',
        type: 'number',
        required: false,
        default: 40,
        description: '内容内边距（像素）',
        inputType: 'number'
      },
      {
        key: 'format',
        label: '图片格式',
        type: 'string',
        required: false,
        default: 'png',
        description: '输出图片格式',
        inputType: 'select',
        options: [
          { value: 'png', label: 'PNG' },
          { value: 'jpg', label: 'JPG' }
        ]
      }
    ],
    outputs: [
      {
        key: 'image',
        label: '图片路径',
        type: ['file', 'string'],
        description: '生成的图片文件路径'
      }
    ]
  },
  async run({ input, config, ctx, emit }) {
    const text = String(input.text || '').trim();
    if (!text) {
      throw new Error('缺少文本内容');
    }

    emit('node:progress', { progress: 10, message: '准备渲染...' });

    const width = Number(config?.width || 1200);
    const height = Number(config?.height || 800);
    const backgroundColor = String(config?.backgroundColor || '#ffffff');
    const padding = Number(config?.padding || 40);
    const format = String(config?.format || 'png').toLowerCase();

    // 确保格式有效
    const validFormat = format === 'jpg' || format === 'jpeg' ? 'jpg' : 'png';

    // 生成输出文件路径
    const timestamp = Date.now();
    const filename = `text-to-image-${timestamp}.${validFormat}`;
    const outputPath = path.join(ctx.tmpDir, filename);

    // 确保临时目录存在
    if (!fs.existsSync(ctx.tmpDir)) {
      fs.mkdirSync(ctx.tmpDir, { recursive: true });
    }

    // 创建 HTML 页面
    const html = createHtmlPage(text, width, height, backgroundColor, padding);

    // 渲染为图片
    await renderHtmlToImage(html, outputPath, width, height, emit);

    return {
      image: outputPath
    };
  }
};
