/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * 默认行为注册
 *
 * 将所有内置自发行为（困倦、无聊、随机消息等）
 * 从 SpriteManager 中抽取为独立函数。
 */

import type { BehaviorContext } from '../behavior-engine';
import {
  createActionBehavior,
  createAmbientBehavior,
  createBoredBehavior,
  createEmotionBehavior,
  createIdleSleepyBehavior,
  createRandomMessageBehavior,
  createSeasonalBehavior,
  createSleepyBehavior
} from '../behavior-engine';
import { getSpriteCapabilityRuntimeState } from '../capability-runtime';
import { getCharacterRoutineText } from '../messages/character';
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

/** 注册所有默认行为到 SpriteManager */
export function registerDefaultBehaviors(mgr: SpriteManager): void {
  // 困倦
  const sleepyDef = createSleepyBehavior();
  sleepyDef.action = async (ctx: BehaviorContext) => {
    const result = await mgr.startPurpose({
      kind: 'daily.rest-reminder',
      reason: '夜间时间窗口触发休息提醒',
      source: 'behavior',
      presetId: 'daily.rest-reminder',
      priority: 60,
      coalesceKey: 'night-sleepy',
      context: {
        behaviorId: sleepyDef.id,
        triggeredAt: Date.now(),
        hour: ctx.now.getHours()
      }
    });

    if (!result.accepted) {
      mgr.playOnce('sleepy');
      mgr.showToast(undefined, { category: 'reminder', ambientContext: 'behavior' });
    }
  };
  mgr.registerBehavior(sleepyDef);

  // 长时间闲置困倦（100秒无交互）
  const idleSleepyDef = createIdleSleepyBehavior();
  idleSleepyDef.action = (_ctx: BehaviorContext) => {
    mgr.playOnce('sleepy');
    mgr.showToast(getCharacterRoutineText('idle.sleepy.toast', undefined, '有点困了呢...'), { category: 'info', duration: 2000, ambientContext: 'behavior' });
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
    mgr.showToast(undefined, { category: 'tip', ambientContext: 'behavior' });
  };
  mgr.registerBehavior(msgDef);

  // ===== 情感自发行为 =====
  const emotionDef = createEmotionBehavior();
  emotionDef.action = (ctx: BehaviorContext) => {
    const emotionCapability = getSpriteCapabilityRuntimeState('emotionExpression');
    if (emotionCapability?.status === 'locked') return;

    const favor = ctx.characterState.favor;
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
    mgr.trigger(picked, { ambientContext: 'behavior' });
  };
  mgr.registerBehavior(emotionDef);

  // ===== 动作自发行为 =====
  const actionDef = createActionBehavior();
  actionDef.action = async (ctx: BehaviorContext) => {
    const favor = ctx.characterState.favor;
    const baseActions = ['sit', 'stand', 'wave', 'talk', 'nod', 'point', 'lookLeft', 'lookRight'];
    const highFavorActions = ['dance', 'spin', 'jump'];

    const pool = favor >= 60 ? [...baseActions, ...highFavorActions] : baseActions;
    const fallbackAction = pickRandomAction(pool);
    const triggeredAt = Date.now();
    const executor = mgr.getSpontaneousUtteranceExecutor();

    if (!executor) {
      mgr.trigger(fallbackAction, { silent: true });
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
          mood: ctx.characterState.mood,
          moodIntensity: ctx.characterState.moodIntensity,
          favor: ctx.characterState.favor,
          level: ctx.characterState.level,
          idleDurationMs: ctx.interactionStats.idleDuration
        }
      });

      if (!utterance?.text?.trim()) {
        mgr.trigger(fallbackAction, { ambientContext: 'behavior' });
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
      const speakResult = await mgr.speak(utterance.text.trim(), { showBubble: true, ambientContext: 'behavior' });
      await reportIdleActionExecution(mgr, utterance, {
        behaviorId: actionDef.id,
        triggeredAt,
        executedAction: picked,
        actionSource,
        spoken: !!speakResult?.ok,
        fallbackUsed: actionSource === 'random-fallback' || !speakResult?.ok,
        ...(speakResult?.error ? { error: speakResult.error } : {})
      });
    } catch (error) {
      if (!actionTriggered) {
        mgr.trigger(fallbackAction, { ambientContext: 'behavior' });
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
      mgr.trigger('christmas', { ambientContext: 'behavior' });
      return;
    }
    if (month === 10 && day === 31) {
      mgr.trigger('halloween', { ambientContext: 'behavior' });
      return;
    }
    if (month === 1 && day === 1) {
      mgr.trigger('newYear', { ambientContext: 'behavior' });
      return;
    }

    if (month >= 3 && month <= 5) {
      mgr.trigger('spring', { ambientContext: 'behavior' });
    } else if (month >= 6 && month <= 8) {
      mgr.trigger('summer', { ambientContext: 'behavior' });
    } else if (month >= 9 && month <= 11) {
      mgr.trigger('autumn', { ambientContext: 'behavior' });
    } else {
      mgr.trigger('winter', { ambientContext: 'behavior' });
    }
  };
  mgr.registerBehavior(seasonalDef);
}
