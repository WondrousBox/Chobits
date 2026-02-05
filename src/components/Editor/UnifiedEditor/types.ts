import type { Editor, EditorEvents } from '@tiptap/react';
import type { ReactNode } from 'react';

import type { MentionItem } from '../extensions';

/**
 * 工具栏位置
 */
export type ToolbarPosition = 'top' | 'bottom' | 'floating' | 'none';

/**
 * 播放器控制接口 - 用于解耦业务逻辑
 */
export interface PlayerControls {
  /** 播放 */
  play?: () => void;
  /** 暂停 */
  pause?: () => void;
  /** 前进指定秒数 */
  seekForward?: (seconds: number) => void;
  /** 后退指定秒数 */
  seekBackward?: (seconds: number) => void;
  /** 截图 */
  screenshot?: () => void;
  /** 获取当前时间 */
  getCurrentTime?: () => number;
}

/**
 * 图片上传处理函数类型
 */
export type ImageUploadHandler = (file: File) => Promise<string | void>;

/**
 * 统一编辑器属性
 */
export interface UnifiedEditorProps {
  /** 编辑器内容（Markdown 或 HTML） */
  content?: string;
  /** 笔记 ID（用于保存） */
  noteId?: string;
  /** 编辑器模式 */
  readonly?: boolean;
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
  /** 自定义 Mention 项列表 */
  mentionItems?: MentionItem[];
  /** 自定义 extensions */
  additionalExtensions?: any[];
  /** 播放器控制接口 - 用于解耦业务逻辑 */
  playerControls?: PlayerControls;
  /** 图片上传处理函数 */
  onImageUpload?: ImageUploadHandler;
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
  /** 播放器控制接口 - 用于解耦业务逻辑 */
  playerControls?: PlayerControls;
}
