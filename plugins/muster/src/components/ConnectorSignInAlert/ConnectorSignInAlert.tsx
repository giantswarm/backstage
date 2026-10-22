import { useEffect, useRef } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import {
  INITIAL_ROWS,
  joinNames,
  ShowMore,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterSignInRequiredOf } from '../../apis/musterUnauthorized';
import { ServerSignIn } from '../shared/ServerSignIn';
import { useServerSignIn } from '../shared/useServerSignIn';

export type ConnectorSignInAlertProps = {
  /** The connector (muster server) the data is read through. */
  server: string;
  /** The installations whose read asked for the person's sign-in to it. */
  installations: string[];
  /**
   * What the sign-in lets the person see, completing "Sign in to <server>
   * to …": `see GPU node pools`.
   */
  purpose: string;
  /**
   * Called once a sign-in completes, to read again what is not under the
   * `['muster', …]` query prefix: those reads are invalidated by the sign-in
   * itself.
   */
  onSignedIn?: () => void;
};

/**
 * In place of a read that failed because the person has not signed in to the
 * connector it goes through: names the connector and the data that needs it,
 * and offers the connector's sign-in (muster's `core_auth_login`, the same
 * flow as everywhere else) per installation. Once a sign-in lands, every
 * `['muster', …]` query is read again and `onSignedIn` runs, so the page
 * fills in without a reload.
 */
export function ConnectorSignInAlert({
  server,
  installations,
  purpose,
  onSignedIn,
}: ConnectorSignInAlertProps) {
  const several = installations.length > 1;
  return (
    <Alert
      status="info"
      title={`Sign in to ${server} to ${purpose}`}
      data-testid="connector-sign-in"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            {server} reads this with your own sign-in, and you have not signed
            in to it on {joinNames(installations)} yet. Sign in once; this fills
            in by itself.
          </Text>
          <ShowMore
            items={installations}
            initial={INITIAL_ROWS}
            noun="environment"
          >
            {visible => (
              <Flex direction="column" gap="2">
                {visible.map(installation => (
                  <InstallationSignIn
                    key={installation}
                    server={server}
                    installation={installation}
                    showInstallation={several}
                    onSignedIn={onSignedIn}
                  />
                ))}
              </Flex>
            )}
          </ShowMore>
        </Flex>
      }
    />
  );
}

function InstallationSignIn({
  server,
  installation,
  showInstallation,
  onSignedIn,
}: {
  server: string;
  installation: string;
  showInstallation: boolean;
  onSignedIn?: () => void;
}) {
  const { status } = useServerSignIn(server, installation, {
    noun: 'connector',
  });
  // A sign-in landed: muster's status moved to connected from a status it
  // had read before. Not on first sight of `connected`, which may be stale
  // next to the read that just asked for the sign-in.
  const lastKnown = useRef(status?.status);
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;
  useEffect(() => {
    const current = status?.status;
    if (current === undefined) {
      return;
    }
    const previous = lastKnown.current;
    lastKnown.current = current;
    if (
      previous !== undefined &&
      previous !== 'connected' &&
      current === 'connected'
    ) {
      onSignedInRef.current?.();
    }
  }, [status?.status]);

  const signIn = (
    <ServerSignIn
      noun="connector"
      serverName={server}
      installation={installation}
    />
  );
  if (!showInstallation) {
    return signIn;
  }
  return (
    <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
      <Text variant="body-small" weight="bold">
        {installation}
      </Text>
      {signIn}
    </Flex>
  );
}

/** One connector whose sign-in failed reads ask for, and where. */
export type ConnectorSignIn = { server: string; installations: string[] };

/**
 * Splits per-installation read failures into the connector sign-ins they ask
 * for (in the order first seen) and every other failure, which the page
 * reports as it did.
 */
export function splitConnectorSignIns<
  T extends { installation: string; error: unknown },
>(entries: readonly T[]): { signIns: ConnectorSignIn[]; others: T[] } {
  const byServer = new Map<string, string[]>();
  const others: T[] = [];
  for (const entry of entries) {
    const signIn = musterSignInRequiredOf(entry.error);
    if (!signIn) {
      others.push(entry);
      continue;
    }
    const installations = byServer.get(signIn.server) ?? [];
    if (!installations.includes(entry.installation)) {
      installations.push(entry.installation);
    }
    byServer.set(signIn.server, installations);
  }
  return {
    signIns: [...byServer].map(([server, installations]) => ({
      server,
      installations,
    })),
    others,
  };
}
