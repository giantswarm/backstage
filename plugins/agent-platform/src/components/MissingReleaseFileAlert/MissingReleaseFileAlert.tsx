import type { ReactNode } from 'react';
import { Alert, Flex, Link, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  EmptyStateCard,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';

import type { MissingReleaseFile } from '../../lib/agentManager';

const useStyles = makeStyles({
  // bui `Text` and `Link` set their own colour (`--bui-fg-primary`); on the
  // alert's tinted background they take the alert's instead, like its title.
  inherit: {
    color: 'inherit',
  },
  code: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
  },
});

/**
 * What the person came to do, and what the notice says about it: a title, the
 * plain-words sentence that leads, and, for skills, what to change by hand.
 */
const COPY = {
  skills: {
    title: 'Skills cannot be updated here',
    lead: "To update the skills, change their pins in the agent's GitOps source.",
    byHand:
      'In the file that defines the release, pin each skill marked “Moves to the head” to the head commit shown for it above.',
  },
  harness: {
    title: 'The Harness cannot be changed here',
    lead: "To change the Harness, change it in the agent's GitOps source.",
    byHand: undefined,
  },
  edit: {
    title: 'This agent cannot be edited here',
    lead: 'It is defined in Git outside the directory the portal writes to. Change it in the file that defines it.',
    byHand: undefined,
  },
  delete: {
    title: 'This agent cannot be deleted here',
    lead: 'It is defined in Git outside the directory the portal writes to. Remove it from the file that defines it.',
    byHand: undefined,
  },
};

export type MissingReleaseFileAction = keyof typeof COPY;

export type MissingReleaseFileAlertProps = {
  missing: MissingReleaseFile;
  action: MissingReleaseFileAction;
  /** agent-manager's refusal, verbatim, folded under Technical details. */
  message?: string;
  /**
   * `alert` where a write was about to happen (a dialog, the edit review);
   * `page` in place of a form, an empty state with `actions` under it.
   */
  variant?: 'alert' | 'page';
  actions?: ReactNode;
};

/**
 * Why agent-manager cannot open a pull request for the agent: it edits a
 * release only in its own file, and that file is not in the repository. That
 * is how the agent is set up, not a fault, so it reads as information: what
 * the person can do, in plain words, first; then, a step smaller, what
 * agent-manager checked, in the repository it names. Where the release is
 * defined instead is not something agent-manager knows, so the notice does
 * not claim a place. One explanation for every action that runs into it —
 * Update skills, Change Harness, Edit and Delete — worded per action.
 */
export function MissingReleaseFileAlert({
  missing,
  action,
  message,
  variant = 'alert',
  actions,
}: MissingReleaseFileAlertProps) {
  const classes = useStyles();
  const copy = COPY[action];
  const tint = variant === 'alert' ? classes.inherit : undefined;

  const checked = (
    <Text as="p" variant="body-small" className={tint}>
      agent-manager edits the HelmRelease{' '}
      <span className={classes.code}>{missing.release}</span> only in{' '}
      <span className={classes.code}>{missing.path}</span>, and{' '}
      <Link
        href={`https://github.com/${missing.repository}`}
        target="_blank"
        rel="noopener noreferrer"
        variant="body-small"
        className={tint}
      >
        <span className={classes.code}>{missing.repository}</span>
      </Link>{' '}
      has no such file.{copy.byHand ? ` ${copy.byHand}` : ''}
    </Text>
  );
  const technical = message ? (
    <SimpleAccordion title="Technical details" headingLevel={3}>
      <Text as="p" variant="body-small" className={tint}>
        <span className={classes.code}>{message}</span>
      </Text>
    </SimpleAccordion>
  ) : null;

  if (variant === 'page') {
    return (
      <EmptyStateCard
        title={copy.title}
        description={copy.lead}
        actions={actions}
      >
        <Flex direction="column" gap="2">
          {checked}
          {technical}
        </Flex>
      </EmptyStateCard>
    );
  }
  return (
    <Alert
      status="info"
      icon
      title={copy.title}
      description={
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-medium" className={tint}>
            {copy.lead}
          </Text>
          {checked}
          {technical}
        </Flex>
      }
    />
  );
}
