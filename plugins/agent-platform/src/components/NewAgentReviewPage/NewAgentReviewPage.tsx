import { useCallback, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { dump } from 'js-yaml';
import {
  usePhoneLayout,
  useProvidePageHeaderActions,
  WizardStepHeading,
  shortSha,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentIconUrl } from '../../hooks/useAgentIconUrl';
import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import {
  useCreateAgent,
  type CreateAgentFailure,
} from '../../hooks/useCreateAgent';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useMusterToolCatalogue } from '../../hooks/useMusterToolCatalogue';
import { useSignInTool } from '../../hooks/useSignInTool';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import { useValidateAgent } from '../../hooks/useValidateAgent';
import {
  helmInstallCommand,
  type CommitAgentResult,
} from '../../lib/agentManager';
import { agentSpecOf } from '../../lib/agentSpec';
import { harnessTitle } from '../../lib/harnesses';
import { parseEgressText } from '../../lib/egress';
import { PickedEgressPolicies } from '../PickedEgressPolicies';
import { pluginEntryOf, pluginSummary } from '../../lib/plugins';
import {
  buildCatalogue,
  declaredToolset,
  toolsetShape,
  unsignedServerSelectors,
} from '../../lib/toolset';
import { agentDetailRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import { CodeBlock } from '../CodeBlock';
import { CommitOutcome } from '../CommitOutcome';
import { ToolsetResolutionList } from '../ToolsetResolutionList';
import { EditAgentReview } from './EditAgentReview';
import {
  ConnectAgentManager,
  Notes,
  PlainRow,
  SectionTitle,
  SignInToolChange,
  SummaryItem,
  toolsetSummaryLabel,
  UnderlyingModelItem,
  useReviewStyles,
  Violations,
  YAML_OPTS,
} from './reviewParts';

/** The headline for a refused write, by agent-manager's code. */
function refusalTitle(code: CreateAgentFailure['code']): string {
  if (code === 'forbidden') {
    return 'Not permitted';
  }
  if (code === 'conflict') {
    return 'Refused';
  }
  return 'Could not create the agent';
}

/**
 * The wizard's last step: "Check and create" for a new agent, "Check and
 * save" for an edited one (`EditAgentReview`).
 */
export function NewAgentReviewPage() {
  const { edit } = useNewAgentForm();
  return edit ? <EditAgentReview edit={edit} /> : <CreateAgentReview />;
}

function CreateAgentReview() {
  const classes = useReviewStyles();
  const navigate = useNavigate();
  const { details: newAgentLink, tools: toolsLink } = useAgentWizardLinks();
  const agentDetailLink = useRouteRef(agentDetailRouteRef);
  const { state, isComplete, isToolsetValid, discardDraft, clearSavedDraft } =
    useNewAgentForm();
  // Only to number the steps: with no skill repositories configured the skills
  // step doesn't exist. Cached by the time this page renders.
  const { hasRepositories } = useSkillCatalog();

  // The toolset as the Tools step showed it — the same resolution for the same
  // person, from the same cached queries — so what is reviewed is exactly what
  // is applied, and the "selected without a sign-in" flag is repeated here.
  const toolCatalogue = useMusterToolCatalogue(state.installation);
  const { servers, labels } = useMusterServers(state.installation);
  // The selection with the sign-in tool the Tools step adds.
  const signIn = useSignInTool(
    state.installation,
    state.toolset,
    Boolean(state.signInToolDeclined),
  );
  const toolset = signIn.toolset;
  const resolution = useToolsetResolution(state.installation, toolset);
  const unsignedServers = useMemo(
    () =>
      unsignedServerSelectors(
        toolset,
        buildCatalogue(
          toolCatalogue.tools,
          servers,
          toolCatalogue.serversRequiringAuth,
        ),
      ),
    [toolset, toolCatalogue.tools, servers, toolCatalogue.serversRequiringAuth],
  );
  // What the release declares: the selection, or `preset:none` for none.
  const declared = useMemo(() => declaredToolset(toolset), [toolset]);
  const shape = toolsetShape(declared);

  // Persist the same deterministic avatar the UI renders onto the resource, as
  // the size-agnostic canonical URL on the installation's own avatars host —
  // what every A2A client loads, unlike the portal's backend-proxied `<img>`.
  // Seeded by the technical name so it matches the created agent; undefined
  // when the installation has no configured base domain (then the chart keeps
  // its default).
  const buildIconUrl = useAgentIconUrl();

  // The form as agent-manager's create contract. Memoized so the dry run is not
  // re-requested on every re-render — this page re-renders as the queries below
  // settle and as the deploy advances. Computed before the completeness guard
  // so the hook order stays stable (only rendered when complete).
  const spec = useMemo(
    () =>
      agentSpecOf(state, {
        toolset: declared,
        iconUrl: buildIconUrl(state.installation, state.slug),
      }),
    [state, declared, buildIconUrl],
  );
  const namespace = spec.namespace;

  const { info } = useAgentManagerInfo(state.installation);
  // Not before the sign-in tool is decided: the spec would lack it.
  const validation = useValidateAgent(
    state.installation,
    isComplete && isToolsetValid && !signIn.isLoading ? spec : undefined,
  );
  const creation = useCreateAgent(state.installation);
  const [commitResult, setCommitResult] = useState<
    CommitAgentResult | undefined
  >();

  const dryRun = validation.result;
  const violations = dryRun?.errors ?? [];
  const notes = dryRun?.notes ?? [];
  const canWrite =
    !signIn.isLoading &&
    Boolean(dryRun) &&
    violations.length === 0 &&
    !validation.failure;
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
      // (get_agent_status until ready) for the agent it was handed.
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
      // Created: the draft has done its job, and the next agent starts
      // empty.
      discardDraft();
    } else {
      // Nowhere to go: the page stays, with the form under the outcome, and
      // only the kept draft goes.
      clearSavedDraft();
    }
  }, [
    creation,
    spec,
    agentDetailLink,
    state.installation,
    namespace,
    navigate,
    discardDraft,
    clearSavedDraft,
  ]);

  const onCommit = useCallback(async () => {
    setCommitResult(undefined);
    creation.reset();
    let result;
    try {
      result = await creation.commit(spec);
    } catch {
      // Left to `creation.failure`.
      return;
    }
    setCommitResult(result);
    // The agent is in the pull request now (what `isProposed` says too); the
    // page still shows the form and the outcome, so only the kept draft goes.
    if (result.commit !== undefined) {
      clearSavedDraft();
    }
  }, [creation, spec, clearSavedDraft]);

  const createLabel = creation.isDeploying ? 'Creating…' : 'Create agent';
  const proposeLabel = creation.isCommitting
    ? 'Proposing…'
    : 'Propose as pull request instead';
  // At phone width the alternative leaves the footer for the page (C11):
  // beside Cancel, Back and Create it wrapped the footer to three rows, with
  // the primary button ending up bottom-left.
  const isPhone = usePhoneLayout();
  const proposeInFooter = canCommit && !isPhone;

  // "Back" (in the frame's footer) goes to the immediately preceding step,
  // which is always the Tools step.
  const backLink = toolsLink;
  const onBack = useCallback(() => {
    navigate(backLink ? backLink() : '..');
  }, [backLink, navigate]);

  // Memoized so the frame's footer slot only updates when the handlers/labels
  // actually change (see useProvidePageHeaderActions).
  const actions = useMemo(
    () => (
      <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
        {proposeInFooter && (
          <Button
            variant="tertiary"
            isDisabled={isBusy || !canWrite}
            onPress={onCommit}
          >
            {proposeLabel}
          </Button>
        )}
        <Button
          variant="primary"
          isDisabled={isBusy || !canWrite}
          onPress={onDeploy}
        >
          {createLabel}
        </Button>
      </Flex>
    ),
    [
      isBusy,
      canWrite,
      proposeInFooter,
      onCommit,
      onDeploy,
      createLabel,
      proposeLabel,
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
  // The Harness the person picked, else the platform Harness agent-manager
  // composes when the request names none.
  const harnessName = state.harness?.name ?? info?.harness?.name;
  const egressOrigins = parseEgressText(state.egressText);
  const valuesYaml = dryRun ? dump(dryRun.manifests.values, YAML_OPTS) : '';

  return (
    <AgentWizardFrame
      step="review"
      onBack={onBack}
      isProposed={commitResult?.commit !== undefined}
    >
      <Flex direction="column" gap="5">
        <WizardStepHeading title="Check and create">
          The agent is ready to chat with about a minute after you create it.
        </WizardStepHeading>

        {/* The plain summary first: what the person chose, in their words. */}
        <dl className={classes.plain} aria-label="Summary">
          <PlainRow label="Name">{state.name}</PlainRow>
          {state.description.trim() && (
            <PlainRow label="What it's for">{state.description}</PlainRow>
          )}
          <PlainRow label="Model">
            {state.modelDisplayName ?? state.modelConfigName}
          </PlainRow>
          <PlainRow label="Runtime">
            {state.harness
              ? harnessTitle(state.harness)
              : 'Standard (platform default)'}
          </PlainRow>
          {state.defaultWorkspace && (
            <PlainRow label="Default workspace">
              {state.defaultWorkspace}
            </PlainRow>
          )}
          {hasRepositories && (
            <PlainRow label="Skills">
              {state.selectedSkills.length === 0
                ? 'None'
                : state.selectedSkills.map(skill => skill.name).join(', ')}
            </PlainRow>
          )}
          {state.selectedPlugins.length > 0 && (
            <PlainRow label="Plugins">
              {state.selectedPlugins
                .map(pick => pluginSummary(pluginEntryOf(pick)))
                .join('; ')}
            </PlainRow>
          )}
          <PlainRow label="Tools">
            {toolsetSummaryLabel(
              shape,
              declared,
              connector => labels.get(connector) ?? connector,
            )}
            {signIn.status === 'added' && (
              <SignInToolChange change="added" signIn={signIn} />
            )}
          </PlainRow>
        </dl>

        {shape === 'full' && (
          <Alert
            status="warning"
            title="Full gateway access"
            description="This agent can discover and call every tool the gateway exposes to whoever invokes it, platform tools included."
          />
        )}

        {/* What decides whether Create is offered, in sight: the check is
            agent-manager's dry run of exactly what gets applied. */}
        {validation.isLoading && !dryRun && (
          <Text color="secondary">Checking the configuration…</Text>
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
        {notes.length > 0 && <Notes notes={notes} />}

        {creation.failure?.kind === 'not-connected' && (
          <ConnectAgentManager
            installation={state.installation!}
            message={creation.failure.message}
          />
        )}
        {creation.failure?.kind === 'refused' && (
          <Alert
            status="danger"
            title={refusalTitle(creation.failure.code)}
            description={creation.failure.message}
          />
        )}
        {creation.failure?.kind === 'error' && (
          <Alert
            status="danger"
            title="Could not create the agent"
            description={creation.failure.message}
          />
        )}
        {commitResult && <CommitOutcome result={commitResult} />}

        {canCommit && isPhone && (
          <Flex direction="column" align="start" gap="1">
            <Text variant="body-small" color="secondary">
              Rather have the change reviewed before it is applied?
            </Text>
            <Button
              variant="secondary"
              isDisabled={isBusy || !canWrite}
              onPress={onCommit}
            >
              {proposeLabel}
            </Button>
          </Flex>
        )}

        {/* Everything Kubernetes-shaped, collapsed: the release, where it
            lands, what the toolset resolves to and agent-manager's dry run. */}
        <details className={classes.technical}>
          <summary className={classes.technicalSummary}>
            Technical details
          </summary>
          <div className={classes.detailsBody}>
            <Text as="p" variant="body-small" color="secondary">
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
              sources the chart. Creating applies them to{' '}
              <strong>{state.installation}</strong> as you, and the agent runs
              on
              {state.harness ? ' the Harness' : ' the platform Harness'}
              {harnessName ? (
                <>
                  {' '}
                  <span className={classes.code}>{harnessName}</span>
                </>
              ) : null}
              . Below is agent-manager's dry run of it.
            </Text>

            <div className={classes.summary}>
              <SummaryItem label="Technical name">
                <span className={classes.code}>{spec.name}</span>
              </SummaryItem>
              <SummaryItem label="Environment">
                <span className={classes.code}>{state.installation}</span>
              </SummaryItem>
              <SummaryItem label="Namespace">
                <span className={classes.code}>{namespace}</span>
              </SummaryItem>
              <SummaryItem label="Model">
                <span className={classes.code}>{spec.modelConfig}</span>
              </SummaryItem>
              <UnderlyingModelItem
                installation={state.installation}
                modelConfigName={state.modelConfigName}
                namespace={state.modelConfigNamespace}
              />
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
              <SummaryItem label="Toolset">
                <Text variant="body-small">
                  <span className={classes.code}>{declared.join(', ')}</span>
                </Text>
              </SummaryItem>
              {state.egressPolicyRefs.length > 0 && (
                <SummaryItem label="EgressPolicies">
                  <PickedEgressPolicies
                    installation={state.installation}
                    namespace={state.modelConfigNamespace}
                    names={state.egressPolicyRefs}
                  />
                </SummaryItem>
              )}
              {egressOrigins.length > 0 && (
                <SummaryItem label="Extra egress">
                  <Text variant="body-small">
                    <span className={classes.code}>
                      {egressOrigins.join(', ')}
                    </span>
                  </Text>
                </SummaryItem>
              )}
              {/* Each skill at the commit it is pinned to: the plain summary
                  names them, this is what is written. */}
              {hasRepositories && state.selectedSkills.length > 0 && (
                <SummaryItem label="Skill pins">
                  <Text variant="body-small">
                    {state.selectedSkills.map((skill, index) => (
                      <span key={`${skill.repoUrl}#${skill.path}`}>
                        {index > 0 ? ', ' : ''}
                        {skill.name}{' '}
                        <span className={classes.code} title={skill.commit}>
                          @{shortSha(skill.commit)}
                        </span>
                      </span>
                    ))}
                  </Text>
                </SummaryItem>
              )}
              {state.selectedPlugins.length > 0 && (
                <SummaryItem label="Plugin pins">
                  <Text variant="body-small">
                    {state.selectedPlugins.map(({ plugin }, index) => (
                      <span key={`${plugin.repoUrl}#${plugin.path}`}>
                        {index > 0 ? ', ' : ''}
                        {plugin.name}{' '}
                        <span className={classes.code} title={plugin.commit}>
                          @{shortSha(plugin.commit)}
                        </span>
                      </span>
                    ))}
                  </Text>
                </SummaryItem>
              )}
            </div>

            <div className={classes.section}>
              <SectionTitle
                title="What the tools resolve to"
                description="This is the toolset the agent declares and what it resolves to for you right now. Resolution happens per person: someone with access to more connectors sees more through the same agent, never less than the toolset allows."
              />
              <Flex direction="column" gap="3">
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
                <ToolsetResolutionList
                  resolution={resolution}
                  servers={servers}
                />
              </Flex>
            </div>

            {dryRun && (
              <div className={classes.section}>
                <SectionTitle
                  title="Resources to apply"
                  description={
                    <>
                      agent-manager's dry run (
                      <span className={classes.code}>validate_agent</span>): the
                      Flux <span className={classes.code}>OCIRepository</span>{' '}
                      that sources the chart and the{' '}
                      <span className={classes.code}>HelmRelease</span> that
                      installs the agent, with its values inlined and every
                      skill pinned to a commit. Applied to{' '}
                      <span className={classes.code}>{state.installation}</span>{' '}
                      exactly as shown.
                    </>
                  }
                />
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
              </div>
            )}

            {dryRun && chart && (
              <details className={classes.details}>
                <summary className={classes.summaryLine}>
                  Install manually instead
                </summary>
                <div className={classes.detailsBody}>
                  <Text variant="body-small" color="secondary">
                    To keep it in your own GitOps repo or apply it yourself,
                    copy the resources above, or save the composed values and
                    run the command once against the cluster.
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
        </details>
      </Flex>
    </AgentWizardFrame>
  );
}
