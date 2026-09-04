import { describe, expect, it } from 'vitest';

import { gptSovitsDefinition } from '../../packages/ai/providers/builtins/gpt-sovits/definition';
import { vllmDefinition } from '../../packages/ai/providers/builtins/vllm/definition';
import { isMaskedSecretValue, MASKED_SECRET_VALUE, maskSecretConfigValues, splitSecretFormValues, stripUnchangedSecretValues } from '../../packages/ai/secret-masking';

describe('secret-masking', () => {
  it('masks password fields in builtin default configs', () => {
    for (const definition of [gptSovitsDefinition, vllmDefinition]) {
      const masked = maskSecretConfigValues(definition.defaults.config || {}, definition.schema.fields);
      // apiKey 不明文下发；baseUrl 等非敏感字段保持原值
      expect(masked.apiKey).toBe(MASKED_SECRET_VALUE);
      expect(masked.apiKey).not.toBe(definition.defaults.config?.apiKey);
      expect(masked.baseUrl).toBe(definition.defaults.config?.baseUrl);
    }
  });

  it('leaves non-password fields untouched and skips empty secrets', () => {
    const fields = [
      { key: 'apiKey', type: 'password' },
      { key: 'baseUrl', type: 'text' }
    ];
    expect(maskSecretConfigValues({ apiKey: '', baseUrl: 'https://example.com' }, fields)).toEqual({ apiKey: '', baseUrl: 'https://example.com' });
  });

  it('splits form values into editable fields and masked keys', () => {
    const fields = [
      { key: 'apiKey', type: 'password' },
      { key: 'baseUrl', type: 'text' }
    ];
    const { editableValues, maskedKeys } = splitSecretFormValues({ apiKey: 'sk-real', baseUrl: 'https://example.com', extra: '' }, fields);
    expect(editableValues).toEqual({ baseUrl: 'https://example.com', extra: '' });
    expect(maskedKeys).toEqual(['apiKey']);
  });

  it('strips unchanged secret values on save so the mask is never persisted', () => {
    const fields = [
      { key: 'apiKey', type: 'password' },
      { key: 'baseUrl', type: 'text' }
    ];
    expect(stripUnchangedSecretValues({ apiKey: '', baseUrl: 'https://example.com' }, fields)).toEqual({ baseUrl: 'https://example.com' });
    expect(stripUnchangedSecretValues({ apiKey: MASKED_SECRET_VALUE }, fields)).toEqual({});
    expect(stripUnchangedSecretValues({ apiKey: 'sk-new' }, fields)).toEqual({ apiKey: 'sk-new' });
  });

  it('detects the mask placeholder value', () => {
    expect(isMaskedSecretValue(MASKED_SECRET_VALUE)).toBe(true);
    expect(isMaskedSecretValue('sk-real')).toBe(false);
    expect(isMaskedSecretValue(undefined)).toBe(false);
  });
});
