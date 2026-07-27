import * as fs from 'node:fs';
import * as path from 'node:path';

import { NodeHandler } from '../types';

type Vocabulary = {
  word: string;
  level: string;
  category: string;
  reason: string;
};

type Sentence = {
  english: string;
  chinese: string;
};

/**
 * Create HTML for the learning card
 */
function createLearningCardHtml(vocabulary: Vocabulary[], sentences: Sentence[], width: number, backgroundColor: string): string {
  // Process sentences to highlight vocabulary words
  const processedSentences = sentences.map((s) => {
    let englishHtml = s.english;
    vocabulary.forEach((v) => {
      const regex = new RegExp(`\\b${v.word}\\b`, 'gi');
      englishHtml = englishHtml.replace(regex, `<span class="highlight">${v.word}</span>`);
    });
    return {
      ...s,
      englishHtml
    };
  });

  const vocabListHtml = vocabulary
    .map(
      (v) => `
    <div class="vocab-item">
      <div class="vocab-header">
        <span class="vocab-word">${v.word}</span>
        <span class="vocab-tags">
          <span class="tag level">${v.level}</span>
          <span class="tag category">${v.category}</span>
        </span>
      </div>
      <div class="vocab-reason">${v.reason}</div>
    </div>
  `
    )
    .join('');

  const sentencesHtml = processedSentences
    .map(
      (s) => `
    <div class="sentence-item">
      <div class="english">${s.englishHtml}</div>
      <div class="chinese">${s.chinese}</div>
    </div>
  `
    )
    .join('');

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
      background-color: ${backgroundColor};
      padding: 40px;
      width: ${width}px;
      color: #333;
      padding: 0;
      margin: 0;
      overflow: hidden;
    }
    .card {
      background: white;
      overflow: hidden;
      padding: 20px;
    }
    .header {
      margin-bottom: 30px;
      border-bottom: 2px solid #f0f0f0;
      padding-bottom: 20px;
    }
    .title {
      font-size: 24px;
      font-weight: bold;
      color: #1a1a1a;
    }
    
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #666;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .sentences-container {
      margin-bottom: 40px;
    }
    .sentence-item {
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .english {
      font-size: 18px;
      color: #2c3e50;
    }
    .chinese {
      margin-bottom: 20px;
      font-size: 16px;
      color: #7f8c8d;
    }
    .highlight {
      color: #e67e22;
      font-weight: bold;
      background-color: rgba(230, 126, 34, 0.1);
      padding: 0 4px;
      border-radius: 4px;
    }

    .vocab-container {
      background-color: #f9f9f9;
      border-radius: 12px;
      padding: 24px;
    }
    .vocab-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .vocab-item {
      background: white;
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #eee;
    }
    .vocab-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .vocab-word {
      font-size: 18px;
      font-weight: bold;
      color: #e67e22;
    }
    .vocab-tags {
      display: flex;
      gap: 6px;
    }
    .tag {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 12px;
    }
    .tag.level {
      background-color: #e1f5fe;
      color: #0288d1;
    }
    .tag.category {
      background-color: #f3e5f5;
      color: #7b1fa2;
    }
    .vocab-reason {
      font-size: 14px;
      color: #555;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="title">English Learning Card</div>
    </div>

    <div class="sentences-container">
      <div class="section-title">Content</div>
      ${sentencesHtml}
    </div>

    <div class="vocab-container">
      <div class="section-title">Key Vocabulary</div>
      <div class="vocab-grid">
        ${vocabListHtml}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export const GenerateLearningCardNode: NodeHandler = {
  spec: {
    id: 'image/generate-learning-card',
    label: '生成英语学习卡片',
    category: 'Image',
    description: '根据词汇表和句子生成英语学习卡片图片',
    backgroundColor: '#8e44ad',
    icon: 'TbPhoto',
    inputs: [
      {
        key: 'vocabulary',
        label: '词汇表 (JSON)',
        type: ['array', 'object'],
        required: true,
        description: '包含 word, level, category, reason 的词汇列表'
      },
      {
        key: 'sentences',
        label: '句子列表 (JSON)',
        type: ['array', 'object'],
        required: true,
        description: '包含 english, chinese 的句子列表'
      }
    ],
    config: [
      {
        key: 'width',
        label: '图片宽度',
        type: 'number',
        required: false,
        default: 800,
        description: '生成图片的宽度（像素）',
        inputType: 'number'
      },
      {
        key: 'backgroundColor',
        label: '背景颜色',
        type: 'string',
        required: false,
        default: '#f0f2f5',
        description: '图片背景颜色',
        inputType: 'text'
      }
    ],
    outputs: [
      {
        key: 'image',
        label: '图片路径',
        type: 'file',
        description: '生成的图片文件路径'
      },
      {
        key: 'html',
        label: 'HTML路径',
        type: 'file',
        description: '生成的HTML文件路径'
      }
    ]
  },
  async run({ input, config, ctx, emit }) {
    const vocabulary = input.vocabulary as Vocabulary[];
    const sentences = input.sentences as Sentence[];

    if (!Array.isArray(vocabulary)) {
      throw new Error('词汇表必须是数组');
    }
    if (!Array.isArray(sentences)) {
      console.log(sentences);

      throw new Error('句子列表必须是数组');
    }

    emit('node:progress', { progress: 10, message: 'Preparing data...' });

    const width = Number(config?.width || 800);
    const backgroundColor = String(config?.backgroundColor || '#f0f2f5');

    const timestamp = Date.now();
    const filename = `learning-card-${timestamp}.png`;
    const htmlFilename = `learning-card-${timestamp}.html`;
    const outputPath = path.join(ctx.tmpDir, filename);
    const htmlOutputPath = path.join(ctx.tmpDir, htmlFilename);

    if (!fs.existsSync(ctx.tmpDir)) {
      fs.mkdirSync(ctx.tmpDir, { recursive: true });
    }

    const html = createLearningCardHtml(vocabulary, sentences, width, backgroundColor);
    fs.writeFileSync(htmlOutputPath, html);

    const renderHtmlScreenshot = ctx.services?.renderHtmlScreenshot;
    if (!renderHtmlScreenshot) throw new Error('工作流 HTML 截图服务未配置');
    const progressMessages: Record<number, string> = {
      30: 'Creating render window...',
      50: 'Loading content...',
      70: 'Rendering page...',
      80: 'Capturing...',
      100: 'Done'
    };
    await renderHtmlScreenshot({
      html,
      outputPath,
      width,
      height: 800,
      contentHeightMode: 'exact',
      signal: ctx.signal,
      onProgress: (progress) => emit('node:progress', { progress, message: progressMessages[progress] })
    });

    return {
      image: outputPath,
      html: htmlOutputPath
    };
  }
};
