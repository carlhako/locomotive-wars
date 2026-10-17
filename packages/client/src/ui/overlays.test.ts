import { describe, expect, it } from 'vitest';
import { canReconnect, disconnectAction, disconnectMessage, disconnectTitle } from './overlays.ts';

describe('disconnect overlay text', () => {
  it('explains each reason', () => {
    for (const reason of ['version', 'full', 'malformed', 'timeout', 'closed', 'kicked'] as const) {
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

describe('server full and kicked screens', () => {
  it('shows the counts and a Retry button for a full server', () => {
    expect(disconnectMessage('full', { humans: 16, max: 16 })).toBe('Server full (16/16)');
    expect(disconnectTitle('full')).toBe('SERVER FULL');
    expect(disconnectAction('full')).toBe('Retry');
  });

  it('says why and offers Rejoin after an idle kick', () => {
    expect(disconnectMessage('kicked')).toBe('Kicked for inactivity');
    expect(disconnectTitle('kicked')).toBe('KICKED');
    expect(disconnectAction('kicked')).toBe('Rejoin');
    expect(canReconnect('kicked')).toBe(true);
  });

  it('keeps Reconnect for a lost connection', () => {
    expect(disconnectTitle('closed')).toBe('DISCONNECTED');
    expect(disconnectAction('closed')).toBe('Reconnect');
  });
});
