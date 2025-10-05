import { MessageCatalog, MessagesProvider, MessageCategory, MessageContext, MessageProducer } from './types'

const asText = (m: MessageProducer | string, ctx?: MessageContext) => typeof m === 'function' ? m(ctx) : m

const catalog: MessageCatalog = {
  welcome: {
    variants: [
      '叽~',
      '叽~很高兴见到你，我在这儿等你吩咐。',
      '欢迎回来！今天想做点什么？',
    ],
  },
  loading: {
    default: '正在检查系统中…',
  },
  configure: {
    default: '未检测到工作空间，请先创建一个。',
  },
  click: {
    default: '叽~有什么可以帮助你的吗？ 😊',
    variants: [
      '我在～需要我做点什么吗？',
      '收到点击～告诉我你的想法吧。',
    ],
  },
  hold: {
    variants: [
      '可以把我拖到任何位置。',
    ],
  },
  drag: {
    default: '把文件拖给我吧 ⤓',
  },
  drop: {
    default: (ctx?: MessageContext) => {
      if (ctx?.count === 1 && ctx.singleName) return `我收到了文件“${ctx.singleName}” ✅`
      if (ctx?.count && ctx?.names?.length) {
        const preview = ctx.names.slice(0, 3).join('、')
        return `我收到了 ${ctx.count} 个项目：${preview}${ctx.count > 3 ? ' 等' : ''} ✅`
      }
      return '收到了一些内容，但我没识别到文件名 🤔'
    },
  },
  tip: {
    variants: [
      '小提示：你可以右键我打开更多功能菜单。',
      '提示：将我拖动到屏幕边缘，我会自动避让窗口。',
    ],
  },
  reminder: {
    variants: [
      '记得适时休息一下，喝口水～',
      '久坐伤身哦，起来活动一下吧。',
    ],
  },
  system: {
    default: '发生了一点小状况，请稍后再试。',
  },
}

export const zhCN: MessagesProvider = {
  t: (category: MessageCategory, ctx?: MessageContext, opts?: { variant?: boolean }) => {
    const entry = catalog[category]
    if (!entry) return ''

    // prefer default
    if (entry.default) return asText(entry.default, ctx)

    // fallback to variant
    if (entry.variants && entry.variants.length) {
      const pick = entry.variants[Math.floor(Math.random() * entry.variants.length)]
      return asText(pick, ctx)
    }
    return ''
  },
}

export default zhCN
