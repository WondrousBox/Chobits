import { describe, expect, it } from 'vitest';

import { extractPiProviderRequestId, readProviderRequestId } from '../packages/ai/runtime/pi/provider-request-id';

describe('pi provider request id helpers', () => {
  it('reads explicit provider request id keys from metadata objects', () => {
    expect(readProviderRequestId({ providerRequestId: 'provider-req-1' })).toBe('provider-req-1');
    expect(readProviderRequestId({ _request_id: 'provider-req-2' })).toBe('provider-req-2');
  });

  it('extracts nested provider request ids from pi assistant messages', () => {
    expect(
      extractPiProviderRequestId({
        metadata: {
          request_id: 'provider-req-3'
        }
      })
    ).toBe('provider-req-3');

    expect(
      extractPiProviderRequestId({
        response: {
          id: 'resp_123'
        }
      })
    ).toBe('resp_123');
  });
});
