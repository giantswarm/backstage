import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

import {
  AGENT_CREATED_STATE_KEY,
  useAgentCreatedHandoff,
} from './useAgentCreatedHandoff';

const AGENT_URL = '/agent-platform/agents/gazelle/kagent/sre-agent';

const created = {
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'sre-agent',
  requestedBy: 'marian',
  action: 'created' as const,
};

const skillsUpdated = { ...created, action: 'skills-updated' as const };

/**
 * Renders the hook alongside the live router state, so clearing is observable,
 * and hands back a `navigate` so a test can make a write to the same URL —
 * which is what `Update skills` does.
 */
function renderAt(state?: unknown) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <MemoryRouter initialEntries={[{ pathname: AGENT_URL, state }]}>
      {children}
    </MemoryRouter>
  );

  return renderHook(
    () => ({
      handoff: useAgentCreatedHandoff(),
      locationState: useLocation().state,
      navigate: useNavigate(),
    }),
    { wrapper },
  );
}

describe('useAgentCreatedHandoff', () => {
  it('reads the handoff the create flow left in the router state', () => {
    const { result } = renderAt({ [AGENT_CREATED_STATE_KEY]: created });

    expect(result.current.handoff).toEqual(created);
  });

  it('clears the router state, so a reload or Back does not replay it', async () => {
    const { result } = renderAt({ [AGENT_CREATED_STATE_KEY]: created });

    await waitFor(() => {
      expect(result.current.locationState).toBeNull();
    });
    // Held locally, or the caller would lose it the moment it was cleared.
    expect(result.current.handoff).toEqual(created);
  });

  it('leaves any other router state alone while taking its own key out', async () => {
    const { result } = renderAt({
      [AGENT_CREATED_STATE_KEY]: created,
      somethingElse: 'keep me',
    });

    await waitFor(() => {
      expect(result.current.locationState).toEqual({
        somethingElse: 'keep me',
      });
    });
  });

  // The regression. `Update skills` runs from the page the progress renders on
  // and navigates to the URL it is already on, so nothing unmounts: a handoff
  // read only at mount was never seen, and never cleared either — so the next
  // reload of that URL surfaced it, stale.
  it('picks up a handoff that arrives while the page stays mounted', async () => {
    const { result } = renderAt();

    expect(result.current.handoff).toBeUndefined();

    act(() => {
      result.current.navigate(
        { pathname: AGENT_URL },
        {
          replace: true,
          state: { [AGENT_CREATED_STATE_KEY]: skillsUpdated },
        },
      );
    });

    await waitFor(() => {
      expect(result.current.handoff).toEqual(skillsUpdated);
    });
    // And it is consumed, not left behind for the next reload to replay.
    await waitFor(() => {
      expect(result.current.locationState).toBeNull();
    });
  });

  it('replaces the first handoff when a second write arrives', async () => {
    const { result } = renderAt({ [AGENT_CREATED_STATE_KEY]: created });

    await waitFor(() => {
      expect(result.current.locationState).toBeNull();
    });

    act(() => {
      result.current.navigate(
        { pathname: AGENT_URL },
        {
          replace: true,
          state: { [AGENT_CREATED_STATE_KEY]: skillsUpdated },
        },
      );
    });

    await waitFor(() => {
      expect(result.current.handoff).toEqual(skillsUpdated);
    });
  });

  it.each([
    ['no state at all', undefined],
    ['an unrelated key', { other: 'value' }],
    [
      'a handoff missing its name',
      {
        [AGENT_CREATED_STATE_KEY]: {
          installation: 'gazelle',
          namespace: 'kagent',
        },
      },
    ],
  ])('returns nothing for %s', (_case, state) => {
    const { result } = renderAt(state);

    expect(result.current.handoff).toBeUndefined();
  });

  it('defaults an unrecognised action to the create wording', () => {
    const { result } = renderAt({
      [AGENT_CREATED_STATE_KEY]: { ...created, action: 'teleported' },
    });

    expect(result.current.handoff?.action).toBe('created');
  });
});
