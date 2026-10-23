import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { joinNames } from '@giantswarm/backstage-plugin-ui-react';

import type { DroppedEgress } from '../NewAgentFormProvider';

const useStyles = makeStyles({
  origins: {
    fontFamily: 'var(--bui-font-monospace)',
    overflowWrap: 'anywhere',
  },
});

/** "the extra origins a and b and the EgressPolicy c", as entered. */
function droppedPhrase({ origins, policies }: DroppedEgress): string {
  const parts = [
    origins.length > 0 &&
      `the extra ${origins.length === 1 ? 'origin' : 'origins'} ${joinNames(origins)}`,
    policies.length > 0 &&
      `the ${policies.length === 1 ? 'EgressPolicy' : 'EgressPolicies'} ${joinNames(policies)}`,
  ].filter(Boolean);
  return parts.join(' and ');
}

/**
 * The agent form's egress on a coding Harness, in place of Extra egress
 * origins: such an agent reaches the platform's list for its Harness only and
 * agent-manager refuses any other origin (`guardCoding`), so nothing is
 * offered that would be refused. `origins` is that list where the portal
 * knows it (`platformEgressOf`); without it, the line says only who sets it.
 * What a move to the Harness took out of the form is said once, beneath.
 */
export function PlatformEgressNote({
  runtime,
  origins,
  dropped,
}: {
  /** The Harness as a person names it (`harnessTitle`). */
  runtime: string;
  origins?: string[];
  dropped?: DroppedEgress;
}) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="2">
      <FieldLabel label="Network access" />
      {origins ? (
        <Text variant="body-small" color="secondary">
          Set by the platform for {runtime}:{' '}
          <span className={classes.origins}>{origins.join(', ')}</span>. Extra
          origins cannot be added.
        </Text>
      ) : (
        <Text variant="body-small" color="secondary">
          The platform sets what {runtime} agents may reach. Extra origins
          cannot be added.
        </Text>
      )}
      {dropped && (
        <div role="status">
          <Alert
            status="info"
            title="Extra egress removed"
            description={`${runtime} agents reach only the addresses the platform allows, so ${droppedPhrase(
              dropped,
            )} ${
              dropped.origins.length + dropped.policies.length === 1
                ? 'was'
                : 'were'
            } removed.`}
          />
        </div>
      )}
    </Flex>
  );
}
