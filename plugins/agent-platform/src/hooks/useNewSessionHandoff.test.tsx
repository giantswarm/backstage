import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

import {
  NEW_SESSION_STATE_KEY,
  useNewSessionHandoff,
} from './useNewSessionHandoff';

const handoff = {
  text: 'why is the ingress failing?',
  agentNamespace: 'kagent',
  agentName: 'sre-agent',
};

/** Renders the hook alongside the live router state, so clearing is observable. */
function renderWithState(state: unknown) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <MemoryRouter
      initialEntries={[{ pathname: '/sessions/gazelle/abc', state }]}
    >
      {children}
    </MemoryRouter>
  );

  return renderHook(
    () => ({
      handoff: useNewSessionHandoff(),
      locationState: useLocation().state,
    }),
    { wrapper },
  );
}

describe('useNewSessionHandoff', () => {
  it('reads the handoff out of the router state', () => {
    const { result } = renderWithState({ [NEW_SESSION_STATE_KEY]: handoff });

    expect(result.current.handoff).toEqual(handoff);
  });

  it('clears the router state, so a reload or Back cannot re-send the message', async () => {
    // Router state survives both. Without this, coming back to the session would
    // silently start a second paid turn with the same prompt.
    const { result } = renderWithState({ [NEW_SESSION_STATE_KEY]: handoff });

    await waitFor(() => {
      expect(result.current.locationState).toBeNull();
    });
  });

  it('keeps returning the handoff after the state has been cleared', async () => {
    // Held in local state rather than read from the location, or the caller would
    // lose it the moment it was cleared.
    const { result } = renderWithState({ [NEW_SESSION_STATE_KEY]: handoff });

    await waitFor(() => {
      expect(result.current.locationState).toBeNull();
    });
    expect(result.current.handoff).toEqual(handoff);
  });

  it('does not navigate when there is nothing to consume', () => {
    const { result } = renderWithState(null);

    expect(result.current.handoff).toBeUndefined();
    // The state was already null; what matters is that it stayed put rather than
    // being replaced on a page nobody navigated to with a prompt.
    expect(result.current.locationState).toBeNull();
  });

  it.each([
    ['no state at all', undefined],
    ['an unrelated state', { somethingElse: true }],
    ['a non-object handoff', { [NEW_SESSION_STATE_KEY]: 'send this' }],
    ['a missing text', { [NEW_SESSION_STATE_KEY]: { ...handoff, text: '' } }],
    [
      'a missing agent namespace',
      { [NEW_SESSION_STATE_KEY]: { ...handoff, agentNamespace: undefined } },
    ],
    [
      'a non-string agent name',
      { [NEW_SESSION_STATE_KEY]: { ...handoff, agentName: 42 } },
    ],
  ])('ignores %s', (_label, state) => {
    // Router state is not ours alone — anything can put anything there, and a
    // half-formed handoff must not dispatch a turn against a guessed agent.
    const { result } = renderWithState(state);

    expect(result.current.handoff).toBeUndefined();
  });
});
