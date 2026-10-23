import {
  Alert,
  Checkbox,
  CheckboxGroup,
  FieldLabel,
  Flex,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

import { useAgentManagerEgressPolicies } from '../../hooks/useAgentManagerEgressPolicies';
import { useHarnessChoices } from '../../hooks/useHarnessChoices';
import type { AgentManagerEgressPolicy } from '../../lib/agentManager';
import { isCodingRuntime } from '../../lib/harnesses';
import { tenantAdminsOf } from '../../lib/tenants';
import { useNewAgentForm } from '../NewAgentFormProvider';

const useStyles = makeStyles({
  origins: {
    fontFamily: 'var(--bui-font-monospace)',
    overflowWrap: 'anywhere',
  },
});

const LABEL = 'EgressPolicies';

/** "3 origins": how many origins a policy opens. */
function originCount(policy: AgentManagerEgressPolicy): string {
  const count = policy.destinations.length;
  return `${count} ${count === 1 ? 'origin' : 'origins'}`;
}

/**
 * A policy's origins in one line, each with the header the egress gateway
 * fills from the policy's credential: `https://api.github.com (adds
 * Authorization)`. The review and the agent's page read them the same way.
 */
export function egressPolicyOriginsLine(
  policy: AgentManagerEgressPolicy,
): string {
  return policy.destinations
    .map(destination =>
      destination.credentialHeader
        ? `${destination.origin} (adds ${destination.credentialHeader})`
        : destination.origin,
    )
    .join(' · ');
}

/**
 * The Extra egress section's **EgressPolicies**: the shared sets of origins
 * the tenant admins keep in the agent's namespace (`list_egress_policies`, as
 * the person), picked by name beside the typed origins. Offered where
 * agent-manager takes `egressPolicyRefs` (`get_info`'s `egressPolicies`
 * capability), never on a coding Harness, which reaches its platform list
 * only. An edited agent's pick no longer listed stays shown, so it is
 * removed on purpose, never dropped unseen.
 */
export function EgressPolicyPicker() {
  const classes = useStyles();
  const { state, edit, setEgressPolicyRefs } = useNewAgentForm();
  const { installation } = state;
  const namespace = state.tenant ?? state.modelConfigNamespace;
  const { supported, egressPolicies, isLoading, failure } =
    useAgentManagerEgressPolicies(installation, namespace);

  // The Harness's runtime: the picked choice's, else the namespace's
  // Harness of that name. Until it is known, a Harness other than the
  // platform's may be a coding one, so nothing is offered yet.
  const harnessName = state.harness?.name ?? edit?.agent.harness;
  const { choices, platformHarness } = useHarnessChoices(
    installation,
    harnessName ? namespace : undefined,
  );
  const runtime =
    state.harness?.runtime ??
    choices.find(choice => choice.name === harnessName)?.runtime;
  const onPlatformHarness = !harnessName || harnessName === platformHarness;
  if (
    !installation ||
    !namespace ||
    !supported ||
    isCodingRuntime(runtime) ||
    (!onPlatformHarness && runtime === undefined)
  ) {
    return null;
  }

  const picked = state.egressPolicyRefs;
  const unlisted = isLoading
    ? []
    : picked.filter(name => !egressPolicies.some(p => p.name === name));
  const withCredential = egressPolicies.some(policy =>
    policy.destinations.some(destination => destination.credentialHeader),
  );
  const admins = tenantAdminsOf(namespace);
  const description = `Shared sets of origins kept in ${namespace} by ${admins}. A change to a policy reaches the agent from its next session on.${
    withCredential
      ? ' Where an origin names a header, the gateway adds it from the policy’s credential and the agent acts with it.'
      : ''
  }`;

  if (isLoading && picked.length === 0) {
    return (
      <Flex direction="column" gap="2">
        <FieldLabel label={LABEL} secondaryLabel="optional" />
        <Text variant="body-small" color="secondary" role="status">
          Loading the EgressPolicies of {namespace}…
        </Text>
      </Flex>
    );
  }

  const failureNotice = failure ? (
    <div role="status">
      <Alert
        status="warning"
        title={`Could not read the EgressPolicies of ${namespace}`}
        description={`${failure.message} The policies already picked are kept; reload the page to try again.`}
      />
    </div>
  ) : null;

  if (egressPolicies.length === 0 && picked.length === 0) {
    return (
      <Flex direction="column" gap="2">
        <FieldLabel label={LABEL} secondaryLabel="optional" />
        {failureNotice ?? (
          <Text variant="body-small" color="secondary">
            No EgressPolicies in {namespace}.{' '}
            {admins.replace(/^./, c => c.toUpperCase())} can add them.
          </Text>
        )}
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="2">
      {failureNotice}
      <CheckboxGroup
        label={LABEL}
        secondaryLabel="optional"
        description={description}
        value={picked}
        onChange={setEgressPolicyRefs}
      >
        {egressPolicies.map(policy => (
          <Checkbox key={policy.name} value={policy.name}>
            <Flex direction="column" gap="0.5">
              <Text>
                <Text as="span" weight="bold">
                  {policy.name}
                </Text>{' '}
                <Text as="span" variant="body-small" color="secondary">
                  {originCount(policy)}
                </Text>
              </Text>
              {policy.destinations.length > 0 && (
                <Text
                  variant="body-small"
                  color="secondary"
                  className={classes.origins}
                >
                  {egressPolicyOriginsLine(policy)}
                </Text>
              )}
            </Flex>
          </Checkbox>
        ))}
        {unlisted.map(name => (
          <Checkbox key={name} value={name}>
            <Flex direction="column" gap="0.5">
              <Text weight="bold">{name}</Text>
              <Text variant="body-small" color="secondary">
                {failure
                  ? 'Picked; its origins could not be read.'
                  : `Not in ${namespace} any more: the agent reaches none of its origins. Unpick it, or ask ${admins} to restore it.`}
              </Text>
            </Flex>
          </Checkbox>
        ))}
      </CheckboxGroup>
    </Flex>
  );
}
