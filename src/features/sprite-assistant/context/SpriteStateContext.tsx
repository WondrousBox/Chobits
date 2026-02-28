/**
 * SpriteStateContext — 被动 IPC 状态接收器
 *
 * 替代旧的 SpritePersonaContext + SpritePlayerContext
 * 不再在渲染进程实例化任何 sprite-core 引擎
 *
 * 职责：
 * 1. 挂载时调用 sprite:get-initial-state 获取初始状态
 * 2. 订阅 sprite:state / sprite:play / sprite:walk / sprite:config 更新 React state
 * 3. 通过 Context 向下传递只读状态
 */

import type { PersonaState } from '@packages/sprite-core';
import type { SpriteConfig, SpriteInitialState, SpritePlayCommand, SpriteStateSnapshot, SpriteWalkState } from '@packages/sprite-core/types';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// ============================================================================
// Context 类型
// ============================================================================

export interface SpriteStateContextValue {
    /** 当前精灵主状态 */
    spriteState: string;
    /** 当前子状态 */
    subState: string | null;
    /** 只读人格状态快照 */
    personaState: PersonaState | null;
    /** 当前播放动画信息 */
    currentAnimation: SpritePlayCommand | null;
    /** 行走方向 */
    walkDirection: 'left' | 'right' | null;
    /** 是否正在行走 */
    isWalking: boolean;
    /** 精灵尺寸配置 */
    spriteConfig: SpriteConfig;
    /** 是否已就绪 */
    ready: boolean;
}

const DEFAULT_CONFIG: SpriteConfig = { width: 180, height: 240, padding: 100 };

const SpriteStateContext = createContext<SpriteStateContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export const SpriteStateProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [spriteState, setSpriteState] = useState<string>('idle');
    const [subState, setSubState] = useState<string | null>(null);
    const [personaState, setPersonaState] = useState<PersonaState | null>(null);
    const [currentAnimation, setCurrentAnimation] = useState<SpritePlayCommand | null>(null);
    const [walkDirection, setWalkDirection] = useState<'left' | 'right' | null>(null);
    const [isWalking, setIsWalking] = useState(false);
    const [spriteConfig, setSpriteConfig] = useState<SpriteConfig>(DEFAULT_CONFIG);
    const [ready, setReady] = useState(false);

    // 初始化：获取初始全量状态
    useEffect(() => {
        let cancelled = false;

        const init = async (): Promise<void> => {
            try {
                const initial: SpriteInitialState = await window.YUA.sprite.getInitialState();
                if (cancelled) return;

                setSpriteState(initial.state ?? 'idle');
                setSubState(initial.subState ?? null);
                setPersonaState(initial.personaState ?? null);
                setCurrentAnimation(initial.currentAnimation ?? null);
                // 优先从 config 取尺寸；如果 config 缺省，从 currentAnimation.playback 取
                const cfg = initial.config ?? DEFAULT_CONFIG;
                const pb = initial.currentAnimation?.playback;
                setSpriteConfig({
                    width: cfg.width ?? pb?.width ?? DEFAULT_CONFIG.width,
                    height: cfg.height ?? pb?.height ?? DEFAULT_CONFIG.height,
                    padding: cfg.padding ?? pb?.padding ?? DEFAULT_CONFIG.padding
                });
                setReady(true);

                // 通知主进程渲染进程已就绪
                await window.YUA.sprite.ready();
            } catch (err) {
                console.error('[SpriteStateContext] Init failed:', err);
                setReady(true); // 即使失败也标记 ready，使用默认值
            }
        };

        init();
        return () => {
            cancelled = true;
        };
    }, []);

    // 订阅 IPC 事件
    useEffect(() => {
        const unsubs: Array<() => void> = [];

        // sprite:state — 状态变化（含人格快照）
        unsubs.push(
            window.YUA.sprite.onState((data: SpriteStateSnapshot) => {
                if (data.state) setSpriteState(data.state);
                if (data.subState !== undefined) setSubState(data.subState);
                if (data.personaSnapshot) setPersonaState(data.personaSnapshot);
            })
        );

        // sprite:play — 播放动画指令
        unsubs.push(
            window.YUA.sprite.onPlay((data: SpritePlayCommand) => {
                setCurrentAnimation(data);
                // 播放指令中如果有 playback 尺寸，更新配置
                if (data.playback) {
                    setSpriteConfig((prev) => ({
                        width: data.playback?.width ?? prev.width,
                        height: data.playback?.height ?? prev.height,
                        padding: data.playback?.padding ?? prev.padding
                    }));
                }
            })
        );

        // sprite:walk — 行走状态
        unsubs.push(
            window.YUA.sprite.onWalk((data: SpriteWalkState) => {
                setIsWalking(data.active);
                setWalkDirection(data.active ? (data.direction ?? null) : null);
            })
        );

        // sprite:config — 配置变化
        unsubs.push(
            window.YUA.sprite.onConfig((data: SpriteConfig) => {
                setSpriteConfig(data);
            })
        );

        return () => unsubs.forEach((u) => u());
    }, []);

    const value = useMemo<SpriteStateContextValue>(
        () => ({
            spriteState,
            subState,
            personaState,
            currentAnimation,
            walkDirection,
            isWalking,
            spriteConfig,
            ready
        }),
        [spriteState, subState, personaState, currentAnimation, walkDirection, isWalking, spriteConfig, ready]
    );

    return <SpriteStateContext.Provider value={value}>{children}</SpriteStateContext.Provider>;
};

// ============================================================================
// Hooks
// ============================================================================

/** 获取完整精灵状态上下文 */
export function useSpriteState(): SpriteStateContextValue {
    const ctx = useContext(SpriteStateContext);
    if (!ctx) throw new Error('useSpriteState must be used within SpriteStateProvider');
    return ctx;
}

/** 仅获取人格状态快照 */
export function usePersonaState(): PersonaState | null {
    const { personaState } = useSpriteState();
    return personaState;
}

/** 仅获取精灵主状态 */
export function useSpriteStateName(): string {
    const { spriteState } = useSpriteState();
    return spriteState;
}
