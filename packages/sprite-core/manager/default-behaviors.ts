/**
 * 默认行为注册
 *
 * 将所有内置自发行为（自动行走、困倦、无聊、随机消息等）
 * 从 SpriteManager 中抽取为独立函数。
 */

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
import type { SpriteManager } from './sprite-manager';

/** 注册所有默认行为到 SpriteManager */
export function registerDefaultBehaviors(mgr: SpriteManager): void {
  // 自动行走
  mgr.registerBehavior(
    createAutoWalkBehavior(async (_ctx) => {
      if (!mgr.isAutoWalkEnabled()) return;
      if (!(mgr as any).windowController) return;

      const pos = mgr.getPosition();
      const screen = (mgr as any).getScreenSize();
      const config = mgr.getSpriteConfig();

      const minX = -config.padding;
      const maxX = screen.width - config.width - config.padding;
      const targetX = Math.random() * (maxX - minX) + minX;

      const yRange = screen.height * 0.1;
      const yMin = Math.max(-config.padding, pos[1] - yRange);
      const yMax = Math.min(screen.height - config.height - config.padding, pos[1] + yRange);
      const targetY = Math.random() * (yMax - yMin) + yMin;

      await mgr.walkTo(targetX, targetY);
    })
  );

  // 困倦
  const sleepyDef = createSleepyBehavior();
  sleepyDef.action = (_ctx) => {
    mgr.playOnce('sleepy');
    mgr.showToast(undefined, { category: 'reminder' });
  };
  mgr.registerBehavior(sleepyDef);

  // 长时间闲置困倦（100秒无交互）
  const idleSleepyDef = createIdleSleepyBehavior();
  idleSleepyDef.action = (_ctx) => {
    mgr.playOnce('sleepy');
    mgr.showToast('有点困了呢...', { category: 'info', duration: 2000 });
  };
  mgr.registerBehavior(idleSleepyDef);

  // 无聊
  const boredDef = createBoredBehavior();
  boredDef.action = (_ctx) => {
    mgr.transitionTo('bored');
  };
  mgr.registerBehavior(boredDef);

  // 随机消息
  const msgDef = createRandomMessageBehavior();
  msgDef.action = (_ctx) => {
    mgr.showToast(undefined, { category: 'tip' });
  };
  mgr.registerBehavior(msgDef);

  // 好感度衰减
  const decayDef = createFavorDecayBehavior();
  decayDef.action = (_ctx) => {
    mgr.changeFavor(-1, 'idle-decay');
  };
  mgr.registerBehavior(decayDef);

  // ===== 情感自发行为 =====
  const emotionDef = createEmotionBehavior();
  emotionDef.action = (ctx) => {
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
  actionDef.action = (ctx) => {
    const favor = ctx.personaState.favor;
    const baseActions = ['sit', 'stand', 'wave', 'nod', 'point', 'lookLeft', 'lookRight'];
    const highFavorActions = ['dance', 'spin', 'jump'];

    const pool = favor >= 60 ? [...baseActions, ...highFavorActions] : baseActions;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    mgr.trigger(picked);
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
