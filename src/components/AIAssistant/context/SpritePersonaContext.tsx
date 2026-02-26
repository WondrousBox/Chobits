/**
 * SpritePersonaContext — React 层人格状态上下文
 *
 * 将 sprite-core 中的纯逻辑类实例化并通过 React Context 向下传递。
 * 这是 sprite-core 与 React 组件之间的桥梁层。
 *
 * 提供：
 * - spriteEventBus: 统一事件总线
 * - stateMachine: 精灵状态机
 * - personaState: 人格状态（XP/等级/好感度/心情）
 * - interactionTracker: 交互追踪器
 * - behaviorEngine: 行为引擎
 *
 * 使用方式：
 * ```tsx
 * <SpritePersonaProvider>
 *   <AIAssistant />
 * </SpritePersonaProvider>
 * ```
 */

import {
  BehaviorEngine,
  createAutoWalkBehavior,
  createBoredBehavior,
  createFavorDecayBehavior,
  createRandomMessageBehavior,
  createSleepyBehavior,
  type PersonaState,
  PersonaStateManager,
  InteractionTracker,
  SpriteEventBus,
  type SpriteState,
  SpriteStateMachine
} from '@packages/sprite-core';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

// ============ Context 类型 ============

export interface SpritePersonaContextValue {
  /** 事件总线 */
  eventBus: SpriteEventBus;
  /** 状态机 */
  stateMachine: SpriteStateMachine;
  /** 人格状态管理器 */
  personaStateManager: PersonaStateManager;
  /** 交互追踪器 */
  interactionTracker: InteractionTracker;
  /** 行为引擎 */
  behaviorEngine: BehaviorEngine;

  // --- 衍生状态（React state，自动更新 UI） ---

  /** 当前精灵状态 */
  spriteState: SpriteState;
  /** 当前人格状态快照 */
  personaState: PersonaState;
  /** 是否已初始化完成 */
  ready: boolean;
}

const SpritePersonaContext = createContext<SpritePersonaContextValue | null>(null);

// ============ Provider ============

