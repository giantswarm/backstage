import { useEffect, useRef } from 'react';
import { useAnalytics } from '@backstage/core-plugin-api';

import type { PortalEvent } from './events';

/**
 * Reports a page's view event once per opening of the page, through
 * Backstage's analytics API as `useTrackedMutation` reports a write: the
 * app's connector forwards it if it is on the list with valid attributes.
 *
 * `event` is undefined until what the event says has loaded, and the event
 * goes the first time it is defined. Later renders, polls and refetches that
 * change it send nothing. `openKey` names what the page shows (an agent, a
 * session) and stays in the browser: a page that stays mounted while the
 * address moves to another one reports that one too. Unmounting ends the
 * opening, so coming back to the page reports again.
 */
export function useTrackedView(
  event: PortalEvent | undefined,
  openKey: string = '',
): void {
  const analytics = useAnalytics();
  const reportedFor = useRef<string | undefined>(undefined);
  // The event as of this render, read when the effect runs: the effect
  // itself waits only for the event to become known or the key to change,
  // not for every new event object a polling page builds.
  const latest = useRef(event);
  latest.current = event;
  const isKnown = event !== undefined;

  useEffect(() => {
    const current = latest.current;
    if (!current || reportedFor.current === openKey) {
      return;
    }
    reportedFor.current = openKey;
    analytics.captureEvent(current.name, current.name, {
      attributes: current.attributes,
    });
  }, [analytics, isKnown, openKey]);
}
