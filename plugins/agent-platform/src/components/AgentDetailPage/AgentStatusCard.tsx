import { Alert, Flex, Text } from '@backstage/ui';
import {
  Agent,
  AgentHarness,
  HarnessReadiness,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConditionsList,
  InfoCard,
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';

import { READINESS_PRESENTATION } from '../AgentsTable/readinessStatus';

/**
 * How one Harness's verdict presents, in the vocabulary agent-manager's
 * `get_agent_status` uses (`ready` | `progressing` | `failed`), plus the
 * "nothing written yet" state.
 */
const HARNESS_READINESS_PRESENTATION: Record<
  HarnessReadiness,
  { label: string; intent: StatusLabelIntent }
> = {
  ready: { label: 'Ready', intent: 'positive' },
  progressing: { label: 'Progressing', intent: 'warning' },
  failed: { label: 'Failed', intent: 'negative' },
  pending: { label: 'Pending', intent: 'neutral' },
};

/**
 * The revision detail of one Harness entry. It explains a `progressing`
 * verdict: the Harness is compiling a newer revision than the one it last
 * succeeded with.
 */
function describeRevision({
  desiredRevision,
  latestSuccessfulRevision,
}: AgentHarness): string | undefined {
  if (!desiredRevision) {
    return undefined;
  }
  if (desiredRevision === latestSuccessfulRevision) {
    return `revision ${desiredRevision}`;
  }
  return latestSuccessfulRevision
    ? `compiling ${desiredRevision}, last successful ${latestSuccessfulRevision}`
    : `compiling ${desiredRevision}`;
}

/** One admitting Harness: its name, its verdict, and the revision it is on. */
function HarnessRow({
  harness,
  isDeciding,
}: {
  harness: AgentHarness;
  isDeciding: boolean;
}) {
  const { label, intent } = HARNESS_READINESS_PRESENTATION[harness.readiness];
  const revision = describeRevision(harness);

  return (
    <Flex direction="column" gap="1" role="listitem">
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        <Text variant="body-medium" style={{ fontFamily: 'monospace' }}>
          {harness.name}
        </Text>
        <StatusLabel label={label} intent={intent} />
        {isDeciding && (
          <Text variant="body-x-small" color="secondary">
            sessions run here
          </Text>
        )}
      </Flex>
      {revision && (
        <Text variant="body-small" color="secondary">
          {revision}
        </Text>
      )}
    </Flex>
  );
}

/**
 * Why the agent is in the state the list shows: the readiness label, the
 * controller's own explanation, every Harness that admits the template with
 * its own verdict, and the deciding Harness's conditions verbatim.
 *
 * This is the section that makes a broken agent debuggable without `kubectl`, so
 * it leads the page rather than following the configuration.
 */
export function AgentStatusCard({ agent }: { agent: Agent }) {
  const readiness = agent.getReadiness();
  const { label, intent, icon } = READINESS_PRESENTATION[readiness];
  const readinessMessage = agent.getReadinessMessage();
  const warnings = agent.getHarnessWarnings();
  const harnesses = agent.getHarnesses();
  const deciding = agent.getDecidingHarness();
  const conditions = agent.getConditions() ?? [];

  return (
    <InfoCard title="Status">
      <Flex direction="column" gap="4">
        <Flex direction="column" gap="2">
          <StatusLabel label={label} intent={intent} icon={icon} />
          {readinessMessage && (
            <Text variant="body-small" color="secondary">
              {readinessMessage}
            </Text>
          )}
          {/* The one explanation the conditions cannot give on their own: they
              may all read healthy and still describe the *previous* spec. */}
          {agent.isStale() && (
            <Text variant="body-small" color="secondary">
              The controller has reconciled generation{' '}
              {agent.getObservedGeneration()}, but the stored spec is at
              generation {agent.getGeneration()} — the Harness entries below
              describe the previous version.
            </Text>
          )}
        </Flex>

        {/* Where the agent runs: every Harness that admits the template, each
            with its own verdict. The deciding one — the platform Harness the
            admission label names — is what the readiness above is; sessions
            started from the portal run on it. */}
        {harnesses.length > 0 && (
          <Flex direction="column" gap="2">
            <Text as="h4" variant="body-medium" weight="bold">
              Harnesses
            </Text>
            <Flex
              direction="column"
              gap="2"
              role="list"
              aria-label="Admitting Harnesses"
            >
              {harnesses.map(harness => (
                <HarnessRow
                  key={harness.name}
                  harness={harness}
                  isDeciding={harness.name === deciding?.name}
                />
              ))}
            </Flex>
          </Flex>
        )}

        {/* Independent of readiness — a fully ready agent can carry these — so
            they are reported separately rather than folded into the label above. */}
        {warnings.length > 0 && (
          <Alert
            status="warning"
            title="The Harness could not honour every configured feature"
            description={warnings.join('\n')}
          />
        )}

        <ConditionsList
          conditions={conditions}
          emptyContent={
            <Text variant="body-small" color="secondary">
              {readiness === 'notAdmitted'
                ? 'No Harness admits this agent, so none has written conditions for it. Label the template for the platform Harness and the controller reports here.'
                : 'No Harness has reported on this agent yet. A newly created agent shows this until a Harness admits it and reconciles it for the first time.'}
            </Text>
          }
        />
      </Flex>
    </InfoCard>
  );
}
