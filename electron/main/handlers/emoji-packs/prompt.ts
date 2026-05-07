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
    '## 表情包回复能力',
    '用户已开启表情包回复模式。普通闲聊、庆祝、调侃、共鸣时，可以用表情包工具找一张贴切表情随回复发送。',
    '优先用 `emojiSearchTool` 按当前语义/情绪搜索少量候选；需要浏览目录时，用 `emojiListTool` 渐进式发现：先列包/一级目录，再进入相关目录。不要为了猜关键词反复调用工具。',
    '每轮最多发送 1 张表情包；严肃、敏感、用户不想要图片，或回复只需极短确认时可以不发。只能用工具结果或下方概览中出现的 packId，并且必须原样传入工具。',
    preferredPackId ? `优先表情包 packId：${preferredPackId}` : '',
    '已导入表情包概览：',
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
