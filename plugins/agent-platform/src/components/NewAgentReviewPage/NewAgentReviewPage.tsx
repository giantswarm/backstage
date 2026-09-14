import { useCallback, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Box,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Flex,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { dump } from 'js-yaml';
import { ServerSignIn } from '@giantswarm/backstage-plugin-muster';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import {
  useCreateAgent,
  type CreateAgentFailure,
} from '../../hooks/useCreateAgent';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useMusterToolCatalogue } from '../../hooks/useMusterToolCatalogue';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import { useValidateAgent } from '../../hooks/useValidateAgent';
import {
  AGENT_MANAGER_SERVER,
  helmInstallCommand,
  type CommitAgentResult,
} from '../../lib/agentManager';
import { agentSpecOf } from '../../lib/agentSpec';
import { shortCommit } from '../../lib/skills';
import {
  buildCatalogue,
  declaredToolset,
  toolsetShape,
  unsignedServerSelectors,
} from '../../lib/toolset';
import {
  agentDetailRouteRef,
  newAgentRouteRef,
  newAgentToolsRouteRef,
} from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CodeBlock } from '../CodeBlock';
import { ToolsetResolutionList } from '../ToolsetResolutionList';

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  stepLabel: {
    marginBottom: theme.spacing(0.5),
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  summary: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(4),
    padding: theme.spacing(2, 0),
    borderTop: `1px solid ${theme.palette.divider}`,
    borderBottom: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(4),
  },
  code: {
    fontFamily: 'monospace',
  },
  section: {
    marginBottom: theme.spacing(4),
  },
  sectionTitle: {
    marginBottom: theme.spacing(0.5),
  },
  sectionDescription: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
  files: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
  },
  violations: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
  },
  details: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
  summaryLine: {
    cursor: 'pointer',
    fontWeight: 600,
  },
  detailsBody: {
    marginTop: theme.spacing(1.5),
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
  },
}));

// lineWidth: -1 keeps prompts and URLs unfolded; noRefs avoids YAML anchors.
const YAML_OPTS = { lineWidth: -1, noRefs: true } as const;

/** The one-line Tools summary: the loud labels, or a selector count. */
function toolsetSummaryLabel(
  shape: 'none' | 'full' | 'composed',
  count: number,
): string {
  if (shape === 'none') {
    return 'No tools';
  }
  if (shape === 'full') {
    return 'Full gateway access';
  }
  return `${count} selector${count === 1 ? '' : 's'}`;
}

function SummaryItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1">
      <Text variant="body-x-small" color="secondary">
        {label}
      </Text>
      {children}
    </Flex>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  const classes = useStyles();
  return (
    <>
      <Text
        as="h3"
        variant="title-small"
        weight="bold"
        className={classes.sectionTitle}
      >
        {title}
      </Text>
      <Text as="p" color="secondary" className={classes.sectionDescription}>
        {description}
      </Text>
    </>
  );
}

/**
 * agent-manager's refusal for the whole configuration: every schema violation
 * and precondition failure of the dry run, verbatim.
 */
