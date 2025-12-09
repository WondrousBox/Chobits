import type { CareRoutineDefinition } from './types';

const hydrationMessages = ['叽~ 喝口水润润嗓子吧。', '久坐容易忘记补水，我帮你记着呢～', '补充一杯温水，效率更高哦。'];

const stretchMessages = ['起身伸个懒腰，顺便看看窗外吧。', '动一动肩颈，保持血液循环～', '站起来活动 2 分钟，身体会谢谢你。'];

const eyeCareMessages = ['20-20-20：看向 20 米外，闭眼放松 20 秒。', '让眼睛休息一下，眺望远处的绿色吧。', '揉揉眼睛、深呼吸，缓解屏幕疲劳。'];

const nightGuardMessages = ['已经很晚啦，准备收尾休息吧～', '夜深了，保存一下进度再去睡觉？', '叽~已经熬夜模式，请一定要照顾好自己。'];

const midnightGuardMessages = ['00:30 了，再坚持也要注意身体，去休息吧。', '深夜生产力很昂贵，要不要明早再战？', '凌晨了，记得关灯、休息、补觉。'];

const morningBriefMessages = ['早安～今天也一起认真生活吧。', '新的一天，喝水 + 拉伸 checklist 走起！', '我在，把今日目标告诉我也行。'];

const eveningWrapMessages = ['辛苦啦，准备收工or安心摸鱼时间。', '记得整理一下今日成果，明天更顺利。', '喝杯水、活动下，准备进入放松模式。'];

const parentFestivalMessages = ['今天是父亲节，记得和家里打个电话哦～', '母亲节快乐，发个消息or送个拥抱吧。'];

export const BASE_ROUTINES: CareRoutineDefinition[] = [
  {
    id: 'care:hydration-hourly',
    title: '补水提醒',
    description: '每 1 分钟提醒喝水（测试模式）',
    kind: 'hydration',
    severity: 'gentle',
    schedule: { kind: 'interval', minutes: 1, activeHourStart: '09:00', activeHourEnd: '22:30' },
    messageTemplates: hydrationMessages,
    tags: ['health', 'water'],
    channel: 'spriteNotice',
    source: 'default'
  },
  {
    id: 'care:stretch-standing',
    title: '站立/拉伸提醒',
    description: '每 90 分钟提醒起身放松',
    kind: 'movement',
    severity: 'info',
    schedule: { kind: 'interval', minutes: 90, activeHourStart: '07:30', activeHourEnd: '22:00' },
    messageTemplates: stretchMessages,
    tags: ['health', 'posture'],
    channel: 'spriteNotice',
    source: 'default'
  },
  {
    id: 'care:eye-20-20',
    title: '护眼 20-20-20',
    description: '屏幕使用 50 分钟提醒护眼',
    kind: 'vision',
    severity: 'gentle',
    schedule: { kind: 'interval', minutes: 50, activeHourStart: '09:00', activeHourEnd: '21:30' },
    messageTemplates: eyeCareMessages,
    tags: ['vision'],
    channel: 'spriteNotice',
    source: 'default'
  },
  {
    id: 'care:night-guardian',
    title: '夜间守护',
    description: '晚上 23:30 之后，每隔 1 分钟提醒休息',
    kind: 'nightGuard',
    severity: 'warning',
    schedule: { kind: 'interval', minutes: 1, activeHourStart: '23:30', activeHourEnd: '08:00' },
    messageTemplates: nightGuardMessages,
    persistent: true, // 常驻显示，直到下一个消息或用户关闭
    tags: ['rest'],
    channel: 'spriteNotice',
    source: 'default'
  },
  {
    id: 'care:midnight-guardian',
    title: '熬夜劝退',
    description: '00:30/01:30/02:30 强提醒',
    kind: 'nightGuard',
    severity: 'urgent',
    schedule: { kind: 'fixed', times: ['00:30', '01:30', '02:30'] },
    messageTemplates: midnightGuardMessages,
    tags: ['rest', 'urgent'],
    channel: 'spriteNotice',
    source: 'default'
  },
  {
    id: 'care:morning-brief',
    title: '晨间问候',
    description: '09:15 打开今日节奏',
    kind: 'summary',
    severity: 'info',
    schedule: { kind: 'fixed', times: ['09:15'] },
    messageTemplates: morningBriefMessages,
    tags: ['summary'],
    channel: 'spriteNotice',
    source: 'default'
  },
  {
    id: 'care:evening-wrap',
    title: '傍晚收口',
    description: '18:00 提醒收纳、喝水',
    kind: 'summary',
    severity: 'gentle',
    schedule: { kind: 'fixed', times: ['18:00'] },
    messageTemplates: eveningWrapMessages,
    tags: ['summary'],
    channel: 'spriteNotice',
    source: 'default'
  }
];

export const FESTIVAL_ROUTINES: CareRoutineDefinition[] = [
  {
    id: 'festival:fathers-day',
    title: '父亲节想家提醒',
    description: '每年 6 月第三个周日，叮嘱联系爸爸',
    kind: 'festival',
    severity: 'info',
    schedule: {
      kind: 'calendar',
      repeat: 'yearly',
      time: '09:30',
      nthWeekday: { month: 6, weekday: 0, nth: 3 }
    },
    messageTemplates: [parentFestivalMessages[0]],
    tags: ['family', 'festival'],
    channel: 'spriteNotice',
    source: 'preset',
    metadata: { festival: 'fathers-day' }
  },
  {
    id: 'festival:mothers-day',
    title: '母亲节打电话提醒',
    description: '每年 5 月第二个周日，记得问候妈妈',
    kind: 'festival',
    severity: 'info',
    schedule: {
      kind: 'calendar',
      repeat: 'yearly',
      time: '09:30',
      nthWeekday: { month: 5, weekday: 0, nth: 2 }
    },
    messageTemplates: [parentFestivalMessages[1]],
    tags: ['family', 'festival'],
    channel: 'spriteNotice',
    source: 'preset',
    metadata: { festival: 'mothers-day' }
  }
];

export const DEFAULT_ROUTINES: CareRoutineDefinition[] = [...BASE_ROUTINES, ...FESTIVAL_ROUTINES];
