/**
 * 统一富文本编辑器组件
 *
 * 整合了完整编辑器（笔记 Tab）和简洁编辑器（资源列表空白页）的功能，
 * 提供统一的 API 和可配置的显示模式。
 */
export type { AICompletionCallbacks, AICompletionContext, AICompletionHandler, ToolbarPosition, UnifiedEditorProps, UnifiedToolbarProps } from './types';
export { default, UnifiedEditor } from './UnifiedEditor';
export { UnifiedToolbar } from './UnifiedToolbar';
