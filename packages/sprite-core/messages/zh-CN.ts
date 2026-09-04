/**
 * 消息文案目录 - 中文简体
 *
 * 主进程 & 渲染进程共用
 * 包含两类文案：
 * 1. MessageCatalog — 按 MessageCategory 索引，用于消息气泡显示
 * 2. spriteEventMessages — 按 SpriteEventType 索引，用于精灵事件触发时的气泡文案
 */

import type { MessageCatalog, MessageCategory, MessageProducer, MessagesProvider } from '../types';

const asText = (m: MessageProducer | string, ctx?: any): string => (typeof m === 'function' ? m(ctx) : m);

// ============================================================================
// MessageCategory 文案目录（已有 + 补全）
// ============================================================================

const catalog: MessageCatalog = {
  // ── 交互类 ──
  idle: ['...', '叽~', '在这里呢~'],
  hover: ['嗯？', '叽？', '看我做什么~'],
  click: [
    '叽~',
    '今天要做什么呢？',
    '收到～',
    '叽？叫我吗~',
    '在呢在呢~',
    '嗯？怎么啦~',
    '戳我做什么呀~',
    '嘿嘿，有点痒~',
    '小叽在这里~',
    '要聊聊天吗？',
    '有任务交给小叽吗~',
    '随时可以开始哦~',
    '今天也要一起加油~',
    '哇，被主人发现了~',
    '要小叽帮忙吗~',
    '点我一下，精神百倍~',
    '叽！充能完毕~',
    '一起学习新东西吧~',
    '小叽电量满格~',
    '待命中~叽~',
    '主人，叽~',
    '摸摸头...嘿嘿~'
  ],
  focus: ['专注模式！加油！', '注意力集中~'],
  input: ['在输入呢~', '认真写东西~'],
  scroll: ['翻啊翻~', '在找什么呢？'],
  press: ['按住了~'],
  release: ['松开了~'],
  hold: ['嗯哼。', '好呀。', '挪一下。', '在呢。', '来啦。', '放这里？', '听你的。', '嗯。'],
  selection: ['选中了~', '要对这段内容做什么？'],

  // ── 反馈类 ──
  success: '操作成功！',
  failure: ['失败了...再试一次？', '没有成功，要不要重来？'],
  error: '出错了，请重试。',
  warning: '请注意！',
  info: '提示信息',
  celebrate: ['太棒了！🎉', '恭喜恭喜！✨', '好厉害！'],
  tip: ['对我右键可以打开菜单。', '我可以被拖到任何位置~', '试试和我互动吧~'],
  recommend: ['推荐你试试这个功能~', '这个可能对你有帮助哦~'],

  // ── 状态类 ──
  loading: '正在检查系统中…',
  processing: '处理中...',
  waiting: '请稍候...',
  timeout: ['等太久了...', '似乎超时了，要重试吗？'],
  retry: ['再试一次~', '重新尝试中...'],

  // ── 工作流类 ──
  confirmation: ['确认完成！', '好的，确认了~'],
  cancellation: ['已取消~', '好吧，取消了。'],
  task: ['有新任务~', '任务来了！'],
  update: ['有更新~', '更新完成！'],
  install: ['正在安装...', '安装完成！'],
  remove: ['已移除~', '删除完成。'],
  settings: ['打开设置~', '来调整一下吧~'],

  // ── 网络类 ──
  connect: ['已连接！', '网络连接成功~'],
  disconnect: ['断开连接了...', '网络断开了 😟'],
  sync: ['同步中...', '正在同步~'],
  upload: ['上传中...', '正在上传~'],
  download: ['下载中...', '正在下载~'],

  // ── 辅助类 ──
  question: ['有什么问题吗？', '问我吧~'],
  answer: ['答案来了~', '找到了！'],
  search: ['搜索中...', '正在查找~'],
  navigation: ['去这里~', '正在导航~'],
  message: ['有新消息~', '收到消息~'],
  alert: ['注意！', '有警报！⚠️'],
  reminder: ['记得适时休息一下，喝口水～', '久坐伤身哦，起来活动一下吧。'],

  // ── 系统类 ──
  system: '发生了一点小状况，请稍后再试。',
  welcome: ['叽~', '叽~等你吩咐。', '欢迎回来！今天想做点什么？'],
  event: ['有事件发生~'],
  profile: ['查看个人信息~'],
  custom: ''
};

