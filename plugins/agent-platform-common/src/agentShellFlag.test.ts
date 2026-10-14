import { AGENT_SHELL_FLAG, isAgentShellOn } from './agentShellFlag';

function flags(initial: boolean) {
  let active = initial;
  return {
    isActive: jest.fn((name: string) => name === AGENT_SHELL_FLAG && active),
    set(next: boolean) {
      active = next;
    },
  };
}

describe('isAgentShellOn', () => {
  it('reads the flag once and keeps that value for the app load', () => {
    const on = flags(true);
    expect(isAgentShellOn(on)).toBe(true);

    on.set(false);
    expect(isAgentShellOn(on)).toBe(true);
    expect(on.isActive).toHaveBeenCalledTimes(1);

    const off = flags(false);
    expect(isAgentShellOn(off)).toBe(false);
    off.set(true);
    expect(isAgentShellOn(off)).toBe(false);
  });

  it('latches per FeatureFlagsApi instance, so a new load reads afresh', () => {
    expect(isAgentShellOn(flags(false))).toBe(false);
    expect(isAgentShellOn(flags(true))).toBe(true);
  });
});
