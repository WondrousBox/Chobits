import type { NodeHandler, PortSchema } from '@chobits/workflow';

import { PADDLE_OCR_MODEL_SPECS, PADDLE_OCR_PLUGIN_ID } from '../../../../ocr/paddle-ocr-models';
import { WORKFLOW_OCR } from '../../capabilities/ocr';

const MODEL_OPTIONS = Object.values(PADDLE_OCR_MODEL_SPECS).map((spec) => ({
  value: spec.name,
  label: spec.displayName,
  description: spec.description
}));

const config: PortSchema[] = [
  {
    key: 'model',
    label: '模型',
    type: 'string',
    inputType: 'select',
    options: MODEL_OPTIONS,
    default: 'ppocr-v6-small',
    required: true
  },
  {
    key: 'strategy',
    label: '识别策略',
    type: 'string',
    inputType: 'select',
    options: [
      { value: 'per-box', label: '逐框识别', description: '准确率优先' },
      { value: 'per-line', label: '逐行识别', description: '速度和准确率平衡' },
      { value: 'cross-line', label: '跨行批处理', description: '密集文本速度优先' }
    ],
    default: 'per-box'
  },
  {
    key: 'processingEngine',
    label: '图像处理',
    type: 'string',
    inputType: 'select',
    options: [
      { value: 'opencv', label: 'OpenCV', description: '默认，检测更准' },
      { value: 'canvas-native', label: 'Canvas', description: '依赖更轻，作为兼容回退' }
    ],
    default: 'opencv'
  },
  {
    key: 'maxSideLength',
    label: '最长边',
    type: 'number',
    inputType: 'number',
    default: 640,
    description: '检测阶段缩放后的最长边像素'
  },
  {
    key: 'noCache',
    label: '跳过缓存',
    type: 'boolean',
    default: false
  }
];

export const PaddleOCRNode: NodeHandler = {
  spec: {
    id: 'image/paddle-ocr',
    label: 'Paddle 文字识别',
    category: 'Image',
    description: '基于 PaddleOCR 的本地图片文字识别',
    backgroundColor: '#06b6d4',
    icon: 'TbScan',
    requires: [PADDLE_OCR_PLUGIN_ID],
    inputs: [{ key: 'image', label: '图片路径', type: ['file', 'string'], required: true }],
    config,
    outputs: [
      { key: 'text', label: '识别文本', type: 'string' },
      { key: 'results', label: '识别结果', type: 'array' },
      { key: 'confidence', label: '置信度', type: 'number' },
      { key: 'modelName', label: '模型名称', type: 'string' }
    ]
  },
  requiredCapabilities: [WORKFLOW_OCR],
  execution: { group: 'ocr' },
  async run({ input, config: nodeConfig, ctx, emit, capabilities }) {
    const imagePath = String(input.image || '');
    emit('node:progress', { progress: 5, message: '检查 OCR 模型...' });

    const noCacheRaw = nodeConfig?.noCache;
    const noCache = noCacheRaw === true || noCacheRaw === 'true';

    emit('node:progress', { progress: 20, message: '加载 OCR runtime...' });
    const result = await capabilities.require(WORKFLOW_OCR).recognizeWithPaddleOcr(imagePath, ctx.pluginResourceManager, {
      model: String(nodeConfig?.model || 'ppocr-v6-small'),
      strategy: nodeConfig?.strategy as any,
      processingEngine: nodeConfig?.processingEngine as any,
      maxSideLength: nodeConfig?.maxSideLength,
      noCache,
      flatten: true
    });

    emit('node:progress', { progress: 100, message: 'OCR 完成' });

    return {
      text: result.text,
      results: result.results,
      confidence: result.confidence,
      modelName: result.model.modelName
    };
  }
};
