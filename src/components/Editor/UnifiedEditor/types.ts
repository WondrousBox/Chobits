import type { Editor, EditorEvents } from '@tiptap/react';
import type { ReactNode } from 'react';

import type { MentionItem } from '../extensions';

/**
 * 编辑器模式
 * - full: 完整模式，包含标题输入、BubbleMenu、底部工具栏等
 * - simple: 简洁模式，只显示基本工具栏
 * - mini: 迷你模式，只显示播放控制
 * - readonly: 只读模式，不可编辑
 */
export type EditorMode = 'full' | 'simple' | 'mini' | 'readonly';

/**
 * 工具栏位置
 */
export type ToolbarPosition = 'top' | 'bottom' | 'floating' | 'none';

/**
 * 统一编辑器属性
 */
export interface UnifiedEditorProps {
  /** 编辑器内容（Markdown 或 HTML） */
  content?: string;
  /** 笔记 ID（用于保存） */
  noteId?: string;
  /** 编辑器模式 */
  mode?: EditorMode;
  /** 是否可编辑 */
  editable?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 工具栏位置 */
  toolbarPosition?: ToolbarPosition;
  /** 工具栏右侧自定义内容 */
  toolbarRight?: ReactNode;
  /** 是否显示 BubbleMenu */
  showBubbleMenu?: boolean;
  /** 是否显示播放控制 */
  showPlayerControls?: boolean;
  /** 是否显示截图和标记按钮 */
  showMediaButtons?: boolean;
  /** 内容更新回调（返回 Markdown 格式） */
  onChange?: (content: string) => void;
  /** 完整更新回调（包含编辑器事件） */
  onUpdate?: (e: EditorEvents['update']) => void;
  /** 获取编辑器实例的回调 */
  onEditorReady?: (editor: Editor) => void;
  /** 是否使用 Markdown 模式（输入输出为 Markdown） */
  markdown?: boolean;
  /** 使用完整扩展（包括 slash 命令、mention、代码高亮等）*/
  useFullExtensions?: boolean;
  /** 自定义 Mention 项列表 */
  mentionItems?: MentionItem[];
  /** 自定义 extensions */
  additionalExtensions?: any[];
}

/**
 * 工具栏属性
 */
export interface UnifiedToolbarProps {
  editor: Editor | null;
  visible?: boolean;
  className?: string;
  position?: ToolbarPosition;
  toolbarRight?: ReactNode;
  showMediaButtons?: boolean;
  showPlayerControls?: boolean;
  mini?: boolean;
}
