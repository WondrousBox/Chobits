import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  clipboard: {
    clear: vi.fn(),
    readHTML: vi.fn(() => ''),
    readImage: vi.fn(() => ({ isEmpty: () => true })),
    readRTF: vi.fn(() => ''),
    readText: vi.fn(() => ''),
    write: vi.fn()
  },
  nativeImage: {
    createFromBuffer: vi.fn()
  }
}));

describe('selected text clipboard shortcut', () => {
  it('uses Command+C to copy selections on macOS', async () => {
    const { resolveSelectionCopyShortcut } = await import('../electron/main/selected-text/protected-clipboard-selection-reader');

    expect(resolveSelectionCopyShortcut({ C: 46, Ctrl: 29, Meta: 3675 }, 'darwin')).toEqual({
      key: 46,
      label: 'Command+C',
      modifiers: [3675]
    });
  });

  it('uses Ctrl+C to copy selections on non-macOS platforms', async () => {
    const { resolveSelectionCopyShortcut } = await import('../electron/main/selected-text/protected-clipboard-selection-reader');

    expect(resolveSelectionCopyShortcut({ C: 46, Ctrl: 29, Meta: 3675 }, 'win32')).toEqual({
      key: 46,
      label: 'Ctrl+C',
      modifiers: [29]
    });
  });
});
