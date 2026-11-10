import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  CommitSha,
  ExternalLink,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  type AgentPlatformOrganization,
  ORPHANED_DELETE_MERGED,
} from '../../lib/organizations';

const useStyles = makeStyles({
  // bui `Text` sets its own colour; on the alert's tinted background it takes
  // the alert's instead, like its title.
  inherit: {
    color: 'inherit',
  },
  code: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
  },
});

export type OrphanedAlertProps = {
  organization: AgentPlatformOrganization;
};

/**
 * Why the organization's workers are stopped while its file is gone from the
 * installation's git repository: Pending erase after its delete pull request
 * merged, Missing from git otherwise, with the last commit that held the file
 * so it can be restored from there. Nothing while the organization is in git,
 * or was not applied from git.
 */
export function OrphanedAlert({ organization }: OrphanedAlertProps) {
  const classes = useStyles();
  const orphaned = organization.orphaned;
  if (orphaned?.status !== 'True') {
    return null;
  }

  const technical = orphaned.message ? (
    <SimpleAccordion title="Technical details" headingLevel={3}>
      <Text as="p" variant="body-small" className={classes.inherit}>
        <span className={classes.code}>{orphaned.message}</span>
      </Text>
    </SimpleAccordion>
  ) : null;

  if (orphaned.reason === ORPHANED_DELETE_MERGED) {
    return (
      <Alert
        status="info"
        icon
        title="Pending erase"
        description={
          <Flex direction="column" gap="2">
            <Text as="p" variant="body-medium" className={classes.inherit}>
              The pull request that deletes this organization is merged. Its
              workers are stopped, and nothing is erased until an organizations
              admin erases it.
            </Text>
            {technical}
          </Flex>
        }
      />
    );
  }

  const { lastAppliedRevision, lastAppliedRevisionUrl } = organization;
  let lastCommit = null;
  if (lastAppliedRevisionUrl) {
    lastCommit = (
      <ExternalLink href={lastAppliedRevisionUrl} display="inline">
        Open the last commit that held its file
      </ExternalLink>
    );
  } else if (lastAppliedRevision) {
    lastCommit = (
      <Text as="p" variant="body-medium" className={classes.inherit}>
        The last commit that held its file:{' '}
        <CommitSha value={lastAppliedRevision} />
      </Text>
    );
  }

  return (
    <Alert
      status="warning"
      icon
      title="Missing from git"
      description={
        <Flex direction="column" gap="2">
          <Text as="p" variant="body-medium" className={classes.inherit}>
            This organization's file was removed from git without a delete pull
            request, so its workers are stopped. Restore the file to start them
            again.
          </Text>
          {lastCommit}
          {technical}
        </Flex>
      }
    />
  );
}
