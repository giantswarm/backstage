import { act, renderHook } from '@testing-library/react';
import {
  Agent,
  type AgentInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { PROVISIONING_GRACE_MS } from '../lib/agentProvisioning';
import { useSettingUp } from './useSettingUp';

const CREATED = Date.parse('2026-07-31T12:00:00Z');

const missingCarrier = new Agent(
  {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'Agent',
    metadata: {
      name: 'adhoc',
      namespace: 'kagent',
      generation: 1,
      creationTimestamp: new Date(CREATED).toISOString(),
    },
    spec: { harnessRef: { name: 'kagent' }, template: {} },
    status: {
      observedGeneration: 1,
      conditions: [
        {
          type: 'ResolvedRefs',
          status: 'False',
          reason: 'ReferenceResolutionFailed',
          message: 'resolve RemoteMCPServer "adhoc": not found',
          lastTransitionTime: new Date(CREATED).toISOString(),
        },
      ],
    },
  } as AgentInterface,
  'gazelle',
);

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(CREATED + 60_000);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useSettingUp', () => {
  it('measures the window on the clock it is given, not the browser’s', () => {
    // The browser says one minute old; the server says four.
    const serverNow = () => Date.now() + 3 * 60_000;

    const { result } = renderHook(() =>
      useSettingUp({ agent: missingCarrier }, serverNow),
    );

    expect(result.current).toBe(false);
  });

  it('closes the window on its own when it ends', () => {
    const { result } = renderHook(() =>
      useSettingUp({ agent: missingCarrier }, Date.now),
    );
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(PROVISIONING_GRACE_MS - 60_000);
    });

    expect(result.current).toBe(false);
  });
});
