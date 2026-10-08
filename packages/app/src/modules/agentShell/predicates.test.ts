import { AGENT_SHELL_FLAG, agentShellOff, agentShellOn } from './predicates';

describe('agent shell predicates', () => {
  it('names a valid feature flag', () => {
    expect(AGENT_SHELL_FLAG).toBe('agent-platform-shell');
    expect(AGENT_SHELL_FLAG).toMatch(/^[a-z]+[a-z0-9-]+$/);
  });

  it('matches when the flag is active', () => {
    expect(agentShellOn).toEqual({
      featureFlags: { $contains: 'agent-platform-shell' },
    });
  });

  it('matches when the flag is not active', () => {
    expect(agentShellOff).toEqual({
      $not: { featureFlags: { $contains: 'agent-platform-shell' } },
    });
  });
});
