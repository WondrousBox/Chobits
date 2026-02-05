// 统一从 createExtensions.ts 导出所有扩展相关内容
// 避免重复定义扩展配置

export { createFullExtensions, extensions } from './createExtensions';
export type { MentionItem } from './wrappers/mentionItems';
export { createVideoMentionItems, defaultMentionItems, resourceMentionItems } from './wrappers/mentionItems';
