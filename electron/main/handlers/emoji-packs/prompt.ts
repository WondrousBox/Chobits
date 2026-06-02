import { registerSystemPromptEnricher } from '../../../../packages/ai/system-prompt-enricher';
import type { ChatRequest } from '../../../../packages/ai/types';
import { getEmojiPackSettings, listEmojiPacks } from './service';
import type { EmojiPackSummary } from './types';

function formatPackHint(pack: EmojiPackSummary, preferredPackId?: string): string {
  const folderHints = pack.topLevelFolders.slice(0, 8).join('、');
  const preferred = pack.id === preferredPackId ? '，优先使用' : '';
  return `- ${pack.id}${preferred}；${pack.name}；${pack.totalFileCount}张${folderHints ? `；常见话题:${folderHints}` : ''}`;
}

export async function buildEmojiPackPromptSegment(request: ChatRequest): Promise<string | null> {
  if (!request.extras?.emojiPacksEnabled) return null;

  const settings = await getEmojiPackSettings();
  const packs = await listEmojiPacks();
  if (!packs.length) return null;

  const preferredPackId = settings.lastImportedPackId && packs.some((pack) => pack.id === settings.lastImportedPackId) ? settings.lastImportedPackId : packs[0]?.id;
  const packHints = packs
    .slice(0, 4)
    .map((pack) => formatPackHint(pack, preferredPackId))
    .join('\n');

  return [
    '## 主动尝试发送表情包',
    '当回复适合配一张表情包时，调用 `emojiSendTool({ query })`。',
    'query 必须由你根据用户最新消息和你即将回复的内容现场提炼出 2-5 个**用空格分隔**的中文/英文关键词（场景、情绪、动作或代表性物件），例如 "开心 庆祝 撒花"、"猫猫 哭 委屈"、"无语 摊手"。',
    '不要传整段句子作为 query，也不要先调用其他工具——本工具内部会按关键词搜索表情包文件名/目录名，分桶随机挑一张相关的；只有完全搜不到时才会随机兜底。',
    '每轮最多发送 1 张，若该轮不适合配图就跳过工具调用。',
    preferredPackId ? `优先表情包 packId：${preferredPackId}（可选传入限制候选范围）` : '',
    '已导入的表情包：',
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
