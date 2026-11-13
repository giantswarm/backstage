import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  CommitSha,
  ExternalLink,
  SimpleAccordion,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  ORPHANED_DELETE_MERGED,
  type OrganizationStatus,
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

/**
 * Pending erase: the organization's delete pull request merged (Orphaned,
 * reason DeleteMerged) and it is not being erased yet. Its files are gone from
 * git, so nothing on its page is changed any more: the page offers reading and
 * Erase now only.
 */
export function isPendingErase(
  organization: Pick<OrganizationStatus, 'deleting' | 'orphaned'>,
): boolean {
  return (
    !organization.deleting &&
    organization.orphaned?.status === 'True' &&
    organization.orphaned.reason === ORPHANED_DELETE_MERGED
  );
}

export type OrganizationStatusAlertProps = {
  organization: OrganizationStatus;
  /** Offered on Pending erase only, to a person who manages it. */
  onEraseNow?: () => void;
  /**
   * The id of the line that says, on Pending erase, why the page's changes are
   * off: the disabled controls name it with `aria-describedby`.
   */
  changesOffId?: string;
};

/**
 * Why the organization's workers are stopped. Erasing once it is deleted,
 * whether it was applied from git or not: the operator then erases it and no
 * longer updates its conditions. Otherwise, while its file is gone from the
 * installation's git repository: Pending erase after its delete pull request
 * merged, Missing from git otherwise, with the last commit that held the file
 * so it can be restored from there. Nothing while the organization is in git,
 * or was not applied from git.
 */
export function OrganizationStatusAlert({
  organization,
  onEraseNow,
  changesOffId,
}: OrganizationStatusAlertProps) {
  const classes = useStyles();
  if (organization.deleting) {
    return (
      <Alert
        status="info"
        icon
        title="Erasing"
        description={
          <Flex direction="column" gap="2">
            <Text as="p" variant="body-medium" className={classes.inherit}>
              This organization is deleted and is being erased. Its workers are
              stopped.
            </Text>
            {organization.erasureStep && (
              <SimpleAccordion title="Technical details" headingLevel={3}>
                <Text as="p" variant="body-small" className={classes.inherit}>
                  The operator's erasure step:{' '}
                  <span className={classes.code}>
                    {organization.erasureStep}
                  </span>
                </Text>
              </SimpleAccordion>
            )}
          </Flex>
        }
      />
    );
  }

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
              The pull request that deletes this organization is merged, and its
              workers are stopped. Its agents, connectors, credentials and
              members are kept until it is erased.
            </Text>
            <Text
              as="p"
              variant="body-medium"
              className={classes.inherit}
              id={changesOffId}
            >
              Its members, models and credentials can no longer be changed.
            </Text>
            {onEraseNow && (
              <div>
                <Button variant="secondary" onPress={onEraseNow}>
                  Erase now
                </Button>
              </div>
            )}
            {technical}
          </Flex>
        }
      />
    );
  }

  const { lastAppliedRevision, lastAppliedRevisionUrl } = organization;
  // A `div`: the link's visually hidden "opens in a new tab" is one, which a
  // `p` cannot hold.
  const lastCommit = lastAppliedRevision ? (
    <Text as="div" variant="body-medium" className={classes.inherit}>
      The last commit that held its file:{' '}
      {lastAppliedRevisionUrl ? (
        <ExternalLink href={lastAppliedRevisionUrl} display="inline">
          <CommitSha value={lastAppliedRevision} copy={false} />
        </ExternalLink>
      ) : (
        <CommitSha value={lastAppliedRevision} />
      )}
    </Text>
  ) : null;

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
