import { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';

import type { PortalEvent } from './events';
import { useTrackedView } from './useTrackedView';

function viewed(turns: '0' | '1' | '2-4'): PortalEvent {
  return { name: 'AgentPlatform.sessionViewed', attributes: { turns } };
}

function renderView(initial: { event?: PortalEvent; openKey?: string }) {
  const analyticsApi = mockApis.analytics.mock();
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
      {children}
    </TestApiProvider>
  );
  return {
    ...renderHook(
      ({ event, openKey }: { event?: PortalEvent; openKey?: string }) =>
        useTrackedView(event, openKey),
      { wrapper, initialProps: initial },
    ),
    captureEvent: analyticsApi.captureEvent,
  };
}

describe('useTrackedView', () => {
  it('reports nothing until the event is known', () => {
    const { captureEvent } = renderView({ event: undefined });
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it('reports the event once it is known', () => {
    const { captureEvent, rerender } = renderView({ event: undefined });

    rerender({ event: viewed('1') });

    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionViewed',
        attributes: { turns: '1' },
      }),
    );
  });

  it('reports nothing more on re-renders, polls and refetches', () => {
    const { captureEvent, rerender } = renderView({ event: viewed('1') });

    rerender({ event: viewed('1') });
    rerender({ event: viewed('2-4') });
    rerender({ event: undefined });
    rerender({ event: viewed('2-4') });

    expect(captureEvent).toHaveBeenCalledTimes(1);
  });

  it('reports again when the mounted page opens something else', () => {
    const { captureEvent, rerender } = renderView({
      event: viewed('1'),
      openKey: 'a',
    });

    rerender({ event: undefined, openKey: 'b' });
    rerender({ event: viewed('0'), openKey: 'b' });
    rerender({ event: viewed('2-4'), openKey: 'b' });

    expect(captureEvent).toHaveBeenCalledTimes(2);
    expect(captureEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ attributes: { turns: '0' } }),
    );
  });

  it('reports again when the page is opened anew', () => {
    const first = renderView({ event: viewed('1') });
    first.unmount();
    const second = renderView({ event: viewed('1') });

    expect(first.captureEvent).toHaveBeenCalledTimes(1);
    expect(second.captureEvent).toHaveBeenCalledTimes(1);
  });
});