function Violations({ errors }: { errors: string[] }) {
  const classes = useStyles();
  return (
    <Alert
      status="danger"
      title="agent-manager refuses this configuration"
      description={
        <ul className={classes.violations} aria-label="Violations">
          {errors.map(error => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      }
    />
  );
}

/** The headline for a refused write, by agent-manager's code. */
function refusalTitle(code: CreateAgentFailure['code']): string {
  if (code === 'forbidden') {
    return 'Not permitted';
  }
  if (code === 'conflict') {
    return 'Refused';
  }
  return 'Deploy failed';
}

/** The person's muster session is not connected to agent-manager yet. */
function ConnectAgentManager({
  installation,
  message,
}: {
  installation: string;
  message: string;
}) {
  return (
    <Alert
      status="warning"
      title="Connect to agent-manager"
      description={
        <Flex direction="column" gap="2">
          <Text variant="body-small">
            Agents are created through agent-manager, reached through muster as
            you. Your muster session on {installation} is not connected to it
            yet: {message}
          </Text>
          <ServerSignIn
            serverName={AGENT_MANAGER_SERVER}
            installation={installation}
          />
        </Flex>
      }
    />
  );
}

/** What `mode: commit` answered: the pull request, or the connect step. */
function CommitOutcome({ result }: { result: CommitAgentResult }) {
  if (result.pullRequestUrl) {
    return (
      <Alert
        status="success"
        title="Pull request opened"
        description={
          <ButtonLink
            href={result.pullRequestUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="small"
          >
            Open the pull request ↗
          </ButtonLink>
        }
      />
    );
  }
  if (result.status === 'auth_required') {
    return (
      <Alert
        status="warning"
        title="Connect the repository first"
        description={
          <Flex direction="column" gap="2">
            <Text variant="body-small">
              {result.message ??
                'agent-manager has no grant to open pull requests as you yet.'}
            </Text>
            {result.authUrl && (
              <ButtonLink
                href={result.authUrl}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
                size="small"
              >
                Connect ↗
              </ButtonLink>
            )}
          </Flex>
        }
      />
    );
  }
  return (
    <Alert
      status="info"
      title="Commit requested"
      description={result.message ?? 'agent-manager accepted the request.'}
    />
  );
}

export function NewAgentReviewPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const newAgentLink = useRouteRef(newAgentRouteRef);
  const toolsLink = useRouteRef(newAgentToolsRouteRef);
  const agentDetailLink = useRouteRef(agentDetailRouteRef);
  const { state, isComplete, isToolsetValid } = useNewAgentForm();
  // Only to number the steps: with no skill repositories configured the skills
  // step doesn't exist. Cached by the time this page renders.
  const { hasRepositories } = useSkillCatalog();

  // The toolset as the Tools step showed it — the same resolution for the same
  // person, from the same cached queries — so what is reviewed is exactly what
  // is applied, and the "selected without a sign-in" flag is repeated here.
  const toolCatalogue = useMusterToolCatalogue(state.installation);
  const { servers } = useMusterServers(state.installation);
  const resolution = useToolsetResolution(state.installation, state.toolset);
  const unsignedServers = useMemo(
    () =>
      unsignedServerSelectors(
        state.toolset,
        buildCatalogue(
          toolCatalogue.tools,
          servers,
          toolCatalogue.serversRequiringAuth,
        ),
      ),
    [
      state.toolset,
      toolCatalogue.tools,
      servers,
      toolCatalogue.serversRequiringAuth,
    ],
  );
  // What the release declares: the selection, or `preset:none` for none.
  const declared = useMemo(
    () => declaredToolset(state.toolset),
    [state.toolset],
  );
  const shape = toolsetShape(declared);

  // Persist the same deterministic avatar the UI renders onto the resource, as
  // the size-agnostic canonical URL. Seeded by the technical name so it matches
  // the created agent; undefined when the installation has no configured base
  // domain (then the chart keeps its default).
  const buildAvatarUrl = useAgentAvatarUrl();

  // The form as agent-manager's create contract. Memoized so the dry run is not
  // re-requested on every re-render — this page re-renders as the queries below
  // settle and as the deploy advances. Computed before the completeness guard
  // so the hook order stays stable (only rendered when complete).
  const spec = useMemo(
    () =>
      agentSpecOf(state, {
        toolset: declared,
        iconUrl: buildAvatarUrl(state.installation, state.slug),
      }),
    [state, declared, buildAvatarUrl],
  );
  const namespace = spec.namespace;

  const { info } = useAgentManagerInfo(state.installation);
  const validation = useValidateAgent(
    state.installation,
    isComplete && isToolsetValid ? spec : undefined,
  );
  const creation = useCreateAgent(state.installation);
  const [commitResult, setCommitResult] = useState<
    CommitAgentResult | undefined
  >();

  const dryRun = validation.result;
  const violations = dryRun?.errors ?? [];
  const canWrite =
    Boolean(dryRun) && violations.length === 0 && !validation.failure;
  const isBusy = creation.isDeploying || creation.isCommitting;
  // The button shows only when agent-manager reports the capability that lands
  // the manifests as a pull request (giantswarm/agent-manager#24).
  const canCommit = info?.capabilities?.commit === true;

  const onDeploy = useCallback(async () => {
    setCommitResult(undefined);
    creation.reset();
    let result;
    try {
      result = await creation.deploy(spec);
    } catch {
      // Left to `creation.failure`, rendered inline below.
      return;
    }
    const target = agentDetailLink?.({
      installation: state.installation!,
      namespace,
      name: spec.name,
    });
    if (target) {
      // The detail page shows the template converging on the platform Harness
      // (get_agent_status until ready or failed) for the agent it was handed.
      navigate(target, {
        state: {
          [AGENT_CREATED_STATE_KEY]: {
            installation: state.installation,
            namespace,
            name: spec.name,
            requestedBy: result.requestedBy,
          },
        },
      });
    }
  }, [
    creation,
    spec,
    agentDetailLink,
    state.installation,
    namespace,
    navigate,
  ]);

  const onCommit = useCallback(async () => {
    setCommitResult(undefined);
    creation.reset();
    try {
      setCommitResult(await creation.commit(spec));
    } catch {
      // Left to `creation.failure`.
    }
  }, [creation, spec]);

  const deployLabel = creation.isDeploying ? 'Deploying…' : 'Deploy agent';

  // "Back" goes to the immediately preceding step, which is always the Tools
  // step.
  const backLink = toolsLink;
  const stepNumber = hasRepositories ? 4 : 3;

  // Memoized so the header actions slot only updates when the handlers/labels
  // actually change (see useProvidePageHeaderActions).
  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          isDisabled={isBusy}
          onPress={() => navigate(backLink ? backLink() : '..')}
        >
          Back to edit
        </Button>
        {canCommit && (
          <Button
            variant="secondary"
            isDisabled={isBusy || !canWrite}
            onPress={onCommit}
          >
            {creation.isCommitting ? 'Committing…' : 'Commit'}
          </Button>
        )}
        <Button
          variant="primary"
          isDisabled={isBusy || !canWrite}
          onPress={onDeploy}
        >
          {deployLabel}
        </Button>
      </Flex>
    ),
    [
      isBusy,
      canWrite,
      canCommit,
      backLink,
      navigate,
      onCommit,
      onDeploy,
      deployLabel,
      creation.isCommitting,
    ],
  );

  // Surface the actions in the section's single header (Agent Platform) rather
  // than a second header of our own.
  useProvidePageHeaderActions(isComplete ? actions : null);

  // Reaching review with an incomplete form means a deep link or a reset —
  // send the user back to fill it in. (After all hooks, to keep their order
  // stable across renders.)
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }
  // A toolset that cannot be applied (a malformed selector, over the inline
  // cap) is fixed on the Tools step; agent-manager would refuse it anyway.
  if (!isToolsetValid) {
    return <Navigate to={toolsLink ? toolsLink() : '..'} replace />;
  }

  const chart = info?.chart;
  const harnessName = info?.harness?.name;
  const valuesYaml = dryRun ? dump(dryRun.manifests.values, YAML_OPTS) : '';

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step {stepNumber} of {stepNumber}: Review & deploy
        </Text>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Create an agent: review and deploy
        </Text>
        <Text as="p" color="secondary" className={classes.intro}>
          agent-manager composes your configuration into a release of the{' '}
          <span className={classes.code}>agent</span> chart
          {chart ? (
            <>
              {' '}
              (<span className={classes.code}>{chart.semver}</span>)
            </>
          ) : null}
          : a Flux <span className={classes.code}>HelmRelease</span> and the
          shared <span className={classes.code}>OCIRepository</span> that
          sources the chart. Deploying applies them to{' '}
          <strong>{state.installation}</strong> as you, and the agent runs on
          the platform Harness
          {harnessName ? (
            <>
              {' '}
              <span className={classes.code}>{harnessName}</span>
            </>
          ) : null}
          . What you see below is agent-manager's dry run of exactly that.
        </Text>

        <div className={classes.summary}>
          <SummaryItem label="Release">
            <span className={classes.code}>{spec.name}</span>
          </SummaryItem>
          <SummaryItem label="Installation">
            <span className={classes.code}>{state.installation}</span>
          </SummaryItem>
          <SummaryItem label="Namespace">
            <span className={classes.code}>{namespace}</span>
          </SummaryItem>
          <SummaryItem label="Chart">
            {chart ? (
              <Text variant="body-small">
                <span className={classes.code}>
                  {chart.ociUrl}:{chart.semver}
                </span>
                {chart.latestVersion ? (
                  <Text variant="body-x-small" color="secondary">
                    latest {chart.latestVersion}
                  </Text>
                ) : null}
              </Text>
            ) : (
              <Text variant="body-small" color="secondary">
                Reported by agent-manager
              </Text>
            )}
          </SummaryItem>
          <SummaryItem label="Harness">
            {harnessName ? (
              <span className={classes.code}>{harnessName}</span>
            ) : (
              <Text variant="body-small" color="secondary">
                The platform Harness
              </Text>
            )}
          </SummaryItem>
          <SummaryItem label="Tools">
            <Text variant="body-small">
              {toolsetSummaryLabel(shape, declared.length)}
            </Text>
            <Text variant="body-x-small" color="secondary">
              <span className={classes.code}>{declared.join(', ')}</span>
            </Text>
          </SummaryItem>
          {/* Named here, not just buried in the values YAML — skills are chosen
              on their own step, so this is the only compact confirmation of
              what that step produced: each skill at the commit it is pinned to. */}
          {hasRepositories && (
            <SummaryItem label="Skills">
              {state.selectedSkills.length === 0 ? (
                <Text variant="body-small" color="secondary">
                  None
                </Text>
              ) : (
                <Text variant="body-small">
                  {state.selectedSkills.map((skill, index) => (
                    <span key={`${skill.repoUrl}#${skill.path}`}>
                      {index > 0 ? ', ' : ''}
                      {skill.name}{' '}
                      <span className={classes.code}>
                        @{shortCommit(skill.commit)}
                      </span>
                    </span>
                  ))}
                </Text>
              )}
            </SummaryItem>
          )}
        </div>

        <div className={classes.section}>
          <SectionTitle
            title="Tools"
            description="The toolset this agent declares, and what it resolves to for you right now. Resolution happens per person: someone with access to more servers sees more through the same agent, never less than the toolset allows."
          />
          <Flex direction="column" gap="3">
            {shape === 'full' && (
              <Alert
                status="warning"
                title="Full gateway access"
                description="This agent can discover and call every tool the gateway exposes to whoever invokes it — platform administration included."
              />
            )}
            {shape === 'none' && (
              <Alert
                status="info"
                title="No tools"
                description="A chat-only agent: the release renders no gateway entry."
              />
            )}
            {unsignedServers.length > 0 && (
              <Alert
                status="info"
                title="Selected without a sign-in"
                description={`${unsignedServers.join(
                  ', ',
                )} — part of the toolset, resolving for the people who have access to them. The list below is incomplete for you until you sign in to them.`}
              />
            )}
            <ToolsetResolutionList resolution={resolution} servers={servers} />
          </Flex>
        </div>

        <div className={classes.section}>
          <SectionTitle
            title="Resources to apply"
            description={
              <>
                agent-manager's dry run (
                <span className={classes.code}>validate_agent</span>): the Flux{' '}
                <span className={classes.code}>OCIRepository</span> that sources
                the chart and the{' '}
                <span className={classes.code}>HelmRelease</span> that installs
                the agent, with its values inlined and every skill pinned to a
                commit. Applied to{' '}
                <span className={classes.code}>{state.installation}</span>{' '}
                exactly as shown.
              </>
            }
          />
          <Flex direction="column" gap="3">
            {validation.isLoading && !dryRun && (
              <Text color="secondary">
                Asking agent-manager for the dry run…
              </Text>
            )}
            {validation.failure?.kind === 'not-connected' && (
              <ConnectAgentManager
                installation={state.installation!}
                message={validation.failure.message}
              />
            )}
            {validation.failure?.kind === 'refused' && (
              <Alert
                status="danger"
                title="agent-manager refused the dry run"
                description={validation.failure.message}
              />
            )}
            {validation.failure?.kind === 'error' && (
              <Alert
                status="danger"
                title="Could not reach agent-manager"
                description={validation.failure.message}
              />
            )}
            {violations.length > 0 && <Violations errors={violations} />}
            {dryRun && (
              <>
                <div className={classes.files}>
                  <CodeBlock
                    filename={`${spec.name}.yaml`}
                    content={dryRun.manifests.helmRelease}
                    language="yaml"
                  />
                  <CodeBlock
                    filename="agent.yaml"
                    content={dryRun.manifests.ociRepository}
                    language="yaml"
                  />
                </div>
                <Text variant="body-x-small" color="secondary">
                  Values validated against the chart's schema at version{' '}
                  <span className={classes.code}>{dryRun.schemaVersion}</span> (
                  {dryRun.schemaSource}).
                </Text>
              </>
            )}
          </Flex>
        </div>

        <div className={classes.section}>
          <SectionTitle
            title="Deploy"
            description={
              <>
                Applies the resources to{' '}
                <span className={classes.code}>{state.installation}</span>{' '}
                through agent-manager, as you — the release names you as its
                author and your own cluster access decides. The agent's page
                then shows it becoming ready on the platform Harness.
              </>
            }
          />

          <Card>
            <CardBody>
              <Flex justify="between" align="center" gap="4">
                <Flex direction="column" gap="1">
                  <Text weight="bold">Deploy to {state.installation}</Text>
                  <Text variant="body-small" color="secondary">
                    Creates the HelmRelease (and the shared OCIRepository when
                    the namespace has none yet) live on the installation. Flux
                    reconciles the agent from there.
                  </Text>
                </Flex>
                <Flex gap="2">
                  {canCommit && (
                    <Button
                      variant="secondary"
                      isDisabled={isBusy || !canWrite}
                      onPress={onCommit}
                    >
                      {creation.isCommitting ? 'Committing…' : 'Commit'}
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    isDisabled={isBusy || !canWrite}
                    onPress={onDeploy}
                  >
                    {deployLabel}
                  </Button>
                </Flex>
              </Flex>
            </CardBody>
          </Card>

          {creation.failure?.kind === 'not-connected' && (
            <Box mt="3">
              <ConnectAgentManager
                installation={state.installation!}
                message={creation.failure.message}
              />
            </Box>
          )}
          {creation.failure?.kind === 'refused' && (
            <Box mt="3">
              <Alert
                status="danger"
                title={refusalTitle(creation.failure.code)}
                description={creation.failure.message}
              />
            </Box>
          )}
          {creation.failure?.kind === 'error' && (
            <Box mt="3">
              <Alert
                status="danger"
                title="Deploy failed"
                description={creation.failure.message}
              />
            </Box>
          )}
          {commitResult && (
            <Box mt="3">
              <CommitOutcome result={commitResult} />
            </Box>
          )}

          {dryRun && chart && (
            <details className={classes.details}>
              <summary className={classes.summaryLine}>
                Install manually instead
              </summary>
              <div className={classes.detailsBody}>
                <Text variant="body-small" color="secondary">
                  Prefer to keep this in your own GitOps repo, or apply it
                  yourself? Copy the resources above, or save the values
                  agent-manager composed and run the command once against the
                  cluster.
                </Text>
                <CodeBlock
                  filename={`${spec.name}-values.yaml`}
                  content={valuesYaml}
                  language="yaml"
                />
                <CodeBlock content={helmInstallCommand(spec, chart)} />
              </div>
            </details>
          )}
        </div>
      </div>
    </Content>
  );
}
