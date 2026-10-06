import { Alert, Flex, Text } from '@backstage/ui';
import {
  Agent,
  AGENT_CONDITION_STAGE_ORDER,
  AgentHarness,
  HarnessReadiness,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  ConditionsList,
  InfoCard,
  SimpleAccordion,
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';

import { shortPin } from './helpers';

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

/** Identifiers that may run to 64 characters with nowhere to break. */
const MONO: React.CSSProperties = {
  fontFamily: 'monospace',
  overflowWrap: 'anywhere',
};

/** A revision hash shortened like a commit, the full value on hover. */
function Revision({ value }: { value: string }) {
  return (
    <span style={MONO} title={value}>
      {shortPin(value)}
    </span>
  );
}

/**
 * The revision while the Harness compiles a newer one than it last succeeded
 * with — the one moment the revision explains something.
 */
function CompilingRevision({ harness }: { harness: AgentHarness }) {
  const { desiredRevision, latestSuccessfulRevision } = harness;
  if (!desiredRevision || desiredRevision === latestSuccessfulRevision) {
    return null;
  }
  return (
    <Text variant="body-small" color="secondary">
      Compiling <Revision value={desiredRevision} />
      {latestSuccessfulRevision && (
        <>
          , running <Revision value={latestSuccessfulRevision} />
        </>
      )}
    </Text>
  );
}

/**
 * The Harnesses that admit the template. One — the usual case — is a sentence
 * naming it, where sessions run once the agent is ready; the page header
 * already carries its verdict.
 * Several each show their own verdict, since only the deciding one's is the
 * header's.
 */
function Harnesses({
  harnesses,
  deciding,
  isReady,
}: {
  harnesses: AgentHarness[];
  deciding?: AgentHarness;
  isReady: boolean;
}) {
  if (harnesses.length === 1) {
    const [harness] = harnesses;
    return (
      <Flex direction="column" gap="1">
        <Text variant="body-medium">
          {isReady ? 'Sessions run on ' : 'Admitted by '}
          <span style={MONO}>{harness.name}</span>
        </Text>
        <CompilingRevision harness={harness} />
      </Flex>
    );
  }

  return (
    <Flex
      direction="column"
      gap="2"
      role="list"
      aria-label="Admitting Harnesses"
    >
      {harnesses.map(harness => {
        const { label, intent } =
          HARNESS_READINESS_PRESENTATION[harness.readiness];
        return (
          <Flex key={harness.name} direction="column" gap="1" role="listitem">
            <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
              <Text variant="body-medium" style={MONO}>
                {harness.name}
              </Text>
              <StatusLabel label={label} intent={intent} />
              {harness.name === deciding?.name && (
                <Text variant="body-x-small" color="secondary">
                  sessions run here
                </Text>
              )}
            </Flex>
            <CompilingRevision harness={harness} />
          </Flex>
        );
      })}
    </Flex>
  );
}

/**
 * Whether the agent works, below the verdict the page header shows: where its
 * sessions run, what the Harness could not honour, and the conditions behind
 * the verdict.
 *
 * A ready agent's conditions all read healthy, so they sit behind a closed
 * disclosure with the revision it runs. Anything else lists them open, in the
 * order the controller evaluates them, so the stage that failed comes before
 * the stages it blocks and starts expanded. Why sessions cannot start is the
 * page banner's to say, not repeated here.
 */
export function AgentStatusCard({ agent }: { agent: Agent }) {
  const readiness = agent.getReadiness();
  const warnings = agent.getHarnessWarnings();
  const harnesses = agent.getHarnesses();
  const deciding = agent.getDecidingHarness();
  const conditions = agent.getConditions() ?? [];
  const revision = deciding?.latestSuccessfulRevision;
  const isReady = readiness === 'ready';

  const conditionsList = (
    <ConditionsList
      conditions={conditions}
      order={AGENT_CONDITION_STAGE_ORDER}
      headingLevel={isReady ? 5 : 4}
      emptyContent={
        <Text variant="body-small" color="secondary">
          {readiness === 'notAdmitted'
            ? 'No Harness admits this agent, so none has written conditions for it.'
            : 'No Harness has reported on this agent yet. A newly created agent shows this until a Harness admits it and reconciles it for the first time.'}
        </Text>
      }
    />
  );

  return (
    <InfoCard title="Status">
      <Flex direction="column" gap="4">
        {harnesses.length > 0 && (
          <Harnesses
            harnesses={harnesses}
            deciding={deciding}
            isReady={isReady}
          />
        )}

        {/* The one explanation the conditions cannot give on their own: they
            may all read healthy and still describe the *previous* spec. */}
        {agent.isStale() && (
          <Text variant="body-small" color="secondary">
            The controller has reconciled generation{' '}
            {agent.getObservedGeneration()}, but the stored spec is at
            generation {agent.getGeneration()} — the conditions below describe
            the previous version.
          </Text>
        )}

        {/* Independent of readiness — a fully ready agent can carry these — so
            they stay in view whatever the conditions say. */}
        {warnings.length > 0 && (
          <Alert
            status="warning"
            title="The Harness could not honour every configured feature"
            description={warnings.join('\n')}
          />
        )}

        {isReady ? (
          <SimpleAccordion
            title={`Conditions (${conditions.length})`}
            headingLevel={4}
          >
            <Flex direction="column" gap="2">
              {revision && (
                <Text variant="body-small" color="secondary">
                  Revision <Revision value={revision} />
                </Text>
              )}
              {conditionsList}
            </Flex>
          </SimpleAccordion>
        ) : (
          conditionsList
        )}
      </Flex>
    </InfoCard>
  );
}
