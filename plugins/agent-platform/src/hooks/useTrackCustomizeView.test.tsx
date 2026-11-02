import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import type { RouteTabCount } from '@giantswarm/backstage-plugin-ui-react';

import type { CustomizeCounts } from '../components/CustomizeDataProvider';
import {
  CUSTOMIZE_VIEW_DEADLINE_MS,
  type MusterViewCounts,
  useTrackCustomizeView,
} from './useTrackCustomizeView';

let mockCounts: CustomizeCounts;
let mockToolchainCount: RouteTabCount | undefined;
jest.mock('../components/CustomizeDataProvider', () => ({
  useCustomizeData: () => ({ settledCounts: mockCounts }),
}));
jest.mock('./useToolchainManager', () => ({
  useScopedToolchainCount: () => mockToolchainCount,
}));

const MUSTER: MusterViewCounts = { connectors: 7, workflows: 0 };

function renderTracking(muster: MusterViewCounts = MUSTER) {
  const analyticsApi = mockApis.analytics.mock();
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
      {children}
    </TestApiProvider>
  );
  const view = renderHook(
    (counts: MusterViewCounts) => useTrackCustomizeView(counts),
    { wrapper, initialProps: muster },
  );
  return { ...view, captureEvent: jest.mocked(analyticsApi.captureEvent) };
}

describe('useTrackCustomizeView', () => {
  beforeEach(() => {
    mockCounts = { agents: 3, skills: 71, models: 1, workspaces: 0 };
    mockToolchainCount = 12;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports every count in its bucket once all are read', () => {
    const { captureEvent } = renderTracking();

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.customizeViewed',
        attributes: {
          agents: '2-4',
          skills: '50-99',
          connectors: '5-9',
          models: '1',
          workflows: '0',
          workspaces: '0',
          toolchains: '10-19',
        },
      }),
    );
  });

  it('waits for a count still being read, and reports once when it lands', () => {
    mockCounts = { ...mockCounts, agents: 'loading' };
    const { captureEvent, rerender } = renderTracking({
      ...MUSTER,
      connectors: 'loading',
    });

    expect(captureEvent).not.toHaveBeenCalled();

    mockCounts = { ...mockCounts, agents: 4 };
    rerender({ ...MUSTER, connectors: 'loading' });
    expect(captureEvent).not.toHaveBeenCalled();

    rerender(MUSTER);
    // A refetch that changes a count reports nothing more.
    mockCounts = { ...mockCounts, agents: 40 };
    rerender(MUSTER);

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          agents: '2-4',
          connectors: '5-9',
        }),
      }),
    );
  });

  it('reports a count that could not be read as unknown, not 0', () => {
    mockCounts = { ...mockCounts, skills: undefined };
    mockToolchainCount = undefined;

    const { captureEvent } = renderTracking();

    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          skills: 'unknown',
          toolchains: 'unknown',
        }),
      }),
    );
  });

  it('stops waiting at the deadline, with what is still being read as unknown', () => {
    jest.useFakeTimers();
    mockToolchainCount = 'loading';
    const { captureEvent } = renderTracking({
      ...MUSTER,
      workflows: 'loading',
    });

    act(() => {
      jest.advanceTimersByTime(CUSTOMIZE_VIEW_DEADLINE_MS - 1);
    });
    expect(captureEvent).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          agents: '2-4',
          workflows: 'unknown',
          toolchains: 'unknown',
        }),
      }),
    );
  });
});
