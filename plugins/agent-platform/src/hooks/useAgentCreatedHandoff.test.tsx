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

  // Everything downstream — the status query key and the give-up timer — hangs
  // off what the adoption carries. Two writes can start from the same
  // generation (press Update skills twice on an agent whose release cannot
  // reconcile, so the template never moves), and keying on that alone would
  // serve the second write the first's settled, timed-out result: no waiting
  // alert, the previous verdict instantly, as if it had already converged.
  it('watches each write separately, even when both start from the same generation', async () => {
    const write = { ...created, action: 'updated' as const, fromGeneration: 4 };
    const { result } = renderAt({ [AGENT_CREATED_STATE_KEY]: write });

    const first = result.current.handoff?.watchId;
    expect(first).toBeDefined();

    await waitFor(() => {
      expect(result.current.locationState).toBeNull();
    });

    act(() => {
      result.current.navigate(
        { pathname: AGENT_URL },
        { replace: true, state: { [AGENT_CREATED_STATE_KEY]: write } },
      );
    });

    await waitFor(() => {
      expect(result.current.handoff?.watchId).not.toBe(first);
    });
    // Still the same write, still the same baseline — only the watch is new.
    expect(result.current.handoff?.fromGeneration).toBe(4);
  });

  // A create has no revision to wait for, so it shares the plain watch rather
  // than taking a key of its own — which is what keeps it sharing one poll with
  // the detail page's own existence check.
  it('leaves a create without a watch of its own', () => {
    const { result } = renderAt({ [AGENT_CREATED_STATE_KEY]: created });

    expect(result.current.handoff?.watchId).toBeUndefined();
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
