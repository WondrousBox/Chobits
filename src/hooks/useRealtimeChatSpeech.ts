import type { SpriteRealtimeSpeechHandle, SpriteRealtimeSpeechScope, SpriteSpeakChatRealtimeSpeechConfig } from '@packages/sprite-core/speak/types';
import { useCallback, useEffect, useRef } from 'react';

import { PcmStreamPlayer } from '@/lib/audio/pcm-stream-player';

const SENTENCE_BOUNDARY_RE = /[。！？!?]$/;
const SOFT_BOUNDARY_RE = /[，,、；;：:]$/;

function normalizeDeltaText(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function shouldSkipText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^`+$/.test(trimmed)) return true;
  if (/^[-*_#>\s]+$/.test(trimmed)) return true;
  return false;
}

function shouldFlush(buffer: string, config: SpriteSpeakChatRealtimeSpeechConfig): boolean {
  const trimmed = buffer.trim();
  if (!trimmed) return false;
  if (trimmed.length >= config.chunking.maxChars) return true;
  if (config.chunking.flushOnPunctuation && SENTENCE_BOUNDARY_RE.test(trimmed)) return true;
  if (trimmed.length >= Math.max(config.chunking.minChars, Math.floor(config.chunking.maxChars * 0.7)) && SOFT_BOUNDARY_RE.test(trimmed)) return true;
  return false;
}

export function useRealtimeChatSpeech(scope: SpriteRealtimeSpeechScope) {
  const handleRef = useRef<SpriteRealtimeSpeechHandle | null>(null);
  const playerRef = useRef<PcmStreamPlayer | null>(null);
  const configRef = useRef<SpriteSpeakChatRealtimeSpeechConfig | null>(null);
  const textBufferRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);
  const startingRef = useRef<Promise<SpriteRealtimeSpeechHandle | null> | null>(null);
  const finishingRef = useRef(false);

  const clearFlushTimer = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const stopPlayer = useCallback((mode: 'end' | 'cancel' = 'cancel') => {
    const player = playerRef.current;
    playerRef.current = null;
    if (!player) return;
    if (mode === 'end') {
      player.end();
    } else {
      player.cancel();
    }
  }, []);

  const disposeHandle = useCallback(async (mode: 'finish' | 'cancel' = 'cancel') => {
    clearFlushTimer();
    textBufferRef.current = '';
    const handle = handleRef.current;
    if (mode === 'finish') {
      if (finishingRef.current) return;
      finishingRef.current = true;
    } else {
      finishingRef.current = false;
      handleRef.current = null;
      startingRef.current = null;
    }
    if (!handle) {
      if (mode === 'cancel') {
        stopPlayer('cancel');
      }
      return;
    }
    try {
      if (mode === 'finish') {
        await handle.finish();
        return;
      } else {
        await handle.cancel();
      }
    } catch {
      //
    } finally {
      if (mode === 'cancel') {
        handle.dispose();
        stopPlayer('cancel');
      }
    }
  }, [clearFlushTimer, stopPlayer]);

  const ensureHandle = useCallback(async (): Promise<SpriteRealtimeSpeechHandle | null> => {
    if (finishingRef.current && handleRef.current) {
      const previous = handleRef.current;
      finishingRef.current = false;
      handleRef.current = null;
      try {
        await previous.cancel();
      } catch {
        //
      } finally {
        previous.dispose();
        stopPlayer('cancel');
      }
    }
    if (handleRef.current) return handleRef.current;
    if (startingRef.current) return startingRef.current;

    startingRef.current = (async () => {
      try {
        const config = await window.YUA.sprite.getSpeakConfig();
        const realtimeConfig = config.chatRealtimeSpeech;
        configRef.current = realtimeConfig;
        if (!config.enabled || config.engine !== 'ai-provider' || !realtimeConfig.enabled || !realtimeConfig.scopes[scope]) {
          return null;
        }

        finishingRef.current = false;
        const handle = await window.YUA.sprite.startRealtimeSpeechSession({ source: 'chat', scope });
        handle.on((event) => {
          if (event.type === 'started') {
            if (!playerRef.current) {
              const volume = realtimeConfig.playback.volume ?? config.volume ?? 1;
              const player = new PcmStreamPlayer({
                channels: event.data.channels,
                fadeInMs: realtimeConfig.playback.fadeInMs,
                fadeOutMs: realtimeConfig.playback.fadeOutMs,
                sampleFormat: event.data.sampleFormat,
                sampleRate: event.data.sampleRate,
                startBufferMs: realtimeConfig.playback.startBufferMs,
                volume
              });
              playerRef.current = player;
              void player.start().catch((error) => {
                console.warn('[realtime-chat-speech] Failed to start PCM player:', error);
              });
            }
            return;
          }

          if (event.type === 'audio_delta') {
            if (!playerRef.current) {
              const volume = realtimeConfig.playback.volume ?? config.volume ?? 1;
              const player = new PcmStreamPlayer({
                channels: event.data.channels,
                fadeInMs: realtimeConfig.playback.fadeInMs,
                fadeOutMs: realtimeConfig.playback.fadeOutMs,
                sampleFormat: event.data.sampleFormat,
                sampleRate: event.data.sampleRate,
                startBufferMs: realtimeConfig.playback.startBufferMs,
                volume
              });
              playerRef.current = player;
              void player.start().then(() => player.append(event.data.chunk)).catch((error) => {
                console.warn('[realtime-chat-speech] Failed to play PCM chunk:', error);
              });
              return;
            }
            playerRef.current.append(event.data.chunk);
            return;
          }

          if (event.type === 'done') {
            finishingRef.current = false;
            stopPlayer('end');
            handleRef.current = null;
            startingRef.current = null;
            handle.dispose();
          }

          if (event.type === 'error') {
            finishingRef.current = false;
            console.warn('[realtime-chat-speech] Session error:', event.data.message);
            stopPlayer('cancel');
          }
        });
        handleRef.current = handle;
        return handle;
      } catch (error) {
        console.warn('[realtime-chat-speech] Failed to start session:', error);
        return null;
      } finally {
        startingRef.current = null;
      }
    })();

    return startingRef.current;
  }, [scope, stopPlayer]);

  const flushBuffer = useCallback(async (withFlush = false) => {
    clearFlushTimer();
    const text = textBufferRef.current;
    textBufferRef.current = '';
    if (!text.trim()) return;
    const handle = await ensureHandle();
    if (!handle) return;
    await handle.appendText(text);
    if (withFlush) {
      await handle.flush();
    }
  }, [clearFlushTimer, ensureHandle]);

  const scheduleFlush = useCallback(() => {
    clearFlushTimer();
    const config = configRef.current;
    const delay = config?.chunking.maxDelayMs ?? 350;
    flushTimerRef.current = window.setTimeout(() => {
      void flushBuffer(false);
    }, delay);
  }, [clearFlushTimer, flushBuffer]);

  const appendDelta = useCallback((delta: string) => {
    const text = normalizeDeltaText(delta || '');
    if (shouldSkipText(text)) return;

    void ensureHandle().then(() => {
      const config = configRef.current;
      if (!config?.enabled) return;
      textBufferRef.current += text;
      if (shouldFlush(textBufferRef.current, config)) {
        void flushBuffer(SENTENCE_BOUNDARY_RE.test(textBufferRef.current.trim()));
      } else if (textBufferRef.current.trim().length >= config.chunking.minChars) {
        scheduleFlush();
      }
    });
  }, [ensureHandle, flushBuffer, scheduleFlush]);

  const complete = useCallback(async () => {
    await flushBuffer(true);
    await disposeHandle('finish');
  }, [disposeHandle, flushBuffer]);

  const cancel = useCallback(async () => {
    await disposeHandle('cancel');
  }, [disposeHandle]);

  useEffect(() => {
    return () => {
      void disposeHandle('cancel');
    };
  }, [disposeHandle]);

  return {
    appendDelta,
    cancel,
    complete
  };
}
