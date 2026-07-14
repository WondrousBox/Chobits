import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMiniDom, type MiniDomEnvironment } from './utils/minidom';

const analyzerMock = vi.hoisted(() => ({
  resume: vi.fn(async () => undefined)
}));

vi.mock('../src/pages/ResourcePage/components/Players/MediaPlayer/useMusicReactivityAnalyzer', () => ({
  useMusicReactivityAnalyzer: () => analyzerMock.resume
}));

vi.mock('../src/pages/ResourcePage/components/Players/MediaPlayer/AudioWaveformView', () => ({
  AudioWaveformView: () => null
}));

vi.mock('../src/pages/ResourcePage/components/Players/MediaPlayer/CenterPlayButton', async () => {
  const React = await import('react');
  return {
    CenterPlayButton: ({ onTogglePlay }: { onTogglePlay: () => void }) => React.createElement('button', { onClick: onTogglePlay }, 'play')
  };
});

vi.mock('../src/pages/ResourcePage/components/Players/MediaPlayer/MediaControls', () => ({
  MediaControls: () => null
}));

describe('MediaPlayer audio context playback', () => {
  let env: MiniDomEnvironment;

  beforeEach(() => {
    env = installMiniDom();
    analyzerMock.resume.mockReset();
    analyzerMock.resume.mockResolvedValue(undefined);
  });

  afterEach(() => {
    env.cleanup();
  });

  it.each(['audio', 'video'] as const)('loads %s through anonymous CORS', async (type) => {
    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MediaPlayer } = await import('../src/pages/ResourcePage/components/Players/MediaPlayer/MediaPlayer');
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<MediaPlayer src="res://local/test.mp3" type={type} />);
    });

    expect(env.container.querySelector(type)?.getAttribute('crossorigin')).toBe('anonymous');

    await act(async () => root.unmount());
  });

  it('resumes the Web Audio context before starting manual playback', async () => {
    const calls: string[] = [];
    analyzerMock.resume.mockImplementation(async () => {
      calls.push('resume');
    });

    const { act } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { MediaPlayer } = await import('../src/pages/ResourcePage/components/Players/MediaPlayer/MediaPlayer');
    const root = createRoot(env.container as any);

    await act(async () => {
      root.render(<MediaPlayer src="res://local/test.mp3" type="video" />);
    });

    const video = env.container.querySelector('video') as any;
    video.paused = true;
    video.play = vi.fn(async () => {
      calls.push('play');
    });

    await act(async () => {
      env.container.querySelector('button')?.dispatchEvent({ type: 'click' });
      await Promise.resolve();
    });

    expect(calls).toEqual(['resume', 'play']);

    await act(async () => root.unmount());
  });
});
