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

/** Why, in plain words; the same whatever the person came to do. */
const WHY =
  'This agent is defined in Git outside the directory the portal writes to.';

/**
 * What the person came to do, and what the notice says about it: a title, and
 * where to make the change instead, around the repository's link.
 */
const COPY: Record<
  'skills' | 'harness' | 'edit' | 'delete',
  { title: string; where: (repository: ReactNode) => ReactNode }
> = {
  skills: {
    title: 'Skills cannot be updated here',
    where: repository => (
      <>
        Change the skill pins in the file that defines it in {repository}: pin
        each skill marked “Moves to the head” to the head commit shown for it
        above.
      </>
    ),
  },
  harness: {
    title: 'The Harness cannot be changed here',
    where: repository => (
      <>Change the Harness in the file that defines it in {repository}.</>
    ),
  },
  edit: {
    title: 'This agent cannot be edited here',
    where: repository => (
      <>Change it in the file that defines it in {repository}.</>
    ),
  },
  delete: {
    title: 'This agent cannot be deleted here',
    where: repository => (
      <>Remove it from the file that defines it in {repository}.</>
    ),
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
 * is how the agent is set up, not a fault, so it reads as information, and
 * the visible part says only what the person needs: that it cannot be done
 * here, why in plain words, and where to do it instead, the repository
 * linked. What agent-manager checked, and its own words, are folded under
 * Technical details. Where the release is defined instead is not something
 * agent-manager knows, so the notice does not claim a place. One explanation
 * for every action that runs into it — Update skills, Change Harness, Edit
 * and Delete — worded per action.
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

  const repository = (
    <Link
      href={`https://github.com/${missing.repository}`}
      target="_blank"
      rel="noopener noreferrer"
      // The size of the sentence it sits in: the empty state's is larger.
      variant={variant === 'page' ? 'body-large' : 'body-medium'}
      className={tint}
    >
      <span className={classes.code}>{missing.repository}</span>
    </Link>
  );
  const explanation = (
    <>
      {WHY} {copy.where(repository)}
    </>
  );
  const technical = (
    <SimpleAccordion title="Technical details" headingLevel={3}>
      <Flex direction="column" gap="2">
        <Text as="p" variant="body-small" className={tint}>
          agent-manager edits the HelmRelease{' '}
          <span className={classes.code}>{missing.release}</span> only in{' '}
          <span className={classes.code}>{missing.path}</span>, and{' '}
          <span className={classes.code}>{missing.repository}</span> has no such
          file.
        </Text>
        {message && (
          <Text as="p" variant="body-small" className={tint}>
            <span className={classes.code}>{message}</span>
          </Text>
        )}
      </Flex>
    </SimpleAccordion>
  );

  if (variant === 'page') {
    return (
      <EmptyStateCard
        title={copy.title}
        description={explanation}
        actions={actions}
      >
        {technical}
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
            {explanation}
          </Text>
          {technical}
        </Flex>
      }
    />
  );
}