// ============================================================================
// SpriteEventType 专用文案（用于 trigger() 方法）
// 这些事件没有对应的 MessageCategory，需要独立的文案映射
// ============================================================================

export type SpriteEventMessageEntry = Array<MessageProducer | string> | MessageProducer | string;

export const spriteEventMessages: Record<string, SpriteEventMessageEntry> = {
  // ── emotion 情感类 ──
  happy: ['开心~♪', '心情真好~', '嘿嘿~'],
  joy: ['好快乐！', '真开心呀~', '太高兴了~'],
  excited: ['好兴奋！', '激动！', '太刺激了！✨'],
  proud: ['嘿嘿，很厉害吧~', '骄傲！', '怎么样，不错吧~'],
  shy: ['害...害羞了...', '别看我啦...', '脸红了...'],
  embarrassed: ['好尴尬...', '这...有点不好意思...'],
  sad: ['有点难过...', '唉...', '好伤心...'],
  bored: ['好无聊啊...', '有什么好玩的吗？', '打个哈欠~'],
  angry: ['哼！', '生气了！', '太过分了！'],
  annoyed: ['烦死了...', '别烦我...', '哼~'],
  confused: ['诶？', '看不懂...', '什么意思？🤔'],
  curious: ['嗯？这是什么？', '好好奇~', '让我看看~'],
  surprised: ['哇！', '吓我一跳！', '没想到！😲'],
  panic: ['怎么办怎么办！', '紧急情况！', '好慌！'],
  scared: ['好怕...', '吓死了...', '不敢看...'],
  tired: ['好累啊...', '想休息...', '困了...'],
  sleep: ['晚安~💤', 'zzZ...', '困死了...睡了...'],
  wake: ['早安~！', '醒了！', '嗯...今天也要加油~'],
  thinking: ['嗯...让我想想...', '思考中...🤔', '这个嘛...'],
  focusMode: ['专注模式启动！', '请勿打扰~', '认真工作中...'],

  // ── action 动作类 ──
  walk: ['散步中~', '走走看看~', '出发~'],
  run: ['跑起来！', '冲呀！', '加速！'],
  jump: ['跳！', '蹦~！', '嘿！'],
  sit: ['坐下来休息一下~', '歇会儿~'],
  stand: ['起立！', '站起来了~'],
  wave: ['你好呀~👋', '嗨！', '挥挥手~'],
  talk: ['我说两句~', '听我说~', '叽叽咕咕~'],
  nod: ['嗯嗯！', '点头~', '同意！'],
  shakeHead: ['不行不行~', '摇头~', '这个不行！'],
  dance: ['跳舞♪', '摇摆~♬', '来一起嗨！💃'],
  spin: ['转圈圈~', '旋转！', '晕了晕了~'],
  fall: ['啊！', '摔倒了...', '哎呦~'],
  climb: ['爬呀爬~', '往上爬！', '加油！'],
  slide: ['滑~', '溜了溜了~', '嗖~'],
  attack: ['看招！', '攻击！', '哈！'],
  defend: ['挡住了！', '防御！', '护盾启动！'],
  point: ['看那里！', '指~', '就是那个！'],
  type: ['啪嗒啪嗒~', '打字中...⌨️', '认真输入~'],
  read: ['阅读中...📖', '看看这个~', '认真读~'],
  write: ['书写中...✏️', '记录下来~'],
  lookLeft: ['←看看左边~'],
  lookRight: ['→看看右边~'],
  lookUp: ['↑看看上面~'],
  lookDown: ['↓看看下面~'],

  // ── transition 过渡类 ──
  appear: ['我来了！✨', '叽~登场！', '出现！'],
  disappear: ['再见~', '我先走了~', '下次见！'],
  enter: ['进场~', '来了来了~'],
  exit: ['退场~', '先告退了~'],
  fadeIn: ['渐渐出现~'],
  fadeOut: ['渐渐消失~'],
  spawn: ['生成！', '出现了！'],
  despawn: ['消失了...'],
  teleport: ['瞬移！✨', '嗖！到了！'],
  transform: ['变身！', '变形！✨'],
  powerUp: ['能量提升！⚡', '变强了！', 'Power Up！'],
  powerDown: ['能量下降...', '好像变弱了...'],

  // ── connector 连接类（通常不显示文案，但备用） ──
  turnLeft: '',
  turnRight: '',
  turnBack: '',
  turnFront: '',
  turnAround: '转身~',
  standToSit: '',
  sitToStand: '',
  idleToWalk: '',
  walkToIdle: '',
  walkToRun: '',
  runToWalk: '',
  faceLeft: '',
  faceRight: '',
  faceUp: '',
  faceDown: '',
  faceCamera: ['看这里~📷'],
  readyStance: ['准备好了！'],
  windUp: ['蓄力中...'],
  coolDown: ['冷却中...'],
  recover: ['恢复中...', '好多了~'],

  // ── ambient 氛围类 ──
  breath: '',
  blink: '',
  float: '',
  idle2: '',
  idle3: '',
  loadingLoop: '',
  successLoop: '',
  errorLoop: '',
  charging: ['充电中...⚡', '能量补充中~'],
  saving: ['保存中...💾', '存档~'],

  // ── seasonal 季节类 ──
  holiday: ['放假啦！🎉', '假日快乐！'],
  newYear: ['新年快乐！🎆', '新的一年，新的开始！'],
  spring: ['春天来了~🌸', '春暖花开~'],
  summer: ['好热呀~☀️', '夏天到了~', '来根冰棍~🍦'],
  autumn: ['秋高气爽~🍂', '落叶纷飞~'],
  winter: ['好冷啊~❄️', '冬天来了~', '想喝热可可~☕'],
  halloween: ['不给糖就捣蛋！🎃', 'Happy Halloween!'],
  christmas: ['圣诞快乐！🎄', 'Merry Christmas! ⛄'],
  birthday: ['生日快乐！🎂', '今天是特别的一天！🎈'],

  // ── special 特效类 ──
  glow: ['发光！✨'],
  pulse: ['脉冲~'],
  sparkle: ['闪闪发光！✨', '亮晶晶~'],
  burst: ['爆发！💥', '绽放！'],
  flare: ['闪耀！🌟'],
  aura: ['气场全开！', '光环展现！'],
  shield: ['护盾启动！🛡️'],
  trail: ['拖尾效果~'],
  impact: ['冲击！💫'],
  hit: ['命中！'],

  // ── AI 对话类 ──
  aiThinking: ['思考中...🤔', '在想呢~', '让我想想...'],
  aiComplete: ['回答完成！✨', '搞定了~', '这就是答案~'],
  aiError: ['思考出错了...', 'AI开小差了...', '出了点问题...']
};

