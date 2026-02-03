/**
 * Mention 项的类型定义
 */
export interface MentionItem {
  /** 唯一标识 */
  value: string;
  /** 显示标签 */
  label: string;
  /** 自定义处理函数（可选） */
  onSelect?: (editor: any, range: any) => void;
}

/**
 * 默认的 Mention 项列表（用于完整编辑器/笔记）
 */
export const defaultMentionItems: MentionItem[] = [
  {
    value: 'timestamp',
    label: '视频时间',
    onSelect: (editor, range) => {
      (window as any).AIM?.player?.getCurrentTime?.();
      editor.chain().focus().deleteRange(range).run();
    }
  },
  {
    value: 'screenshot',
    label: '视频截图',
    onSelect: (editor, range) => {
      (window as any).AIM?.player?.screenshot?.();
      editor.chain().focus().deleteRange(range).run();
    }
  }
];

/**
 * 用于资源列表的简化 Mention 项（示例）
 */
export const resourceMentionItems: MentionItem[] = [
  {
    value: 'timestamp',
    label: '⏰ 时间戳',
    onSelect: (editor, range) => {
      const now = new Date();
      const timestamp = `[${now.toLocaleTimeString()}]`;
      editor.chain().focus().deleteRange(range).insertContent(timestamp).run();
    }
  },
  {
    value: 'date',
    label: '📅 日期',
    onSelect: (editor, range) => {
      const now = new Date();
      const date = now.toLocaleDateString();
      editor.chain().focus().deleteRange(range).insertContent(date).run();
    }
  },
  {
    value: 'datetime',
    label: '🕐 日期时间',
    onSelect: (editor, range) => {
      const now = new Date();
      const datetime = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
      editor.chain().focus().deleteRange(range).insertContent(datetime).run();
    }
  },
  {
    value: 'tag',
    label: '🏷️ 标签',
    onSelect: (editor, range) => {
      const tag = prompt('输入标签名称：');
      if (tag) {
        editor.chain().focus().deleteRange(range).insertContent(`#${tag}`).run();
      } else {
        editor.chain().focus().deleteRange(range).run();
      }
    }
  },
  {
    value: 'link',
    label: '🔗 链接',
    onSelect: (editor, range) => {
      const url = prompt('输入链接地址：');
      if (url) {
        const text = prompt('输入链接文本（可选）：') || url;
        editor.chain().focus().deleteRange(range).insertContent(`[${text}](${url})`).run();
      } else {
        editor.chain().focus().deleteRange(range).run();
      }
    }
  },
  {
    value: 'priority',
    label: '⚡ 优先级',
    onSelect: (editor, range) => {
      const priorities = ['🔴 高', '🟡 中', '🟢 低'];
      const choice = prompt(`选择优先级：\n1. ${priorities[0]}\n2. ${priorities[1]}\n3. ${priorities[2]}\n\n请输入数字 1-3：`);
      const index = parseInt(choice || '0') - 1;
      if (index >= 0 && index < priorities.length) {
        editor.chain().focus().deleteRange(range).insertContent(`[${priorities[index]}]`).run();
      } else {
        editor.chain().focus().deleteRange(range).run();
      }
    }
  },
  {
    value: 'status',
    label: '✅ 状态',
    onSelect: (editor, range) => {
      const statuses = ['✅ 完成', '🚧 进行中', '📋 待办', '⏸️ 暂停', '❌ 取消'];
      const choice = prompt(`选择状态：\n1. ${statuses[0]}\n2. ${statuses[1]}\n3. ${statuses[2]}\n4. ${statuses[3]}\n5. ${statuses[4]}\n\n请输入数字 1-5：`);
      const index = parseInt(choice || '0') - 1;
      if (index >= 0 && index < statuses.length) {
        editor.chain().focus().deleteRange(range).insertContent(`[${statuses[index]}]`).run();
      } else {
        editor.chain().focus().deleteRange(range).run();
      }
    }
  },
  {
    value: 'divider',
    label: '➖ 分隔线',
    onSelect: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent('\n\n---\n\n').run();
    }
  }
];
