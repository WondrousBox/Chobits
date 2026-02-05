// 统一从 createExtensions.ts 导出所有扩展相关内容
// 避免重复定义扩展配置

export type { ExtensionOptions } from './createExtensions';
export { createFullExtensions } from './createExtensions';
export type { SlashCommandCommandProps, SlashCommandConfig, SlashCommandItem, SlashCommandItemContext, SlashCommandItems } from './SlashCommand';
export { createSlashCommand, getAICompleteHandler, setAICompleteHandler } from './SlashCommand';
export type { MentionItem, PromptHandler } from './wrappers/mentionItems';
export { createResourceMentionItems, createVideoMentionItems, defaultMentionItems, resourceMentionItems } from './wrappers/mentionItems';
