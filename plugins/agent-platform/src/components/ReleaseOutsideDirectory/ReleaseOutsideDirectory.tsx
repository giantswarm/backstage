import type { ReactNode } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  EmptyStateCard,
  ExternalLink,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';

import type { MissingReleaseFile } from '../../lib/agentManager';

const useStyles = makeStyles({
  // A repository and a path are long words: at phone width they break
  // anywhere rather than push the page sideways (ExternalLink lays its text
  // out as a flex item, which would otherwise not shrink below it).
  name: {
    overflowWrap: 'anywhere',
    minWidth: 0,
  },
  message: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
    margin: 0,
  },
});

/** The directory agent-manager writes to, under the Kustomization's own path. */
const AGENT_MANAGER_DIRECTORY = '/agent-manager';

/**
 * The path the agent's Kustomization builds from, which holds the file that
 * defines its release: agent-manager writes into `agent-manager/` under it,
 * and its refusal names that directory. `undefined` for a directory of another
 * shape, which then is not guessed at.
 */
export function kustomizationPathOf(
  missing: MissingReleaseFile,
): string | undefined {
  const { directory } = missing;
  if (!directory.endsWith(AGENT_MANAGER_DIRECTORY)) {
    return undefined;
  }
  return directory.slice(0, -AGENT_MANAGER_DIRECTORY.length) || undefined;
}

const COPY = {
  edit: { title: 'This agent cannot be edited here', verb: 'Change it in' },
  delete: {
    title: 'This agent cannot be deleted here',
    verb: 'Remove it from',
  },
};

function Where({
  missing,
  action,
}: {
  missing: MissingReleaseFile;
  action: keyof typeof COPY;
}) {
  const classes = useStyles();
  const path = kustomizationPathOf(missing);
  const repository = `https://github.com/${missing.repository}`;
  return (
    <>
      It is defined in Git outside the directory the portal writes to.{' '}
      {COPY[action].verb}{' '}
      <ExternalLink href={repository}>
        <span className={classes.name}>{missing.repository}</span>
      </ExternalLink>
      {path ? (
        <>
          , under{' '}
          <ExternalLink href={`${repository}/tree/HEAD/${path}`}>
            <span className={classes.name}>{path}</span>
          </ExternalLink>
          .
        </>
      ) : (
        '.'
      )}
    </>
  );
}

function TechnicalDetails({ message }: { message: string }) {
  const classes = useStyles();
  return (
    <SimpleAccordion title="Technical details" headingLevel={3}>
      <Text as="p" variant="body-small" className={classes.message}>
        {message}
      </Text>
    </SimpleAccordion>
  );
}

export type ReleaseOutsideDirectoryProps = {
  missing: MissingReleaseFile;
  /** agent-manager's refusal, verbatim, for Technical details. */
  message: string;
  /** What the person came to do. */
  action: keyof typeof COPY;
  /**
   * `page` in place of a form (an empty state with `actions` under it);
   * `alert` where a write was about to happen (a dialog, the review).
   */
  variant: 'page' | 'alert';
  actions?: ReactNode;
};

/**
 * Why agent-manager cannot open a pull request for the agent: it writes a
 * release only in its own file in its directory, and this agent's is defined
 * elsewhere in the repository (the platform's hand-written agents, say). That
 * is how the agent is set up, not a fault, so it reads as information: where
 * to change the agent instead, linked to the repository and, where the
 * refusal says, to the path the agent's Kustomization builds from. The
 * refusal itself is under Technical details.
 */
export function ReleaseOutsideDirectory({
  missing,
  message,
  action,
  variant,
  actions,
}: ReleaseOutsideDirectoryProps) {
  const { title } = COPY[action];
  if (variant === 'page') {
    return (
      <EmptyStateCard
        title={title}
        description={<Where missing={missing} action={action} />}
        actions={actions}
      >
        <TechnicalDetails message={message} />
      </EmptyStateCard>
    );
  }
  return (
    <Alert
      status="info"
      icon
      title={title}
      description={
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-medium">
            <Where missing={missing} action={action} />
          </Text>
          <TechnicalDetails message={message} />
        </Flex>
      }
    />
  );
}
