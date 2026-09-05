/**
 * 消息文案目录 - 英语（纯数据文件）
 *
 * 主进程 & 渲染进程共用
 * 包含两类文案：
 * 1. catalog — 按 MessageCategory 索引，用于消息气泡显示
 * 2. spriteEventMessages — 按 SpriteEventType 索引，用于精灵事件触发时的气泡文案
 * 查找逻辑（resolveEntry / getSpriteEventText / MessagesProvider）统一在 ./index.ts
 */

import type { MessageCatalog, SpriteMessagesData } from '../types';

// ============================================================================
// MessageCategory 文案目录（已有 + 补全）
// ============================================================================

const catalog: MessageCatalog = {
  // ── 交互类 ──
  idle: ['...', 'Chirp~', "I'm right here~"],
  hover: ['Hmm?', 'Chirp?', 'What are you looking at~'],
  click: [
    'Chirp~',
    'What shall we do today?',
    'Got it~',
    'Chirp? Did you call me~',
    "Here, I'm here~",
    'Hmm? What is it~',
    'Why are you poking me~',
    'Hehe, that tickles~',
    "Chii's right here~",
    'Wanna chat?',
    'Got a task for Chii~',
    'Ready whenever you are~',
    "Let's do our best today too~",
    'Whoa, you found me~',
    'Need a hand from Chii~',
    'One click and I feel energized~',
    'Chirp! Fully charged~',
    "Let's learn something new together~",
    "Chii's battery is full~",
    'Standing by~ Chirp~',
    'Yes, master? Chirp~',
    'Pat pat... hehe~'
  ],
  focus: ['Focus mode! You got this!', 'Stay focused~'],
  input: ['Typing away~', 'Writing something nice~'],
  scroll: ['Scrolling along~', 'Looking for something?'],
  press: ['Holding it down~'],
  release: ['Let go~'],
  hold: ['Mm-hmm.', 'Okay.', 'Scoot over.', "I'm here.", 'Coming.', 'Put it here?', 'Whatever you say.', 'Mm.'],
  selection: ['Selected~', 'What would you like to do with this?'],

  // ── 反馈类 ──
  success: 'Done!',
  failure: ['It failed... try again?', "That didn't work, want to retry?"],
  error: 'Something went wrong, please try again.',
  warning: 'Heads up!',
  info: 'Just a heads-up',
  celebrate: ['Amazing! 🎉', 'Congrats! ✨', 'So cool!'],
  tip: ['Right-click me to open the menu.', 'You can drag me anywhere~', 'Try interacting with me~'],
  recommend: ['Give this feature a try~', 'This might come in handy for you~'],

  // ── 状态类 ──
  loading: 'Checking the system…',
  processing: 'Processing...',
  waiting: 'One moment...',
  timeout: ['This is taking forever...', 'Looks like it timed out, try again?'],
  retry: ['One more try~', 'Retrying...'],

  // ── 工作流类 ──
  confirmation: ['Confirmed!', 'Okay, confirmed~'],
  cancellation: ['Cancelled~', 'Alright, cancelled.'],
  task: ['New task~', "Here's a task!"],
  update: ['Update available~', 'Update complete!'],
  install: ['Installing...', 'Installed!'],
  remove: ['Removed~', 'Deleted.'],
  settings: ['Opening settings~', "Let's tweak some things~"],

  // ── 网络类 ──
  connect: ['Connected!', 'Network connected~'],
  disconnect: ['Disconnected...', 'Network went down 😟'],
  sync: ['Syncing...', 'Syncing now~'],
  upload: ['Uploading...', 'Uploading now~'],
  download: ['Downloading...', 'Downloading now~'],

  // ── 辅助类 ──
  question: ['Any questions?', 'Ask me anything~'],
  answer: ["Here's the answer~", 'Found it!'],
  search: ['Searching...', 'Looking it up~'],
  navigation: ['This way~', 'Navigating~'],
  message: ['New message~', 'Message received~'],
  alert: ['Attention!', 'Alert! ⚠️'],
  reminder: ['Remember to take a break and drink some water~', "Sitting too long isn't good for you, get up and stretch."],

  // ── 系统类 ──
  system: 'A little hiccup happened, please try again later.',
  welcome: ['Chirp~', 'Chirp~ awaiting your orders.', 'Welcome back! What would you like to do today?'],
  event: ['Something happened~'],
  profile: ['Checking your profile~'],
  custom: ''
};

// ============================================================================
// SpriteEventType 专用文案（用于 trigger() 方法）
// 这些事件没有对应的 MessageCategory，需要独立的文案映射
// ============================================================================

