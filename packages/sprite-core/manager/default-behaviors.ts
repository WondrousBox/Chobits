/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 默认行为注册
 *
 * 将所有内置自发行为（自动行走、困倦、无聊、随机消息等）
 * 从 SpriteManager 中抽取为独立函数。
 */

import type { BehaviorContext } from '../behavior-engine';
import {
  createActionBehavior,
  createAmbientBehavior,
  createAutoWalkBehavior,
  createBoredBehavior,
  createEmotionBehavior,
  createFavorDecayBehavior,
  createIdleSleepyBehavior,
  createRandomMessageBehavior,
  createSeasonalBehavior,
  createSleepyBehavior
} from '../behavior-engine';
import type { SpriteMovementConfig } from '../types';
import type { SpriteManager } from './sprite-manager';
import type { SpriteSpontaneousUtteranceActionSource, SpriteSpontaneousUtteranceResult } from './types';

function pickRandomAction(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

async function reportIdleActionExecution(
  mgr: SpriteManager,
  utterance: SpriteSpontaneousUtteranceResult | null | undefined,
  payload: {
    behaviorId: string;
    triggeredAt: number;
    executedAction: string;
    actionSource: SpriteSpontaneousUtteranceActionSource;
    spoken: boolean;
    fallbackUsed: boolean;
    error?: string;
  }
): Promise<void> {
  const executor = mgr.getSpontaneousUtteranceExecutor();
  if (!executor?.reportIdleActionExecution || !utterance?.utteranceId) {
    return;
  }

  try {
    await executor.reportIdleActionExecution({
      utteranceId: utterance.utteranceId,
      behaviorId: payload.behaviorId,
      triggeredAt: payload.triggeredAt,
      text: utterance.text,
      intentCategory: utterance.intentCategory,
      tone: utterance.tone,
      emotion: utterance.emotion,
      delivery: utterance.delivery,
      bubbleDurationMs: utterance.bubbleDurationMs,
      whyThisFits: utterance.whyThisFits,
      executedAction: payload.executedAction,
      actionSource: payload.actionSource,
      spoken: payload.spoken,
      fallbackUsed: payload.fallbackUsed,
      ...(payload.error ? { error: payload.error } : {})
    });
  } catch {
    // 执行日志是附加能力，不能反过来打断行为主链路
  }
}

/**
 * 根据 walk 动画的 movement 配置计算随机行走目标位置
 */
function computeWalkTarget(mgr: SpriteManager, movementConfig?: SpriteMovementConfig): { targetX: number; targetY: number } | null {
  const pos = mgr.getPosition();
  const screen = (mgr as any).getScreenSize();
  const config = mgr.getSpriteConfig();

  const minX = -config.padding;
  const maxX = screen.width - config.width - config.padding;
  const targetX = Math.random() * (maxX - minX) + minX;

  // 竖直范围：优先使用配置中的 verticalRange，默认 0.1（屏幕高度的 10%）
  const verticalRange = movementConfig?.verticalRange ?? 0.1;
  const yRange = screen.height * verticalRange;
  const yMin = Math.max(-config.padding, pos[1] - yRange);
  const yMax = Math.min(screen.height - config.height - config.padding, pos[1] + yRange);
  const targetY = Math.random() * (yMax - yMin) + yMin;

  return { targetX, targetY };
}

/** 注册所有默认行为到 SpriteManager */
export function registerDefaultBehaviors(mgr: SpriteManager): void {
  // 自动行走：从 walk 动画的 movement 配置读取参数
  const walkAnim = mgr.findAnimationByEvent('walk');
  const walkMovement = walkAnim?.playback?.movement;

  // 根据 movement 配置构建 auto-walk 行为
  const autoWalkDef = createAutoWalkBehavior(async (_ctx) => {
    if (!mgr.isAutoWalkEnabled()) return;
    if (!(mgr as any).windowController) return;

    // 重新查找以获取最新配置
    const currentWalkAnim = mgr.findAnimationByEvent('walk');
    const movement = currentWalkAnim?.playback?.movement;

    const mode = movement?.mode ?? 'walkTo';
    const walkSpeed = movement?.speed;

    if (mode === 'walkTo') {
      // walkTo 模式：随机选取屏幕位置，沿贝塞尔曲线行走
      // 需要动画具备 loopStartMs/loopEndMs 循环片段
      const hasLoop = currentWalkAnim?.playback?.loopStartMs != null && currentWalkAnim?.playback?.loopEndMs != null;
      if (!hasLoop) return;

      const target = computeWalkTarget(mgr, movement);
      if (!target) return;

      await mgr.walkTo(target.targetX, target.targetY, walkSpeed);
    } else {
      // direction 模式：也使用 walkTo 路径行走
      const target = computeWalkTarget(mgr, movement);
      if (!target) return;

      await mgr.walkTo(target.targetX, target.targetY, walkSpeed);
    }
  });

  // 使用 walk 动画配置中的 behaviorSchedule 覆盖默认调度参数
  if (walkMovement?.trigger === 'behavior' && walkMovement.behaviorSchedule) {
    const bs = walkMovement.behaviorSchedule;
    autoWalkDef.schedule = {
      type: bs.type ?? 'random',
      intervalMs: bs.intervalMs,
      minMs: bs.minMs ?? 10000,
      maxMs: bs.maxMs ?? 25000
    };
    if (bs.probability != null) {
      autoWalkDef.probability = bs.probability;
    }
    if (bs.minIdleMs != null) {
      autoWalkDef.conditions = [
        (ctx: BehaviorContext) => ctx.spriteState === 'idle' || ctx.spriteState === 'bored',
        (ctx: BehaviorContext) => ctx.interactionStats.idleDuration > (bs.minIdleMs ?? 5000)
      ];
    }
  }

  mgr.registerBehavior(autoWalkDef);

  // 困倦
  const sleepyDef = createSleepyBehavior();
  sleepyDef.action = (_ctx: BehaviorContext) => {
    mgr.playOnce('sleepy');
    mgr.showToast(undefined, { category: 'reminder' });
  };
  mgr.registerBehavior(sleepyDef);

  // 长时间闲置困倦（100秒无交互）
  const idleSleepyDef = createIdleSleepyBehavior();
  idleSleepyDef.action = (_ctx: BehaviorContext) => {
    mgr.playOnce('sleepy');
    mgr.showToast('有点困了呢...', { category: 'info', duration: 2000 });
  };
  mgr.registerBehavior(idleSleepyDef);

  // 无聊
  const boredDef = createBoredBehavior();
  boredDef.action = (_ctx: BehaviorContext) => {
    mgr.transitionTo('bored');
  };
  mgr.registerBehavior(boredDef);

  // 随机消息
  const msgDef = createRandomMessageBehavior();
  msgDef.action = (_ctx: BehaviorContext) => {
    mgr.showToast(undefined, { category: 'tip' });
  };
  mgr.registerBehavior(msgDef);

  // 好感度衰减
  const decayDef = createFavorDecayBehavior();
  decayDef.action = (_ctx: BehaviorContext) => {
    mgr.changeFavor(-1, 'idle-decay');
  };
  mgr.registerBehavior(decayDef);

  // ===== 情感自发行为 =====
  const emotionDef = createEmotionBehavior();
  emotionDef.action = (ctx: BehaviorContext) => {
    const favor = ctx.personaState.favor;
    const highFavorEmotions = ['happy', 'joy', 'excited', 'proud', 'curious'];
    const midFavorEmotions = ['curious', 'surprised', 'shy', 'thinking'];
    const lowFavorEmotions = ['bored', 'annoyed', 'confused', 'tired'];

    let pool: string[];
    if (favor >= 60) {
      pool = highFavorEmotions;
    } else if (favor >= 30) {
      pool = midFavorEmotions;
    } else {
      pool = lowFavorEmotions;
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    mgr.trigger(picked);
  };
  mgr.registerBehavior(emotionDef);

  // ===== 动作自发行为 =====
  const actionDef = createActionBehavior();
  actionDef.action = async (ctx: BehaviorContext) => {
    const favor = ctx.personaState.favor;
    const baseActions = ['sit', 'stand', 'wave', 'nod', 'point', 'lookLeft', 'lookRight'];
    const highFavorActions = ['dance', 'spin', 'jump'];

    const pool = favor >= 60 ? [...baseActions, ...highFavorActions] : baseActions;
    const fallbackAction = pickRandomAction(pool);
    const triggeredAt = Date.now();
    const executor = mgr.getSpontaneousUtteranceExecutor();

    if (!executor) {
      mgr.trigger(fallbackAction);
      return;
    }

    let utterance: SpriteSpontaneousUtteranceResult | null = null;
    let actionTriggered = false;

    try {
      utterance = await executor.generateForIdleAction({
        behaviorId: actionDef.id,
        triggeredAt,
        actionCandidates: pool,
        fallbackAction,
        sprite: {
          state: ctx.spriteState,
          mood: ctx.personaState.mood,
          moodIntensity: ctx.personaState.moodIntensity,
          favor: ctx.personaState.favor,
          level: ctx.personaState.level,
          idleDurationMs: ctx.interactionStats.idleDuration
        }
      });

      if (!utterance?.text?.trim()) {
        mgr.trigger(fallbackAction);
        return;
      }

      const picked = utterance.recommendedAction && pool.includes(utterance.recommendedAction) ? utterance.recommendedAction : fallbackAction;
      const actionSource: SpriteSpontaneousUtteranceActionSource =
        utterance.recommendedAction && pool.includes(utterance.recommendedAction)
          ? utterance.actionSource && utterance.actionSource !== 'random-fallback'
            ? utterance.actionSource
            : 'model'
          : 'random-fallback';

      mgr.trigger(picked, { silent: true });
      actionTriggered = true;
      const speakResult = await mgr.speak(utterance.text.trim(), {
        showBubble: true,
        bubbleDuration: utterance.bubbleDurationMs
      });
      await reportIdleActionExecution(mgr, utterance, {
        behaviorId: actionDef.id,
        triggeredAt,
        executedAction: picked,
        actionSource,
        spoken: !!speakResult?.success,
        fallbackUsed: actionSource === 'random-fallback' || !speakResult?.success,
        ...(speakResult?.error ? { error: speakResult.error } : {})
      });
    } catch (error) {
      if (!actionTriggered) {
        mgr.trigger(fallbackAction);
      }
      await reportIdleActionExecution(mgr, utterance, {
        behaviorId: actionDef.id,
        triggeredAt,
        executedAction: actionTriggered && utterance?.recommendedAction ? utterance.recommendedAction : fallbackAction,
        actionSource: actionTriggered && utterance?.recommendedAction ? (utterance.actionSource ?? 'model') : 'random-fallback',
        spoken: false,
        fallbackUsed: true,
        ...(error instanceof Error ? { error: error.message } : {})
      });
    }
  };
  mgr.registerBehavior(actionDef);

  // ===== 氛围自发行为 =====
  const ambientDef = createAmbientBehavior();
  ambientDef.action = () => {
    const ambientEvents = ['breath', 'blink', 'float'];
    const picked = ambientEvents[Math.floor(Math.random() * ambientEvents.length)];
    mgr.trigger(picked, { silent: true });
  };
  mgr.registerBehavior(ambientDef);

  // ===== 季节/节日行为 =====
  const seasonalDef = createSeasonalBehavior();
  seasonalDef.action = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    if (month === 12 && day >= 24 && day <= 26) {
      mgr.trigger('christmas');
      return;
    }
    if (month === 10 && day === 31) {
      mgr.trigger('halloween');
      return;
    }
    if (month === 1 && day === 1) {
      mgr.trigger('newYear');
      return;
    }

    if (month >= 3 && month <= 5) {
      mgr.trigger('spring');
    } else if (month >= 6 && month <= 8) {
      mgr.trigger('summer');
    } else if (month >= 9 && month <= 11) {
      mgr.trigger('autumn');
    } else {
      mgr.trigger('winter');
    }
  };
  mgr.registerBehavior(seasonalDef);
}