export const SpritePersonaProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [spriteState, setSpriteState] = useState<SpriteState>('idle');
  const [personaState, setPersonaState] = useState<PersonaState | null>(null);
  const [ready, setReady] = useState(false);

  // 使用 ref 保持实例稳定
  const instancesRef = useRef<{
    eventBus: SpriteEventBus;
    stateMachine: SpriteStateMachine;
    personaStateManager: PersonaStateManager;
    interactionTracker: InteractionTracker;
    behaviorEngine: BehaviorEngine;
  } | null>(null);

  // 一次性初始化所有核心实例
  if (!instancesRef.current) {
    const eventBus = new SpriteEventBus({ maxHistory: 500 });

    const stateMachine = new SpriteStateMachine({ eventBus });

    const personaStateManager = new PersonaStateManager({
      eventBus,
      onStateChange: (state) => setPersonaState(state)
    });

    const interactionTracker = new InteractionTracker({
      eventBus,
      windowSizeMs: 5 * 60 * 1000
    });

    const behaviorEngine = new BehaviorEngine({
      eventBus,
      stateMachine,
      tickIntervalMs: 1000
    });

    instancesRef.current = {
      eventBus,
      stateMachine,
      personaStateManager,
      interactionTracker,
      behaviorEngine
    };
  }

  const { eventBus, stateMachine, personaStateManager, interactionTracker, behaviorEngine } = instancesRef.current;

  // 初始化：从主进程加载游戏状态
  useEffect(() => {
    let cancelled = false;

    const parseAchievements = (raw: string | undefined): string[] => {
      if (!raw) return [];
      try {
        return JSON.parse(raw);
      } catch {
        console.warn('[SpritePersonaProvider] Failed to parse achievements, using empty array');
        return [];
      }
    };

    const init = async (): Promise<void> => {
      try {
        // 从主进程加载游戏状态
        const res = await window.YUA?.persona?.getState?.();
        if (cancelled) return;

        if (res?.ok && res.state) {
          personaStateManager.loadState({
            name: res.state.name,
            xp: res.state.xp ?? 0,
            level: res.state.level ?? 1,
            favor: res.state.favor ?? 50,
            mood: (res.state.mood as any) ?? 'neutral',
            moodIntensity: res.state.moodIntensity ?? 50,
            totalInteractions: res.state.totalInteractions ?? 0,
            totalSessionTime: res.state.totalSessionTime ?? 0,
            loginStreak: res.state.loginStreak ?? 0,
            lastLoginDate: res.state.lastLoginDate ?? '',
            achievements: parseAchievements(res.state.achievements),
            createdAt: res.state.createdAt ?? Date.now(),
            updatedAt: res.state.updatedAt ?? Date.now()
          });
        }

        // 记录每日登录
        await window.YUA?.persona?.recordLogin?.();

        // 启动心情自动衰减
        personaStateManager.startMoodDecay();

        // 初始化 BehaviorEngine
        behaviorEngine.setContextProvider(() => ({
          spriteState: stateMachine.getState(),
          personaState: personaStateManager.getState(),
          interactionStats: interactionTracker.getStats(),
          now: new Date(),
          screenSize: { width: window.innerWidth, height: window.innerHeight }
        }));

        // 注册默认行为
        behaviorEngine.registerAll([
          createAutoWalkBehavior(async () => {
            eventBus.emit('behavior:walk-triggered', {}, 'behavior-engine');
          }),
          createSleepyBehavior(),
          createBoredBehavior(),
          createRandomMessageBehavior(),
          createFavorDecayBehavior()
        ]);

        // 启动行为引擎
        behaviorEngine.start();

        setReady(true);
      } catch (err) {
        console.error('[SpritePersonaProvider] Init failed:', err);
        setReady(true); // 即使失败也标记为 ready，使用默认值
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [personaStateManager, behaviorEngine, stateMachine, interactionTracker, eventBus]);

  // 订阅状态机变化 → 更新 React state
  useEffect(() => {
    const off = stateMachine.onChange((newState) => {
      setSpriteState(newState);
    });
    return off;
  }, [stateMachine]);

  // 定期将人格状态同步到主进程
  useEffect(() => {
    if (!ready) return;

    const syncInterval = setInterval(async () => {
      const state = personaStateManager.getState();
      try {
        await window.YUA?.persona?.updateState?.({
          xp: state.xp,
          level: state.level,
          favor: state.favor,
          mood: state.mood,
          moodIntensity: state.moodIntensity,
          totalInteractions: state.totalInteractions,
          totalSessionTime: state.totalSessionTime,
          loginStreak: state.loginStreak,
          lastLoginDate: state.lastLoginDate,
          achievements: JSON.stringify(state.achievements)
        });
      } catch {
        // 静默失败，下次重试
      }
    }, 30000); // 每 30 秒同步一次

    return () => clearInterval(syncInterval);
  }, [ready, personaStateManager]);

  // 监听主进程推送的状态变化
  useEffect(() => {
    const unsubscribe = window.YUA?.persona?.onStateChanged?.((state) => {
      if (state) {
        // 转换 DB 行格式到 PersonaState 格式
        personaStateManager.loadState({
          name: state.name,
          xp: state.xp ?? 0,
          level: state.level ?? 1,
          favor: state.favor ?? 50,
          mood: state.mood ?? 'neutral',
          moodIntensity: state.moodIntensity ?? 50,
          totalInteractions: state.totalInteractions ?? 0,
          totalSessionTime: state.totalSessionTime ?? 0,
          loginStreak: state.loginStreak ?? 0,
          lastLoginDate: state.lastLoginDate ?? '',
          achievements: typeof state.achievements === 'string' ? JSON.parse(state.achievements) : (state.achievements ?? []),
          createdAt: state.createdAt ?? Date.now(),
          updatedAt: state.updatedAt ?? Date.now()
        });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [personaStateManager]);

  // 清理
  useEffect(() => {
    return () => {
      behaviorEngine.destroy();
      personaStateManager.destroy();
      interactionTracker.destroy();
      stateMachine.destroy();
      eventBus.clear();
    };
  }, [behaviorEngine, personaStateManager, interactionTracker, stateMachine, eventBus]);

  const value = useMemo<SpritePersonaContextValue>(
    () => ({
      eventBus,
      stateMachine,
      personaStateManager,
      interactionTracker,
      behaviorEngine,
      spriteState,
      personaState: personaState ?? personaStateManager.getState(),
      ready
    }),
    [eventBus, stateMachine, personaStateManager, interactionTracker, behaviorEngine, spriteState, personaState, ready]
  );

  return <SpritePersonaContext.Provider value={value}>{children}</SpritePersonaContext.Provider>;
};

// ============ Hooks ============

/** 获取完整的人格上下文 */
export function useSpritePersona(): SpritePersonaContextValue {
  const ctx = useContext(SpritePersonaContext);
  if (!ctx) throw new Error('useSpritePersona must be used within SpritePersonaProvider');
  return ctx;
}

/** 仅获取人格状态（XP/等级/好感度/心情） */
export function usePersonaState(): PersonaState {
  const { personaState } = useSpritePersona();
  return personaState;
}

/** 仅获取精灵状态（idle/walking/etc） */
export function useSpriteState(): SpriteState {
  const { spriteState } = useSpritePersona();
  return spriteState;
}

/** 获取事件总线（用于派发事件） */
export function useSpriteEventBus(): SpriteEventBus {
  const { eventBus } = useSpritePersona();
  return eventBus;
}
