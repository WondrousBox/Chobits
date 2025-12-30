import { JsonOutputParser as OldJsonOutputParser } from '@langchain/core/output_parsers';

export function parseJsonMarkdown(s: string, parser = parsePartialJson): any {
  s = s.trim();

  const firstFenceIndex = s.indexOf('```');
  if (firstFenceIndex === -1) {
    return parser(s);
  }

  let contentAfterFence = s.substring(firstFenceIndex + 3);

  if (contentAfterFence.startsWith('json\n')) {
    contentAfterFence = contentAfterFence.substring(5);
  } else if (contentAfterFence.startsWith('json')) {
    contentAfterFence = contentAfterFence.substring(4);
  } else if (contentAfterFence.startsWith('\n')) {
    contentAfterFence = contentAfterFence.substring(1);
  }

  const closingFenceIndex = contentAfterFence.indexOf('```');
  let finalContent = contentAfterFence;
  if (closingFenceIndex !== -1) {
    finalContent = contentAfterFence.substring(0, closingFenceIndex);
  }

  return parser(finalContent.trim());
}

// Adapted from https://github.com/KillianLucas/open-interpreter/blob/main/interpreter/core/llm/utils/parse_partial_json.py
// MIT License
export function parsePartialJson(s: string): any {
  // If the input is undefined, return null to indicate failure.
  if (typeof s === 'undefined') {
    return null;
  }

  // Attempt to parse the string as-is.
  try {
    return JSON.parse(s);
  } catch (_error: any) {
    // Pass
  }

  // Initialize variables.
  let new_s = '';
  const stack = [];
  let isInsideString = false;
  let escaped = false;

  // Process each character in the string one at a time.
  for (let char of s) {
    if (isInsideString) {
      if (char === '"' && !escaped) {
        isInsideString = false;
      } else if (char === '\n' && !escaped) {
        char = '\\n'; // Replace the newline character with the escape sequence.
      } else if (char === '\\') {
        escaped = !escaped;
      } else {
        escaped = false;
      }
    } else {
      if (char === '"') {
        isInsideString = true;
        escaped = false;
      } else if (char === '{') {
        stack.push('}');
      } else if (char === '[') {
        stack.push(']');
      } else if (char === '}' || char === ']') {
        if (stack && stack[stack.length - 1] === char) {
          stack.pop();
        } else {
          // Mismatched closing character; the input is malformed.
          return null;
        }
      }
    }

    // Append the processed character to the new string.
    new_s += char;
  }

  // If we're still inside a string at the end of processing,
  // we need to close the string.
  if (isInsideString) {
    new_s += '"';
  }

  // Close any remaining open structures in the reverse order that they were opened.
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    new_s += stack[i];
  }

  // Attempt to parse the modified string as JSON.
  try {
    return JSON.parse(new_s);
  } catch (_error: any) {
    // If we still can't parse the string as JSON, return null to indicate failure.
    return null;
  }
}

export class PatchedJsonOutputParser<T extends Record<string, any> = Record<string, any>> extends OldJsonOutputParser<T> {
  // 只重写 parsePartialResult，其他方法继承旧版
  async parsePartialResult(generations: { text: string }[]): Promise<T | undefined> {
    const text = generations[0]?.text ?? '';
    // 1) 优先尝试 fenced JSON 或直接 JSON 的部分解析
    const parsed = parseJsonMarkdown(text, parsePartialJson);
    if (parsed) return parsed as T;
    // 2) 退而求其次：从首个 { 或 [ 起截取，尝试解析片段
    const i1 = text.indexOf('{');
    const i2 = text.indexOf('[');
    const start = i1 === -1 ? i2 : i2 === -1 ? i1 : Math.min(i1, i2);
    if (start !== -1) {
      const candidate = text.slice(start);
      const parsed2 = parsePartialJson(candidate);
      if (parsed2) return parsed2 as T;
    }
    // 3) 无法解析时，返回 undefined 以等待更多增量
    return undefined;
  }
}
