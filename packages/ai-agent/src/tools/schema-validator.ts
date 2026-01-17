/**
 * JSON Schema 验证器
 *
 * 轻量级 JSON Schema 验证实现
 * 支持基本类型验证和必填字段检查
 */

import type { JSONSchema, JSONSchemaProperty, ValidationResult } from '../types';

/**
 * 验证 JSON Schema
 *
 * @description
 * 轻量级的 JSON Schema 验证实现。
 * 支持基本类型和常见约束的验证。
 * 对于复杂场景，建议使用 ajv 等专业库。
 *
 * @param schema - JSON Schema
 * @param data - 待验证数据
 * @returns 验证结果
 *
 * @example
 * ```typescript
 * const schema: JSONSchema = {
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *     age: { type: 'number' }
 *   },
 *   required: ['name']
 * };
 *
 * const result = validateSchema(schema, { name: 'Alice', age: 25 });
 * // { valid: true }
 * ```
 */
export function validateSchema(schema: JSONSchema, data: unknown): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  // 检查根类型
  if (schema.type !== 'object') {
    return { valid: false, error: 'Schema root type must be object' };
  }

  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Data must be an object' };
  }

  const obj = data as Record<string, unknown>;

  // 检查必填字段
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in obj) || obj[key] === undefined) {
        errors.push({ path: key, message: `Required field '${key}' is missing` });
      }
    }
  }

  // 验证每个属性
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj && obj[key] !== undefined) {
        const propErrors = validateProperty(propSchema, obj[key], key);
        errors.push(...propErrors);
      }
    }
  }

  // 检查额外属性
  if (schema.additionalProperties === false && schema.properties) {
    const allowedKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(obj)) {
      if (!allowedKeys.has(key)) {
        errors.push({ path: key, message: `Unknown property '${key}'` });
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: errors[0].message,
      errors
    };
  }

  return { valid: true };
}

/**
 * 验证单个属性
 */
function validateProperty(schema: JSONSchemaProperty, value: unknown, path: string): Array<{ path: string; message: string }> {
  const errors: Array<{ path: string; message: string }> = [];

  // 类型验证
  const typeValid = validateType(schema.type, value);
  if (!typeValid) {
    errors.push({
      path,
      message: `Expected ${schema.type} for '${path}', got ${typeof value}`
    });
    return errors; // 类型错误直接返回
  }

  // 枚举验证
  if (schema.enum && !schema.enum.includes(value as string)) {
    errors.push({
      path,
      message: `Value for '${path}' must be one of: ${schema.enum.join(', ')}`
    });
  }

  // 字符串约束
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String '${path}' must be at least ${schema.minLength} characters`
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `String '${path}' must be at most ${schema.maxLength} characters`
      });
    }
  }

  // 数字约束
  if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Number '${path}' must be at least ${schema.minimum}`
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        message: `Number '${path}' must be at most ${schema.maximum}`
      });
    }
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      errors.push({
        path,
        message: `Value '${path}' must be an integer`
      });
    }
  }

  // 数组验证
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) => {
        const itemErrors = validateProperty(schema.items!, item, `${path}[${index}]`);
        errors.push(...itemErrors);
      });
    }
  }

  // 嵌套对象验证
  if (schema.type === 'object' && typeof value === 'object' && value !== null) {
    if (schema.properties) {
      const obj = value as Record<string, unknown>;
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj && obj[key] !== undefined) {
          const propErrors = validateProperty(propSchema, obj[key], `${path}.${key}`);
          errors.push(...propErrors);
        }
      }
    }
    if (schema.required) {
      const obj = value as Record<string, unknown>;
      for (const key of schema.required) {
        if (!(key in obj) || obj[key] === undefined) {
          errors.push({
            path: `${path}.${key}`,
            message: `Required field '${path}.${key}' is missing`
          });
        }
      }
    }
  }

  return errors;
}

/**
 * 验证基本类型
 */
function validateType(expectedType: JSONSchemaProperty['type'], value: unknown): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * 创建带验证的工具包装器
 *
 * @param schema - 参数 JSON Schema
 * @returns 验证函数
 */
export function createSchemaValidator(schema: JSONSchema): (params: unknown) => ValidationResult {
  return (params: unknown) => validateSchema(schema, params);
}
