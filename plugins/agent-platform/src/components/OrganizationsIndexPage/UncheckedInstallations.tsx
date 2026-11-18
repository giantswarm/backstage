import { useState, type ReactNode } from 'react';
import {
  identityApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Button,
  Flex,
  Link,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The sign-in to a connector is muster's.
import {
  ServerSignIn,
  useConnectorLabel,
  useServerSignIn,
  withInstallationQuery,
} from '@giantswarm/backstage-plugin-muster';
import {
  countNoun,
  useSimpleAccordionStyles,
} from '@giantswarm/backstage-plugin-ui-react';

import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';
import { musterServersExternalRouteRef } from '../../routes';
import type { UncheckedInstallation } from '../OrganizationDirectoryProvider';

const useStyles = makeStyles(theme => ({
  list: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  // A long installation name or error wraps rather than widening the page.
  item: {
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
}));

/** The Connectors page, scoped to one installation, where its Muster sign-in is. */
export function useConnectorsHref(installation?: string): string | undefined {
  const serversRoute = useRouteRef(musterServersExternalRouteRef);
  if (!serversRoute) {
    return undefined;
  }
  return installation
    ? withInstallationQuery(serversRoute(), installation)
    : serversRoute();
}

/** The disclosure's one line: how many installations could not be checked. */
export function uncheckedSummary(count: number): string {
  return `Organizations could not be checked on ${countNoun(count, 'installation')}`;
}

/**
 * The installations that could not be checked for organizations, behind one
 * line closed by default: each with why, in plain words, and what the person
 * can do about it there. Its rows mount only while it is open, so the
 * connector sign-ins in them read nothing until then.
 */
export function UncheckedInstallations({
  unchecked,
  recheck,
}: {
  unchecked: UncheckedInstallation[];
  recheck: (installation: string) => Promise<void>;
}) {
  const accordion = useSimpleAccordionStyles();
  const classes = useStyles();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (unchecked.length === 0) {
    return null;
  }
  const id = 'unchecked-installations';
  return (
    <AccordionGroup
      className={accordion.group}
      expandedKeys={expanded}
      onExpandedChange={next => setExpanded(new Set(next as Set<string>))}
    >
      <Accordion id={id}>
        {/* Body text, not a title: a line under the organizations, not a
            section of its own. */}
        <AccordionTrigger level={2}>
          <Text variant="body-medium" color="secondary">
            {uncheckedSummary(unchecked.length)}
          </Text>
        </AccordionTrigger>
        <AccordionPanel>
          {expanded.has(id) ? (
            <ul className={classes.list} aria-label="Installations not checked">
              {unchecked.map(entry => (
                <li key={entry.installation} className={classes.item}>
                  <UncheckedInstallationRow entry={entry} recheck={recheck} />
                </li>
              ))}
            </ul>
          ) : null}
        </AccordionPanel>
      </Accordion>
    </AccordionGroup>
  );
}

function UncheckedInstallationRow({
  entry: { installation, reason, message },
  recheck,
}: {
  entry: UncheckedInstallation;
  recheck: (installation: string) => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);
  const connectorsHref = useConnectorsHref(installation);
  const checkAgain = async () => {
    setChecking(true);
    try {
      await recheck(installation);
    } finally {
      setChecking(false);
    }
  };
  // Nothing a person does from the portal changes these two.
  const offersCheckAgain =
    reason !== 'unreachable' && reason !== 'sharedIdentity';
  const checkAgainButton = offersCheckAgain ? (
    <Button
      size="small"
      variant="secondary"
      isPending={checking}
      isDisabled={checking}
      onPress={checkAgain}
      aria-label={`Check ${installation} again`}
    >
      Check again
    </Button>
  ) : null;
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-medium" weight="bold">
        {installation}
      </Text>
      {reason === 'connectorSignIn' ? (
        <ConnectorSignInReason
          installation={installation}
          checkAgain={checkAgainButton}
        />
      ) : (
        <>
          <Text variant="body-small">{reasonText(reason, message)}</Text>
          <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
            {reason === 'musterSignIn' && connectorsHref && (
              <Link href={connectorsHref} variant="body-small">
                Sign in to Muster for {installation}
              </Link>
            )}
            {checkAgainButton}
          </Flex>
        </>
      )}
    </Flex>
  );
}

/** What went wrong on the installation the row is titled with. */
function reasonText(
  reason: UncheckedInstallation['reason'],
  message: string,
): string {
  switch (reason) {
    case 'musterSignIn':
      return 'You are not signed in to Muster for this installation.';
    case 'portalSignIn':
      return 'Your sign-in to the portal has expired. Sign in to the portal again, then check again.';
    case 'unreachable':
      return 'The portal cannot reach Muster on this installation.';
    case 'noAnswer':
      return 'Muster on this installation did not answer.';
    case 'sharedIdentity':
      return 'The portal reaches Muster on this installation without a per-user sign-in. Organizations are read as you, so they cannot be read here.';
    default:
      return message;
  }
}

/**
 * agent-manager's connector has no valid sign-in for the person. Where it
 * signs in with the person's portal sign-in through muster's own session
 * (SSO), there is no sign-in to it to offer: a new portal sign-in gives
 * muster a new session, so the row offers the portal's sign-out. Otherwise,
 * and where muster refused that sign-in (only an administrator fixes that),
 * muster's own control says what to do.
 */
function ConnectorSignInReason({
  installation,
  checkAgain,
}: {
  installation: string;
  checkAgain: ReactNode;
}) {
  const label = useConnectorLabel(installation, AGENT_MANAGER_SERVER);
  const signIn = useServerSignIn(AGENT_MANAGER_SERVER, installation, {
    noun: 'connector',
    displayName: label,
  });
  const identityApi = useApi(identityApiRef);
  if (signIn.isSsoManaged && !signIn.isSsoRefused) {
    return (
      <>
        <Text variant="body-small">
          The portal&apos;s connection to this installation has no valid sign-in
          for {label} now. {label} uses your portal sign-in and has no sign-in
          of its own: sign out of the portal and sign in again, then check
          again.
        </Text>
        <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant="secondary"
            onPress={() => {
              void identityApi.signOut();
            }}
          >
            Sign out of the portal
          </Button>
          {checkAgain}
        </Flex>
      </>
    );
  }
  return (
    <>
      <Text variant="body-small">
        You have not signed in to the {label} connector on this installation.
      </Text>
      <ServerSignIn
        noun="connector"
        serverName={AGENT_MANAGER_SERVER}
        displayName={label}
        installation={installation}
      />
      <Flex gap="3" align="center" style={{ flexWrap: 'wrap' }}>
        {checkAgain}
      </Flex>
    </>
  );
}
