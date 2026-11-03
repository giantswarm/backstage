import { Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import { useAgentManagerEgressPolicies } from '../../hooks/useAgentManagerEgressPolicies';
import { egressPolicyOriginsLine } from '../EgressPolicyPicker';

const useStyles = makeStyles({
  origins: {
    fontFamily: 'var(--bui-font-monospace)',
    overflowWrap: 'anywhere',
  },
});

/**
 * The EgressPolicies an agent picks, each by name with its origins as
 * `list_egress_policies` reads them for the person: the review's and the
 * agent page's reading of `egressPolicyRefs`. A name the namespace no longer
 * holds says so; until (or unless) the list is read, the names stand alone.
 */
export function PickedEgressPolicies({
  installation,
  namespace,
  names,
  variant = 'body-small',
}: {
  installation: string | undefined;
  namespace: string | undefined;
  names: string[];
  variant?: 'body-small' | 'body-medium';
}) {
  const classes = useStyles();
  const { egressPolicies, isLoading, failure } = useAgentManagerEgressPolicies(
    installation,
    namespace,
  );
  const known = !isLoading && !failure;

  return (
    <Flex direction="column" gap="1">
      {names.map(name => {
        const policy = egressPolicies.find(listed => listed.name === name);
        let detail: string | undefined;
        if (policy) {
          detail = egressPolicyOriginsLine(policy) || 'No origins';
        } else if (known) {
          detail = `Not in ${namespace}: the agent reaches none of its origins`;
        }
        return (
          <div key={name}>
            <Text variant={variant} weight="bold">
              {name}
            </Text>
            {detail && (
              <Text
                as="p"
                variant="body-small"
                color={policy ? 'secondary' : 'danger'}
                className={policy ? classes.origins : undefined}
              >
                {detail}
              </Text>
            )}
          </div>
        );
      })}
    </Flex>
  );
}
