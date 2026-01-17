/**
 * 内置工具集合
 *
 * 提供一些常用的内置工具
 */

import type { Tool } from './tool';
import { createTool } from './tool';

/**
 * 获取当前时间工具
 *
 * @description
 * 返回当前时间，支持多种格式。
 *
 * @example
 * ```typescript
 * tools.register(GetTimeTool);
 * const result = await tools.execute('get_time', { format: 'iso' });
 * // { time: '2026-01-16T10:00:00.000Z' }
 * ```
 */
export const GetTimeTool: Tool = createTool<{ format?: 'iso' | 'unix' | 'readable' | 'date' | 'time' }, { time: string | number; timezone?: string }>({
  name: 'get_time',
  description: '获取当前时间和日期。可以指定返回格式：iso（ISO 8601 格式）、unix（Unix 时间戳）、readable（人类可读格式）、date（仅日期）、time（仅时间）',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['iso', 'unix', 'readable', 'date', 'time'],
        description: '返回格式，默认为 iso'
      }
    }
  },
  async execute(params) {
    const now = new Date();
    const format = params?.format || 'iso';

    switch (format) {
      case 'iso':
        return { time: now.toISOString() };
      case 'unix':
        return { time: Math.floor(now.getTime() / 1000) };
      case 'readable':
        return {
          time: now.toLocaleString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
      case 'date':
        return {
          time: now.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
          })
        };
      case 'time':
        return {
          time: now.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })
        };
      default:
        return { time: now.toISOString() };
    }
  }
});

/**
 * 计算器工具
 *
 * @description
 * 执行基本数学运算。
 * 注意：这里使用安全的方式进行计算，不使用 eval。
 */
export const CalculatorTool: Tool = createTool<{ operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'mod'; a: number; b?: number }, { result: number; expression: string }>({
  name: 'calculator',
  description: '执行数学计算。支持的操作：add（加）、subtract（减）、multiply（乘）、divide（除）、power（幂）、sqrt（平方根）、mod（取模）',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide', 'power', 'sqrt', 'mod'],
        description: '计算操作类型'
      },
      a: {
        type: 'number',
        description: '第一个操作数'
      },
      b: {
        type: 'number',
        description: '第二个操作数（sqrt 操作不需要）'
      }
    },
    required: ['operation', 'a']
  },
  async execute(params) {
    const { operation, a, b } = params;
    let result: number;
    let expression: string;

    switch (operation) {
      case 'add':
        if (b === undefined) throw new Error('Operation "add" requires parameter b');
        result = a + b;
        expression = `${a} + ${b} = ${result}`;
        break;
      case 'subtract':
        if (b === undefined) throw new Error('Operation "subtract" requires parameter b');
        result = a - b;
        expression = `${a} - ${b} = ${result}`;
        break;
      case 'multiply':
        if (b === undefined) throw new Error('Operation "multiply" requires parameter b');
        result = a * b;
        expression = `${a} × ${b} = ${result}`;
        break;
      case 'divide':
        if (b === undefined) throw new Error('Operation "divide" requires parameter b');
        if (b === 0) throw new Error('Division by zero');
        result = a / b;
        expression = `${a} ÷ ${b} = ${result}`;
        break;
      case 'power':
        if (b === undefined) throw new Error('Operation "power" requires parameter b');
        result = Math.pow(a, b);
        expression = `${a}^${b} = ${result}`;
        break;
      case 'sqrt':
        if (a < 0) throw new Error('Cannot calculate square root of negative number');
        result = Math.sqrt(a);
        expression = `√${a} = ${result}`;
        break;
      case 'mod':
        if (b === undefined) throw new Error('Operation "mod" requires parameter b');
        if (b === 0) throw new Error('Modulo by zero');
        result = a % b;
        expression = `${a} mod ${b} = ${result}`;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return { result, expression };
  },
  validate(params) {
    const p = params as { operation?: string; a?: number; b?: number };
    if (!p.operation) {
      return { valid: false, error: 'Missing operation' };
    }
    if (typeof p.a !== 'number') {
      return { valid: false, error: 'Parameter a must be a number' };
    }
    const requiresB = ['add', 'subtract', 'multiply', 'divide', 'power', 'mod'];
    if (requiresB.includes(p.operation) && typeof p.b !== 'number') {
      return { valid: false, error: `Operation "${p.operation}" requires parameter b` };
    }
    return { valid: true };
  }
});

/**
 * 随机数生成器工具
 */
