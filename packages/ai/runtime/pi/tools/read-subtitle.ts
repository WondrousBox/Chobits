import fs from 'node:fs/promises';
import path from 'node:path';

import { parser } from '@aim-packages/subtitle';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const readSubtitleParameters = Type.Object({
  resourceId: Type.String({ description: '要读取的字幕资源 ID' })
});

type SubtitleSegmentPreview = {
  index: number;
  text: string;
};

function isSubtitlePath(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return lowerPath.endsWith('.srt') || lowerPath.endsWith('.vtt') || lowerPath.endsWith('.ass') || lowerPath.endsWith('.ssa');
}

function resolveSubtitleFormat(filePath: string): 'SRT' | 'VTT' | 'ASS' | 'SSA' {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.vtt')) return 'VTT';
  if (lowerPath.endsWith('.ass')) return 'ASS';
  if (lowerPath.endsWith('.ssa')) return 'SSA';
  return 'SRT';
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  return {};
}

export function createPiReadSubtitleTool(toolContext: PiSessionToolContext): ToolDefinition<typeof readSubtitleParameters> {
  return {
    name: 'readSubtitleTool',
    label: 'readSubtitleTool',
    description: `读取字幕文件的基本信息和前几条内容预览。适合确认字幕资源是否正确，或在翻译、总结前快速检查文件。`,
    parameters: readSubtitleParameters,
    async execute(_toolCallId, { resourceId }, signal) {
      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }

      try {
        const resource = await toolContext.resourcesRepo.getById(resourceId);
        if (!resource?.filePath) {
          return createJsonToolResult({
            success: false,
            error: `资源 ${resourceId} 不存在或没有文件路径`
          });
        }

        if (!isSubtitlePath(resource.filePath)) {
          return createJsonToolResult({
            success: false,
            error: `资源 ${resourceId} 不是字幕文件（支持 .srt、.vtt、.ass、.ssa）`
          });
        }

        const fileContent = await fs.readFile(resource.filePath, 'utf8');

        if (signal?.aborted) {
          throw new Error('Operation aborted');
        }

        const parsedResult = await parser.parseSubtitle(fileContent);
        const segments: SubtitleSegmentPreview[] = Array.isArray(parsedResult?.segments)
          ? parsedResult.segments.map((segment: any, index: number) => ({
              index,
              text: segment.text
            }))
          : [];

        if (!segments.length) {
          return createJsonToolResult({
            success: false,
            error: `字幕文件中没有找到可用片段: ${resource.filePath}`
          });
        }

        const metadata = parseMetadata(resource.metadata);

        return createJsonToolResult({
          success: true,
          resourceId,
          fileName: resource.title || path.basename(resource.filePath),
          segmentCount: segments.length,
          preview: segments.slice(0, 3),
          metadata: {
            format: resolveSubtitleFormat(resource.filePath),
            sourceLanguage: String(metadata.sourceLanguage || metadata.language || 'unknown')
          }
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || '读取字幕文件失败'
        });
      }
    }
  };
}
