import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert } from '@backstage/ui';
import type { ContinuedSession } from '../../../lib/continuationPrompt';
import { sessionDetailRouteRef } from '../../../routes';

export type ContinuedSessionBannerProps = {
  /** The session this one carries on, read off its first message's marker. */
  continues: ContinuedSession;
};

/**
 * Says that this session carries on another, which kagent could not resume,
 * and links to it. Shown in place of the marker line the portal put at the
 * start of the first message (`buildContinuationPrompt`), which is for the
 * model and for places that show the raw text.
 *
 * It also says who wrote that first message, which kagent stores no flag for:
 * unlike a hand-off's one-visit "Prepared by the portal" caption, the marker
 * is in the message, so this shows on every visit.
 *
 * The link names the installation, which may differ from this session's; the
 * page's own title ("Continued: …") already names the topic.
 */
export function ContinuedSessionBanner({
  continues,
}: ContinuedSessionBannerProps) {
  const sessionDetailRoute = useRouteRef(sessionDetailRouteRef);
  const href = sessionDetailRoute?.({
    installation: continues.installation,
    sessionId: continues.sessionId,
  });
  const earlier = `an earlier session on ${continues.installation}`;

  return (
    <Alert
      status="info"
      title="Resumed session"
      description={
        <>
          This session is a follow-up to{' '}
          {/* core-components' `Link`, which routes client-side. */}
          {href ? <Link to={href}>{earlier}</Link> : earlier}, which could not
          be resumed. The portal prepared its first message from that
          conversation.
        </>
      }
      data-testid="continued-session-banner"
    />
  );
}
