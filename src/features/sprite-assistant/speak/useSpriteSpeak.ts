/**
 * useSpriteSpeak Hook
 *
 * 在渲染进程中监听语音合成播放事件，
 * 通过 HTML5 Audio API 播放合成的音频文件。
 *
 * 使用方式：在 AIAssistant 组件中调用 useSpriteSpeak() 即可。
 */

import { useCallback, useEffect, useRef } from 'react';

import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';

/**
 * 监听 SpriteManager 的 speak 事件并播放音频
 */
export function useSpriteSpeak(): { stop: () => void } {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    /** 停止当前正在播放的音频 */
    const stop = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current.src = '';
            audioRef.current = null;
        }
    }, []);

    /** 播放音频文件 */
    const play = useCallback(
        (audioPath: string, volume: number) => {
            // 停止上一个
            stop();

            try {
                // 将绝对路径转为 res:// 协议 URL
                const src = makeResSrc(audioPath);
                const audio = new Audio(src);
                audio.volume = Math.max(0, Math.min(1, volume));

                audio.addEventListener('ended', () => {
                    audioRef.current = null;
                });

                audio.addEventListener('error', (e) => {
                    console.error('[useSpriteSpeak] Audio playback error:', e);
                    audioRef.current = null;
                });

                audioRef.current = audio;
                audio.play().catch((err) => {
                    console.error('[useSpriteSpeak] Failed to play audio:', err);
                    audioRef.current = null;
                });
            } catch (err) {
                console.error('[useSpriteSpeak] Error creating Audio:', err);
            }
        },
        [stop]
    );

    // 订阅 sprite:speak 事件
    useEffect(() => {
        const sprite = window.YUA?.sprite;
        if (!sprite?.onSpeak) {
            console.warn('[useSpriteSpeak] sprite.onSpeak not available');
            return;
        }

        const cleanup = sprite.onSpeak((payload) => {
            if (payload?.audioPath) {
                play(payload.audioPath, payload.volume ?? 1);
            }
        });

        return () => {
            stop();
            cleanup?.();
        };
    }, [play, stop]);

    return { stop };
}
