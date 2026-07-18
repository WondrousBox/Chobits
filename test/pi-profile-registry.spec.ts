import { describe, expect, it } from 'vitest';

import { listPiAgentProfiles } from '../packages/ai/runtime/pi/profile-registry';

describe('listPiAgentProfiles', () => {
  it('exposes the supported chat modes', () => {
    expect(
      listPiAgentProfiles().map((profile) => ({
        id: profile.id,
        label: profile.label
      }))
    ).toEqual([
      { id: 'chat', label: '对话模式' },
      { id: 'assistant', label: 'Agent模式' },
      { id: 'coder', label: '代码模式' }
    ]);
  });

  it('keeps chat and assistant replies concise with a dedicated self-introduction', () => {
    const profiles = listPiAgentProfiles();
    const chat = profiles.find((profile) => profile.id === 'chat');
    const assistant = profiles.find((profile) => profile.id === 'assistant');

    expect(chat?.instructions).toContain('## 回复风格');
    expect(chat?.instructions).toContain('## 自我介绍');
    expect(chat?.instructions).toContain('能力也要非常简短地介绍');
    expect(chat?.instructions).toContain('不要主动使用标题、复杂列表、表格');

    expect(assistant?.instructions).toContain('## 你的身份');
    expect(assistant?.instructions).toContain('## 工具箱');
    expect(assistant?.instructions).toContain('## 记忆');
    expect(assistant?.instructions).toContain('## 回复风格');
    expect(assistant?.instructions).toContain('## 自我介绍');
    expect(assistant?.instructions).toContain('我是你的 AI 助手，可以陪你对话、梳理信息和完成任务。需要什么直接告诉我就好。');
  });
});