// ============================================================================
// 统一查找函数
// ============================================================================

function resolveEntry(entry: SpriteEventMessageEntry | undefined, ctx?: any): string {
  if (!entry) return '';
  if (!(entry instanceof Array)) {
    return asText(entry, ctx);
  }
  if (entry.length) {
    const pick = entry[Math.floor(Math.random() * entry.length)];
    return asText(pick, ctx);
  }
  return '';
}

export const zhCN: MessagesProvider = {
  t: (category: MessageCategory, ctx?: any) => {
    return resolveEntry(catalog[category], ctx);
  }
};

/**
 * 按 SpriteEventType 查找文案
 * 先查 spriteEventMessages，再 fallback 到 catalog（MessageCategory 与 SpriteEventType 有重叠部分）
 */
export function getSpriteEventText(eventType: string, ctx?: any): string {
  // 先查专用事件文案
  const eventEntry = spriteEventMessages[eventType];
  if (eventEntry !== undefined) {
    const text = resolveEntry(eventEntry, ctx);
    if (text) return text;
  }
  // fallback 到 MessageCategory 文案（交互/状态类事件名与 MessageCategory 重叠）
  const categoryEntry = catalog[eventType as MessageCategory];
  if (categoryEntry !== undefined) {
    return resolveEntry(categoryEntry as SpriteEventMessageEntry, ctx);
  }
  return '';
}

export default zhCN;
