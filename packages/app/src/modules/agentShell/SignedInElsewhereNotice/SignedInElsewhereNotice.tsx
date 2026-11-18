import { Alert, Box } from '@backstage/ui';
import { useMainSessionEnd } from '@giantswarm/backstage-plugin-gs';

export const SIGNED_IN_ELSEWHERE_TITLE = 'You signed in somewhere else';
export const SIGNED_IN_ELSEWHERE_DESCRIPTION =
  'Sign in again here to keep working.';

/**
 * Why the sign-in page shows: the session this browser had ended because the
 * person signed in with the same Dex client elsewhere, as the startup restore
 * learned from the refused refresh. Nothing otherwise. The page's own buttons
 * are the way forward, so the notice has no action. `padded` gives it room of
 * its own, above a page that has no slot for it (upstream's `SignInPage`).
 */
export function SignedInElsewhereNotice({
  padded = false,
}: {
  padded?: boolean;
}) {
  if (useMainSessionEnd() !== 'signed-in-elsewhere') {
    return null;
  }
  const alert = (
    <Alert
      role="alert"
      status="warning"
      icon
      title={SIGNED_IN_ELSEWHERE_TITLE}
      description={SIGNED_IN_ELSEWHERE_DESCRIPTION}
    />
  );
  return padded ? <Box p="4">{alert}</Box> : alert;
}
