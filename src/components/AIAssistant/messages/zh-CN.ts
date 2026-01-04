import { MessageCatalog, MessageCategory, MessageProducer, MessagesProvider } from '../types';

const asText = (m: MessageProducer | string, ctx?: any): string => (typeof m === 'function' ? m(ctx) : m);

const catalog: MessageCatalog = {
  welcome: ['叽~', '叽~很高兴见到你，我在这儿等你吩咐。', '欢迎回来！今天想做点什么？'],
  loading: '正在检查系统中…',
  configure: '叽~没有工作空间，请先创建。',
  click: ['叽~有什么可以帮助你的吗？', '我在～需要我做点什么吗？', '收到～告诉我你的想法吧。'],
  hold: ['可以把我拖到任何位置。'],
  drag: '把文件拖给我吧 ⤓',
  drop: '放置完成',
  fileDrop: (ctx?: {
    // Optional runtime parameters to format messages
    count?: number;
    names?: string[];
    singleName?: string;
  }) => {
    if (ctx?.count === 1 && ctx.singleName) return `我收到了文件"${ctx.singleName}" ✅`;
    if (ctx?.count && ctx?.names?.length) {
      const preview = ctx.names.slice(0, 3).join('、');
      return `我收到了 ${ctx.count} 个项目：${preview}${ctx.count > 3 ? ' 等' : ''} ✅`;
    }
    return '收到了一些内容，但我没识别到文件名 🤔';
  },
  tip: ['小提示：你可以右键我打开更多功能菜单。', '提示：将我拖动到屏幕边缘，我会自动避让窗口。'],
  reminder: ['记得适时休息一下，喝口水～', '久坐伤身哦，起来活动一下吧。'],
  system: '发生了一点小状况，请稍后再试。'
};

export const zhCN: MessagesProvider = {
  t: (category: MessageCategory, ctx?: any) => {
    const entry = catalog[category];
    if (!entry) return '';

    // prefer default
    if (!(entry instanceof Array)) {
      return asText(entry, ctx);
    }

    // fallback to variant
    if (entry.length) {
      const pick = entry[Math.floor(Math.random() * entry.length)];
      return asText(pick, ctx);
    }
    return '';
  }
};

export default zhCN;
