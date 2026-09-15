import { useParams } from 'react-router-dom';
import { SessionDetailPage } from '../SessionDetailPage';

/**
 * One `SessionDetailPage` **per session**.
 *
 * The route element persists across a change of its own parameters, so a
 * navigation from one session's page straight to another's — the way out of a
 * session whose runtime is lost lands on a fresh session with the same agent —
 * would reuse the page instance: its "first message dispatched" latch, the
 * message it was holding for a redraft, an open rename dialog would all carry
 * over to a conversation they have nothing to do with, and the new session's
 * handoff would never be read. Keying on the session's identity remounts the
 * page, which is what a different session is.
 */
export function SessionDetailRoute() {
  const { installation = '', sessionId = '' } = useParams();
  return <SessionDetailPage key={`${installation}/${sessionId}`} />;
}
