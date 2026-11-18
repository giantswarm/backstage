import { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import type { RouteTabCount } from '@giantswarm/backstage-plugin-ui-react';

import type { CustomizeCounts } from '../components/CustomizeDataProvider';
import {
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

const MUSTER: MusterViewCounts = { connectors: 27, workflows: 0 };

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
    mockCounts = { agents: 23, skills: 137, models: 12, workspaces: 0 };
    mockToolchainCount = 4;
  });

  it('reports every count as its exact number once all are read', () => {
    const { captureEvent } = renderTracking();

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.customizeViewed',
        attributes: {
          agents: 23,
          skills: 137,
          connectors: 27,
          models: 12,
          workflows: 0,
          workspaces: 0,
          toolchains: 4,
        },
      }),
    );
  });

  it('waits for every count still loading, however long, and reports once when the last lands', () => {
    mockCounts = { ...mockCounts, agents: 'loading' };
    mockToolchainCount = 'loading';
    const { captureEvent, rerender } = renderTracking({
      ...MUSTER,
      connectors: 'loading',
    });

    expect(captureEvent).not.toHaveBeenCalled();

    mockCounts = { ...mockCounts, agents: 24 };
    mockToolchainCount = 4;
    rerender({ ...MUSTER, connectors: 'loading' });
    expect(captureEvent).not.toHaveBeenCalled();

    rerender(MUSTER);
    // A refetch that changes a count reports nothing more.
    mockCounts = { ...mockCounts, agents: 40 };
    rerender(MUSTER);

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({ agents: 24, connectors: 27 }),
      }),
    );
  });

  it('leaves out a count that could not be read, never sending it as 0 or text', () => {
    mockCounts = { ...mockCounts, workspaces: undefined };
    mockToolchainCount = undefined;

    const { captureEvent } = renderTracking();

    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: {
          agents: 23,
          skills: 137,
          connectors: 27,
          models: 12,
          workflows: 0,
        },
      }),
    );
  });
});
