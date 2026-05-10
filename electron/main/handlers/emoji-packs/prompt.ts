import { registerSystemPromptEnricher } from '../../../../packages/ai/system-prompt-enricher';
import type { ChatRequest } from '../../../../packages/ai/types';
import { getEmojiPackSettings, listEmojiPacks } from './service';
import type { EmojiPackSummary } from './types';

function formatTopLevelHints(pack: EmojiPackSummary, preferredPackId?: string): string {
  const folderHints = pack.topLevelFolders.slice(0, 16).join('、');
  const fileHints = pack.topLevelFiles.slice(0, 6).join('、');
  const hints = [folderHints ? `目录:${folderHints}` : '', fileHints ? `根图:${fileHints}` : ''].filter(Boolean).join('；');
  const preferred = pack.id === preferredPackId ? '，优先使用' : '';
  return `- ${pack.id}${preferred}；${pack.name}；${pack.totalFileCount}张${hints ? `；${hints}` : ''}`;
}

export async function buildEmojiPackPromptSegment(request: ChatRequest): Promise<string | null> {
  if (!request.extras?.emojiPacksEnabled) return null;

  const settings = await getEmojiPackSettings();
  const packs = await listEmojiPacks();
  if (!packs.length) return null;

  const preferredPackId = settings.lastImportedPackId && packs.some((pack) => pack.id === settings.lastImportedPackId) ? settings.lastImportedPackId : packs[0]?.id;
  const packHints = packs
    .slice(0, 4)
    .map((pack) => formatTopLevelHints(pack, preferredPackId))
    .join('\n');

  return [
    '## 主动尝试发送表情包',
    '必须从下面挑一个合适目录，直接用 `emojiListTool({ packId, relativePath })` 列出该目录候选，再用 `emojiSendTool({ candidateId })` 发送。',
    '只能用工具结果或下方概览中出现的 packId，并且必须原样传入工具。',
    preferredPackId ? `优先表情包 packId：${preferredPackId}` : '',
    '表情包概览：',
    packHints
  ]
    .filter(Boolean)
    .join('\n');
}

export function registerEmojiPackPromptEnricher(): void {
  registerSystemPromptEnricher({
    id: 'emoji-packs',
    resolve: ({ request }) => buildEmojiPackPromptSegment(request)
  });
}
