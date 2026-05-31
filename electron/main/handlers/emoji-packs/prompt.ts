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
    'query 必须由你根据用户最新消息和你即将回复的内容现场提炼出 2-5 个**用空格分隔**的关键词，**优先具体的动作 / 拟声 / 物件 / 网络梗词**，避免只用抽象情绪：',
    '- 推荐：「哭 委屈 猫」「哈哈 笑死 拍桌」「摆烂 躺平」「点头 同意 好的」「鞠躬 谢谢」「问号 黑人问号」「奥利给 加油」',
    '- 不推荐：「开心」「难过」「生气」这种只有单个抽象情绪的 query（命中率低）',
    '工具内部会按关键词在表情包文件名/目录名上模糊匹配，并对常见同义词（开心↔笑/哈哈，难过↔哭，无语↔白眼…）自动扩展，分桶随机挑一张相关的。',
    '若工具返回 `success:false` 并附带 `sampleTitles`，说明这组关键词没有匹配——你可以参考 sampleTitles 中真实存在的表情风格，换一组更贴近的关键词重试一次；仍无合适表情时直接跳过即可，**不要硬发不相关的图**。',
    '每轮最多发送 1 张，若该轮内容不适合配图就跳过工具调用。',
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
