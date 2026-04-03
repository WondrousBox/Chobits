/**
 * Pi Profiles — 从 profiles.md 解析 profile 元数据与系统提示
 *
 * 与 toolbox.md 相同：通过 Vite `?raw` 加载 Markdown，编辑 md 即可调整行为。
 */

import type { PiExecutionMode, PiProfileDescriptor, PiToolInjectionMode } from './contracts';
import { DEFAULT_CODER_TOOL_IDS, INITIAL_ACTIVE_SESSION_TOOL_IDS, normalizePiToolIds } from './tool-registry';

// `**label:** 值`（key 后为 `:**`，与 toolbox 的 `**触发词：**` 不同）
const META_LINE = /^\*\*([a-zA-Z][a-zA-Z0-9]*):\*\*\s*(.*)$/;

function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function resolveDefaultToolIds(raw: string): string[] {
  const s = raw.trim();
  if (!s || s === '-' || s === '—') return [];
  if (s === '@session') return [...INITIAL_ACTIVE_SESSION_TOOL_IDS];
  if (s === '@coder') return [...DEFAULT_CODER_TOOL_IDS];
  return normalizePiToolIds(
    s
      .split(/[,，;；]+/)
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

function parseExecutionMode(raw: string): PiExecutionMode {
  const v = raw.trim().toLowerCase();
  if (v === 'one-shot' || v === 'oneshot') return 'one-shot';
  return 'session';
}

function parseToolInjectionMode(raw: string | undefined): PiToolInjectionMode {
  if (!raw) return 'dynamic';
  const v = raw.trim().toLowerCase();
  if (v === 'all') return 'all';
  return 'dynamic';
}

/**
 * 解析 `profiles.md` 全文，返回 id → descriptor。
 *
 * 约定：
 * - 每个 profile 以 `## profile:<id>` 开头（id 即 profile id）。instructions 内可自由使用 `##` 标题。
 * - 元数据行：`**label:**`、`**description:**`、`**executionMode:**`、`**supportsToolCalls:**`、`**defaultToolIds:**`
 * - `**defaultToolIds:**` 可为 `@session`、`@coder`（与 tool-registry 常量一致），或逗号分隔的 tool id
 * - 正文：在 `### system prompt` 标题之下的全部内容作为 instructions（trim 后不得为空）
 */
export function parseProfilesMarkdown(markdown: string): Record<string, PiProfileDescriptor> {
  const lines = markdown.split('\n');
  const sections: { id: string; start: number; end: number }[] = [];

  const profileHeading = /^##\s+profile:\s*(.+)$/i;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(profileHeading);
    if (m) {
      const id = m[1].trim();
      if (sections.length) {
        sections[sections.length - 1].end = i;
      }
      sections.push({ id, start: i + 1, end: lines.length });
    }
  }

  const out: Record<string, PiProfileDescriptor> = {};

  for (const sec of sections) {
    const bodyLines = lines.slice(sec.start, sec.end);
    const body = bodyLines.join('\n');

    const sysHeading = /^###\s+system prompt\s*$/m;
    const match = sysHeading.exec(body);
    let metaBlock: string;
    let instructionsBlock: string;

    if (match) {
      metaBlock = body.slice(0, match.index).trimEnd();
      instructionsBlock = body.slice(match.index + match[0].length).trim();
    } else {
      metaBlock = body;
      instructionsBlock = '';
    }

    const meta: Record<string, string> = {};
    for (const line of metaBlock.split('\n')) {
      const lm = line.match(META_LINE);
      if (lm) {
        meta[lm[1].toLowerCase()] = lm[2].trim();
      }
    }

    const label = meta.label || sec.id;
    const description = meta.description || undefined;
    const executionMode = parseExecutionMode(meta.executionmode || 'session');
    const supportsToolCalls = meta.supportstoolcalls ? parseBool(meta.supportstoolcalls) : false;
    const defaultToolIds = resolveDefaultToolIds(meta.defaulttoolids || '');
    const toolInjectionMode = parseToolInjectionMode(meta.toolinjectionmode);

    if (!instructionsBlock) {
      throw new Error(`[profiles.md] Profile "${sec.id}" is missing "### system prompt" section or instructions body is empty.`);
    }

    out[sec.id] = {
      id: sec.id,
      label,
      description,
      instructions: instructionsBlock,
      defaultToolIds,
      executionMode,
      supportsToolCalls,
      toolInjectionMode
    };
  }

  return out;
}