export const RandomTool: Tool = createTool<{ min?: number; max?: number; count?: number; type?: 'integer' | 'float' }, { numbers: number[]; range: string }>({
  name: 'random',
  description: '生成随机数。可以指定范围、数量和类型（整数或浮点数）',
  parameters: {
    type: 'object',
    properties: {
      min: {
        type: 'number',
        description: '最小值（默认 0）'
      },
      max: {
        type: 'number',
        description: '最大值（默认 100）'
      },
      count: {
        type: 'integer',
        description: '生成数量（默认 1）',
        minimum: 1,
        maximum: 100
      },
      type: {
        type: 'string',
        enum: ['integer', 'float'],
        description: '数字类型（默认 integer）'
      }
    }
  },
  async execute(params) {
    const min = params?.min ?? 0;
    const max = params?.max ?? 100;
    const count = Math.min(params?.count ?? 1, 100);
    const type = params?.type ?? 'integer';

    const numbers: number[] = [];
    for (let i = 0; i < count; i++) {
      const random = Math.random() * (max - min) + min;
      numbers.push(type === 'integer' ? Math.floor(random) : Number(random.toFixed(6)));
    }

    return {
      numbers,
      range: `[${min}, ${max}]`
    };
  }
});

/**
 * 字符串处理工具
 */
export const StringTool: Tool = createTool<
  {
    operation: 'length' | 'uppercase' | 'lowercase' | 'reverse' | 'trim' | 'split' | 'replace';
    text: string;
    pattern?: string;
    replacement?: string;
    delimiter?: string;
  },
  { result: string | number | string[] }
>({
  name: 'string_tool',
  description: '字符串处理工具。支持的操作：length（长度）、uppercase（大写）、lowercase（小写）、reverse（反转）、trim（去空格）、split（分割）、replace（替换）',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['length', 'uppercase', 'lowercase', 'reverse', 'trim', 'split', 'replace'],
        description: '操作类型'
      },
      text: {
        type: 'string',
        description: '要处理的文本'
      },
      pattern: {
        type: 'string',
        description: '替换操作的匹配模式'
      },
      replacement: {
        type: 'string',
        description: '替换操作的替换文本'
      },
      delimiter: {
        type: 'string',
        description: '分割操作的分隔符'
      }
    },
    required: ['operation', 'text']
  },
  async execute(params) {
    const { operation, text, pattern, replacement, delimiter } = params;

    switch (operation) {
      case 'length':
        return { result: text.length };
      case 'uppercase':
        return { result: text.toUpperCase() };
      case 'lowercase':
        return { result: text.toLowerCase() };
      case 'reverse':
        return { result: text.split('').reverse().join('') };
      case 'trim':
        return { result: text.trim() };
      case 'split':
        return { result: text.split(delimiter || ' ') };
      case 'replace':
        if (!pattern) throw new Error('Replace operation requires pattern');
        return { result: text.replace(new RegExp(pattern, 'g'), replacement || '') };
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
});

/**
 * JSON 处理工具
 */
export const JsonTool: Tool = createTool<
  {
    operation: 'parse' | 'stringify' | 'get' | 'keys' | 'values';
    data: string | object;
    path?: string;
    indent?: number;
  },
  { result: unknown }
>({
  name: 'json_tool',
  description: 'JSON 处理工具。支持的操作：parse（解析）、stringify（序列化）、get（获取路径值）、keys（获取键）、values（获取值）',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['parse', 'stringify', 'get', 'keys', 'values'],
        description: '操作类型'
      },
      data: {
        type: 'string',
        description: 'JSON 字符串或对象'
      },
      path: {
        type: 'string',
        description: '获取值的路径（如 "user.name"）'
      },
      indent: {
        type: 'integer',
        description: '序列化时的缩进空格数',
        minimum: 0,
        maximum: 8
      }
    },
    required: ['operation', 'data']
  },
  async execute(params) {
    const { operation, data, path, indent } = params;

    let obj: unknown;
    if (typeof data === 'string') {
      try {
        obj = JSON.parse(data);
      } catch {
        obj = data;
      }
    } else {
      obj = data;
    }

    switch (operation) {
      case 'parse':
        if (typeof data !== 'string') {
          return { result: data };
        }
        return { result: JSON.parse(data) };

      case 'stringify':
        return { result: JSON.stringify(obj, null, indent ?? 2) };

      case 'get':
        if (!path) throw new Error('Get operation requires path');
        const keys = path.split('.');
        let value: unknown = obj;
        for (const key of keys) {
          if (value === null || value === undefined) {
            return { result: undefined };
          }
          value = (value as Record<string, unknown>)[key];
        }
        return { result: value };

      case 'keys':
        if (typeof obj !== 'object' || obj === null) {
          throw new Error('Data must be an object');
        }
        return { result: Object.keys(obj) };

      case 'values':
        if (typeof obj !== 'object' || obj === null) {
          throw new Error('Data must be an object');
        }
        return { result: Object.values(obj) };

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
});

/**
 * 所有内置工具
 */
export const BuiltinTools: Tool[] = [GetTimeTool, CalculatorTool, RandomTool, StringTool, JsonTool];