const spriteEventMessages: SpriteMessagesData['spriteEventMessages'] = {
  // ── emotion 情感类 ──
  happy: ['So happy~♪', "I'm in a great mood~", 'Hehe~'],
  joy: ['Yay!', 'So joyful~', "I'm over the moon~"],
  excited: ['So excited!', "Can't wait!", 'This is thrilling! ✨'],
  proud: ['Hehe, pretty impressive right~', 'Proud!', 'Well, not bad huh~'],
  shy: ['S-so shy...', "Don't look at me...", 'Blushing...'],
  embarrassed: ['So awkward...', 'This is... kind of embarrassing...'],
  sad: ['A little sad...', 'Sigh...', 'So heartbroken...'],
  bored: ["I'm so bored...", 'Anything fun to do?', '*yawn*~'],
  angry: ['Hmph!', "I'm mad!", 'This is too much!'],
  annoyed: ['So annoying...', 'Leave me alone...', 'Hmph~'],
  confused: ['Eh?', "I don't get it...", 'What does that mean? 🤔'],
  curious: ['Hmm? What is this?', 'So curious~', 'Let me see~'],
  surprised: ['Whoa!', 'You startled me!', "Didn't see that coming! 😲"],
  panic: ['What do I do what do I do!', 'Emergency!', "I'm panicking!"],
  scared: ["I'm scared...", 'That terrified me...', "I can't look..."],
  tired: ['So tired...', 'I need a rest...', 'Sleepy...'],
  sleep: ['Good night~ 💤', 'zzZ...', 'So sleepy... good night...'],
  wake: ['Good morning~!', 'Awake!', "Mm... let's do our best today~"],
  thinking: ['Hmm... let me think...', 'Thinking... 🤔', 'Well, about that...'],
  focusMode: ['Focus mode on!', 'Do not disturb~', 'Working hard...'],

  // ── action 动作类 ──
  walk: ['Taking a stroll~', 'Wandering around~', "Let's go~"],
  run: ['Run!', 'Charge!', 'Speeding up!'],
  jump: ['Jump!', 'Hop~!', 'Hey!'],
  sit: ['Sitting down for a break~', 'Resting a bit~'],
  stand: ['Stand up!', 'On my feet~'],
  wave: ['Hi there~ 👋', 'Hey!', 'Waving~'],
  talk: ["I'll say a few words~", 'Listen to me~', 'Chit-chat~'],
  nod: ['Mm-hmm!', 'Nod~', 'Agreed!'],
  shakeHead: ['No no~', 'Shaking my head~', 'Not that one!'],
  dance: ['Dance♪', 'Swaying~♬', "Let's party! 💃"],
  spin: ['Spinning around~', 'Spin!', 'Dizzy dizzy~'],
  fall: ['Ah!', 'I fell down...', 'Ouch~'],
  climb: ['Climbing up~', 'Up we go!', 'Keep going!'],
  slide: ['Slide~', 'Slipping away~', 'Whoosh~'],
  attack: ['Take this!', 'Attack!', 'Ha!'],
  defend: ['Blocked!', 'Defend!', 'Shields up!'],
  point: ['Look over there!', 'Pointing~', "That's the one!"],
  type: ['Tippy-tap~', 'Typing... ⌨️', 'Typing diligently~'],
  read: ['Reading... 📖', "Let's see this~", 'Reading carefully~'],
  write: ['Writing... ✏️', 'Jotting it down~'],
  lookLeft: ['← Looking left~'],
  lookRight: ['→ Looking right~'],
  lookUp: ['↑ Looking up~'],
  lookDown: ['↓ Looking down~'],

  // ── transition 过渡类 ──
  appear: ["I'm here! ✨", 'Chirp~ here I come!', 'Appear!'],
  disappear: ['Bye bye~', "I'm off~", 'See you next time!'],
  enter: ['Entering~', 'Here I come~'],
  exit: ['Exiting~', 'Taking my leave~'],
  fadeIn: ['Fading in~'],
  fadeOut: ['Fading out~'],
  spawn: ['Spawn!', 'Here I am!'],
  despawn: ['Gone...'],
  teleport: ['Teleport! ✨', 'Whoosh! Made it!'],
  transform: ['Transform!', 'Shapeshift! ✨'],
  powerUp: ['Power up! ⚡', 'Feeling stronger!', 'Power Up!'],
  powerDown: ['Power down...', 'Feeling weaker...'],

  // ── connector 连接类（通常不显示文案，但备用） ──
  turnLeft: '',
  turnRight: '',
  turnBack: '',
  turnFront: '',
  turnAround: 'Turning around~',
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
  faceCamera: ['Look here~ 📷'],
  readyStance: ['Ready!'],
  windUp: ['Charging up...'],
  coolDown: ['Cooling down...'],
  recover: ['Recovering...', 'Much better~'],

  // ── ambient 氛围类 ──
  breath: '',
  blink: '',
  float: '',
  idle2: '',
  idle3: '',
  loadingLoop: '',
  successLoop: '',
  errorLoop: '',
  charging: ['Charging... ⚡', 'Recharging energy~'],
  saving: ['Saving... 💾', 'Saving progress~'],

  // ── seasonal 季节类 ──
  holiday: ['Holiday time! 🎉', 'Happy holidays!'],
  newYear: ['Happy New Year! 🎆', 'A new year, a fresh start!'],
  spring: ['Spring is here~ 🌸', 'Blossoms everywhere~'],
  summer: ['So hot~ ☀️', 'Summer is here~', 'How about a popsicle~ 🍦'],
  autumn: ['Crisp autumn air~ 🍂', 'Falling leaves~'],
  winter: ['So cold~ ❄️', 'Winter is here~', 'Craving hot cocoa~ ☕'],
  halloween: ['Trick or treat! 🎃', 'Happy Halloween!'],
  christmas: ['Merry Christmas! 🎄', 'Merry Christmas! ⛄'],
  birthday: ['Happy birthday! 🎂', "Today's a special day! 🎈"],

  // ── special 特效类 ──
  glow: ['Glowing! ✨'],
  pulse: ['Pulse~'],
  sparkle: ['Sparkling! ✨', 'Twinkle twinkle~'],
  burst: ['Burst! 💥', 'Boom!'],
  flare: ['Flare! 🌟'],
  aura: ['Full aura!', 'Aura unleashed!'],
  shield: ['Shield up! 🛡️'],
  trail: ['Trail effect~'],
  impact: ['Impact! 💫'],
  hit: ['Hit!'],

  // ── AI 对话类 ──
  aiThinking: ['Thinking... 🤔', 'Hmm, thinking~', 'Let me think...'],
  aiComplete: ['Done! ✨', 'Got it sorted~', "Here's your answer~"],
  aiError: ['My thinking glitched...', 'The AI zoned out...', 'Something went wrong...']
};

export const enData: SpriteMessagesData = {
  catalog,
  spriteEventMessages
};
