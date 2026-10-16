import { describe, expect, it } from 'vitest';
import { canReconnect, disconnectMessage } from './overlays.ts';

describe('disconnect overlay text', () => {
  it('explains each reason', () => {
    for (const reason of ['version', 'full', 'malformed', 'timeout', 'closed'] as const) {
      expect(disconnectMessage(reason).length).toBeGreaterThan(10);
    }
  });

  it('offers reconnect unless the client itself is out of date', () => {
    expect(canReconnect('closed')).toBe(true);
    expect(canReconnect('timeout')).toBe(true);
    expect(canReconnect('full')).toBe(true);
    expect(canReconnect('version')).toBe(false);
    expect(canReconnect('malformed')).toBe(false);
  });
});
