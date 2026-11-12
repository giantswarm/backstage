import { Alert, Button, Flex, Text } from '@backstage/ui';

import { PORTAL_SESSION_ENDED_MESSAGE } from '../../lib/portalSession';

/** Reloads the page, which signs the person in to the portal again. */
function reloadPage() {
  window.location.reload();
}

/**
 * The portal refused the person's session token (`PortalSessionEndedError`):
 * says so in plain words, never the backend's text, with the way on, a
 * reload that signs in again. `afterSignIn` says what the person finds
 * after it, where the page keeps something (a credential request whose id
 * is in the address).
 */
export function PortalSessionEndedAlert({
  afterSignIn,
  onSignIn = reloadPage,
}: {
  afterSignIn?: string;
  /** Signs in again; a reload of the page unless a test says otherwise. */
  onSignIn?: () => void;
}) {
  return (
    <Alert
      status="warning"
      title="Your portal session ended"
      description={
        <Flex direction="column" gap="2" align="start">
          <Text variant="body-small">{PORTAL_SESSION_ENDED_MESSAGE}</Text>
          {afterSignIn ? <Text variant="body-small">{afterSignIn}</Text> : null}
          <Button variant="secondary" size="small" onPress={onSignIn}>
            Sign in again
          </Button>
        </Flex>
      }
    />
  );
}
