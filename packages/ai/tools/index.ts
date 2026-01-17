/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Mastra 工具定义
 *
 * 这里定义了所有可供 Agent 使用的工具
 * 使用 Mastra 的 createTool 函数创建工具
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

// ============================================================================
// 天气工具
// ============================================================================

function mapWeatherCode(code: number | undefined): string {
  switch (code) {
    case 0:
      return '晴朗';
    case 1:
    case 2:
    case 3:
      return '多云';
    case 45:
    case 48:
      return '有雾';
    case 51:
    case 53:
    case 55:
      return '毛毛雨';
    case 56:
    case 57:
      return '冻毛毛雨';
    case 61:
    case 63:
    case 65:
      return '小到大雨';
    case 66:
    case 67:
      return '冻雨';
    case 71:
    case 73:
    case 75:
      return '小到大雪';
    case 77:
      return '雪粒';
    case 80:
    case 81:
    case 82:
      return '阵雨';
    case 85:
    case 86:
      return '阵雪';
    case 95:
      return '雷暴';
    case 96:
    case 99:
      return '强雷暴';
    default:
      return '未知天气';
  }
}

export const weatherTool = createTool({
  id: 'get-weather',
  description: '查询指定城市的当前天气（基于 Open-Meteo）',
  inputSchema: z.object({
    city: z.string().describe('城市名称（中文或英文）'),
    unit: z.enum(['celsius', 'fahrenheit']).optional().describe('温度单位（默认 celsius）')
  }),
  outputSchema: z.object({
    city: z.string(),
    temperature: z.number(),
    unit: z.string(),
    description: z.string(),
    time: z.string().optional()
  }),
  execute: async ({ context }) => {
    const { city, unit = 'celsius' } = context;
    const cityTrim = city?.trim();
    if (!cityTrim) throw new Error('城市名称不能为空');

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityTrim)}&count=1&language=zh&format=json`;
    const geoResp = await fetch(geoUrl);
    if (!geoResp.ok) throw new Error(`地理编码失败: ${geoResp.status}`);
    const geo = await geoResp.json();
    const hit = geo?.results?.[0];
    if (!hit) throw new Error(`未找到城市: ${cityTrim}`);

    const { latitude, longitude, name } = hit;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=${unit}`;
    const weatherResp = await fetch(weatherUrl);
    if (!weatherResp.ok) throw new Error(`天气查询失败: ${weatherResp.status}`);
    const weather = await weatherResp.json();
    const temp = weather?.current?.temperature_2m;
    const code = weather?.current?.weathercode;
    const time = weather?.current?.time;

    return {
      city: name || cityTrim,
      temperature: typeof temp === 'number' ? temp : Number(temp),
      unit,
      description: mapWeatherCode(code),
      time
    };
  }
});

// ============================================================================
// 时间工具
// ============================================================================

export const timeTool = createTool({
  id: 'get-time',
  description: '获取当前时间和日期',
  inputSchema: z.object({
    format: z.enum(['iso', 'unix', 'readable', 'date', 'time']).optional().describe('返回格式')
  }),
  outputSchema: z.object({
    time: z.union([z.string(), z.number()])
  }),
  execute: async ({ context }) => {
    const now = new Date();
    const format = context?.format || 'readable';

    switch (format) {
      case 'iso':
        return { time: now.toISOString() };
      case 'unix':
        return { time: Math.floor(now.getTime() / 1000) };
      case 'date':
        return { time: now.toLocaleDateString('zh-CN') };
      case 'time':
        return { time: now.toLocaleTimeString('zh-CN') };
      case 'readable':
      default:
        return { time: now.toLocaleString('zh-CN') };
    }
  }
});

// ============================================================================
// 计算器工具
// ============================================================================

export const calculatorTool = createTool({
  id: 'calculator',
  description: '执行数学计算',
  inputSchema: z.object({
    expression: z.string().describe('数学表达式，如 "2 + 3 * 4"')
  }),
  outputSchema: z.object({
    result: z.number(),
    expression: z.string()
  }),
  execute: async ({ context }) => {
    const { expression } = context;
    try {
      // 安全的数学表达式计算（只允许数字和基本运算符）
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      if (sanitized !== expression.replace(/\s/g, '').replace(/\s/g, '') && sanitized.length !== expression.replace(/\s/g, '').length) {
        throw new Error('表达式包含不允许的字符');
      }

      const result = Function(`"use strict"; return (${sanitized})`)();
      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('计算结果无效');
      }
      return { result, expression };
    } catch (error) {
      throw new Error(`计算错误: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});

// ============================================================================
// 导出所有工具
// ============================================================================

export const allTools = {
  weatherTool,
  timeTool,
  calculatorTool
};

/**
 * 获取工具列表（用于传给 Agent）
 */
export function getTools() {
  return allTools;
}

/**
 * 根据名称获取工具
 */
export function getTool(name: string) {
  return (allTools as Record<string, any>)[name];
}
