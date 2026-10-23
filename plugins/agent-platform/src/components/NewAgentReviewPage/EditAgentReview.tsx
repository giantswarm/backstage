import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { dump } from 'js-yaml';
import {
  usePhoneLayout,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import { useAgentManagerInfo } from '../../hooks/useAgentManager';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useSignInTool } from '../../hooks/useSignInTool';
import { SIGN_IN_TOOL_SELECTOR } from '../../lib/signInTool';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  type AgentWriteFailure,
  useUpdateAgent,
} from '../../hooks/useUpdateAgent';
import { useValidateAgentUpdate } from '../../hooks/useValidateAgentUpdate';
import {
  changedFields,
  EDIT_FIELD_LABELS,
  editStateOfForm,
  hasChanges,
  updateOf,
} from '../../lib/agentEdit';
import type { CommitAgentResult } from '../../lib/agentManager';
import { parseEgressText } from '../../lib/egress';
import { PickedEgressPolicies } from '../PickedEgressPolicies';
import { pluginEntryName, pluginSummary } from '../../lib/plugins';
import {
  DEFAULT_PLATFORM_HARNESS,
  harnessTitle,
  RUNTIME_LABEL,
} from '../../lib/harnesses';
import { declaredToolset, toolsetShape } from '../../lib/toolset';
import { shortPin } from '../AgentDetailPage/helpers';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import { CodeBlock } from '../CodeBlock';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { type AgentWizardEdit, useNewAgentForm } from '../NewAgentFormProvider';
import { ToolsetResolutionList } from '../ToolsetResolutionList';
import {
  Notes,
  PlainRow,
  SignInToolChange,
  SectionTitle,
  SummaryItem,
  toolsetSummaryLabel,
  UnderlyingModelItem,
  useReviewStyles,
  Violations,
  YAML_OPTS,
} from './reviewParts';

/** A refused or failed dry run or save, in agent-manager's words. */
function WriteFailure({
  installation,
  failure,
  title,
}: {
  installation: string;
  failure: AgentWriteFailure;
  title: string;
}) {
  if (failure.kind === 'not-connected') {
    return (
      <ConnectAgentManagerAlert
        installation={installation}
        message={failure.message}
        action="Agents are edited"
      />
    );
  }
  let heading = title;
  if (failure.code === 'auth_required') {
    heading = 'Authorize GitHub first';
  } else if (failure.kind === 'refused') {
    heading = failure.code === 'forbidden' ? 'Not permitted' : 'Refused';
  }
  return (
    <Alert status="danger" title={heading} description={failure.message} />
  );
}

/**
 * The edit wizard's last step: what changes, agent-manager's dry run of
 * exactly that (`validate_agent` with `update: true`), and Save changes —
 * `update_agent` with only the changed fields, as the person. An agent applied
 * from git is dry-run and written in mode `commit`: saving opens a pull
 * request instead, and the agent changes once it is merged.
 */
export function EditAgentReview({ edit }: { edit: AgentWizardEdit }) {
  const classes = useReviewStyles();
  const navigate = useNavigate();
  const { details: detailsLink, tools: toolsLink } = useAgentWizardLinks();
  const { state, isComplete, isToolsetValid } = useNewAgentForm();
  const { hasRepositories } = useSkillCatalog();
  const { agent, installation, writeMode, detailHref } = edit;
  const { info } = useAgentManagerInfo(installation);
  const viaPullRequest = writeMode === 'commit';

  // The selection with the sign-in tool the Tools step adds: an agent whose
  // connector needs it and whose toolset lacks it gets it with this save.
  const signIn = useSignInTool(
    installation,
    state.toolset,
    Boolean(state.signInToolDeclined),
  );
  const toolset = signIn.toolset;
  // What the save does to the sign-in tool the agent has now.
  const hadSignInTool = Boolean(agent.toolset?.includes(SIGN_IN_TOOL_SELECTOR));
  const hasSignInTool = toolset.includes(SIGN_IN_TOOL_SELECTOR);
  let signInChange: 'added' | 'removed' | undefined;
  if (hasSignInTool !== hadSignInTool) {
    signInChange = hasSignInTool ? 'added' : 'removed';
  }
  const editState = useMemo(
    () => editStateOfForm(agent, { ...state, toolset }),
    [agent, state, toolset],
  );
  const changed = useMemo(
    () => changedFields(agent, editState),
    [agent, editState],
  );
  const update = useMemo(() => updateOf(agent, editState), [agent, editState]);
  const dirty = hasChanges(update);
  const signature = useMemo(() => JSON.stringify(update), [update]);
  const isReady = isComplete && isToolsetValid;

  // agent-manager's dry run of exactly the update Save sends; nothing is
  // requested while nothing changed.
  const dryRun = useValidateAgentUpdate(
    installation,
    // Not before the sign-in tool is decided: the update would lack it.
    isReady && dirty && !signIn.isLoading ? update : undefined,
    writeMode,
  );
  const violations = dryRun.result?.errors ?? [];
  const notes = dryRun.result?.notes ?? [];
  const canWrite =
    !signIn.isLoading &&
    dirty &&
    Boolean(dryRun.result) &&
    violations.length === 0 &&
    !dryRun.failure;

  // What the agent will declare. An agent from before toolsets declares none
  // and keeps its implicit full access while nothing is selected.
  const keepsImplicitAccess = !agent.toolset && toolset.length === 0;
  const declared = useMemo(() => declaredToolset(toolset), [toolset]);
  const shape = toolsetShape(declared);
  const { servers, labels } = useMusterServers(installation);
  const resolution = useToolsetResolution(installation, declared);

  const updating = useUpdateAgent(installation);
  // The change a commit answered for. Its pull request stays the one for that
  // change: the button is locked until the wizard says something else, so a
  // second press never opens a second pull request.
  const [committed, setCommitted] = useState<{
    signature: string;
    result: CommitAgentResult;
  }>();
  const isCommitted =
    committed?.signature === signature && committed.result.commit !== undefined;

  const onSave = useCallback(async () => {
    updating.reset();
    let result;
    try {
      result = await updating.update(update);
    } catch {
      // Left to `updating.failure`, rendered inline below.
      return;
    }
    if (detailHref) {
      // The detail page shows the new revision converging on its Harness
      // (get_agent_status until ready).
      navigate(detailHref, {
        state: {
          [AGENT_CREATED_STATE_KEY]: {
            installation,
            namespace: agent.namespace,
            name: agent.name,
            requestedBy: result.requestedBy,
            action: 'updated',
            fromGeneration: result.fromGeneration,
          },
        },
      });
    }
  }, [updating, update, detailHref, navigate, installation, agent]);

  const onCommit = useCallback(async () => {
    updating.reset();
    try {
      const result = await updating.commit(update);
      setCommitted({ signature, result });
    } catch {
      // Left to `updating.failure`, rendered inline below.
    }
  }, [updating, update, signature]);

  const isBusy = updating.isUpdating || updating.isCommitting;
  const isPhone = usePhoneLayout();
  let writeLabel = updating.isUpdating ? 'Saving…' : 'Save changes';
  if (viaPullRequest) {
    // Shorter at phone width, so the footer keeps to one row beside Cancel
    // and Back (C11).
    const proposeLabel = isPhone
      ? 'Propose as pull request'
      : 'Propose changes as pull request';
    writeLabel = updating.isCommitting ? 'Proposing…' : proposeLabel;
    if (isCommitted) {
      writeLabel = 'Proposed';
    }
  }
  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        isDisabled={isBusy || !canWrite || isCommitted}
        onPress={viaPullRequest ? onCommit : onSave}
      >
        {writeLabel}
      </Button>
    ),
    [
      isBusy,
      canWrite,
      isCommitted,
      viaPullRequest,
      onCommit,
      onSave,
      writeLabel,
    ],
  );
  useProvidePageHeaderActions(isReady ? actions : null);

  const onBack = useCallback(() => {
    navigate(toolsLink ? toolsLink() : '..');
  }, [toolsLink, navigate]);

  // Every step starts complete (the agent's own values); one the person
  // emptied is fixed where it lives. After all hooks, to keep their order.
  if (!isComplete) {
    return <Navigate to={detailsLink ? detailsLink() : '..'} replace />;
  }
  if (!isToolsetValid) {
    return <Navigate to={toolsLink ? toolsLink() : '..'} replace />;
  }

  // In words only (QA R2-2): a Harness known by its name alone (the agent's
  // own, unchanged) has no title to show, so its row is left to Technical
  // details' Harness.
  const platformHarness = info?.harness?.name || DEFAULT_PLATFORM_HARNESS;
  let runtime: string | undefined = 'Standard (platform default)';
  if (state.harness && state.harness.name !== platformHarness) {
    runtime =
      state.harness.displayName || state.harness.runtime
        ? harnessTitle(state.harness)
        : undefined;
  }
  const egressOrigins = parseEgressText(state.egressText);
  const valuesYaml = dryRun.result
    ? dump(dryRun.result.manifests.values, YAML_OPTS)
    : '';
  const skillNames = editState.skills.map(skill => skill.name);
  const pluginSummaries = editState.plugins.map(pluginSummary);

  return (
    <AgentWizardFrame step="review" onBack={onBack} isProposed={isCommitted}>
      <Flex direction="column" gap="5">
        <WizardStepHeading title="Check and save">
          {viaPullRequest
            ? 'This agent is applied from Git, so saving opens a pull request as you with only your changes, and the agent changes once it is merged.'
            : "Only your changes are saved; the agent's page then shows it picking them up."}
        </WizardStepHeading>

        <dl className={classes.plain} aria-label="Summary">
          <PlainRow label="Name">{state.name}</PlainRow>
          {state.description.trim() && (
            <PlainRow label="What it's for">{state.description}</PlainRow>
          )}
          <PlainRow label="Model">
            {state.modelDisplayName ?? state.modelConfigName}
          </PlainRow>
          {runtime && <PlainRow label={RUNTIME_LABEL}>{runtime}</PlainRow>}
          {state.defaultWorkspace && (
            <PlainRow label="Default workspace">
              {state.defaultWorkspace}
            </PlainRow>
          )}
          {(hasRepositories || skillNames.length > 0) && (
            <PlainRow label="Skills">
              {skillNames.length === 0 ? 'None' : skillNames.join(', ')}
            </PlainRow>
          )}
          {(pluginSummaries.length > 0 || (agent.plugins ?? []).length > 0) && (
            <PlainRow label="Plugins">
              {pluginSummaries.length === 0
                ? 'None'
                : pluginSummaries.join('; ')}
            </PlainRow>
          )}
          <PlainRow label="Tools">
            {keepsImplicitAccess
              ? 'Every tool the gateway exposes (no toolset declared)'
              : toolsetSummaryLabel(
                  shape,
                  declared,
                  connector => labels.get(connector) ?? connector,
                )}
          </PlainRow>
        </dl>

        {dirty ? (
          <Flex direction="column" gap="1">
            <Text variant="body-small" weight="bold">
              What changes
            </Text>
            <ul className={classes.violations} aria-label="Changed fields">
              {changed.map(field => (
                <li key={field}>
                  <Text variant="body-small">{EDIT_FIELD_LABELS[field]}</Text>
                  {field === 'toolset' && signInChange && (
                    <SignInToolChange change={signInChange} signIn={signIn} />
                  )}
                </li>
              ))}
            </ul>
          </Flex>
        ) : (
          <Text color="secondary">Nothing changed yet.</Text>
        )}

        {shape === 'full' && !keepsImplicitAccess && (
          <Alert
            status="warning"
            title="Full gateway access"
            description="This agent can discover and call every tool the gateway exposes to whoever invokes it, platform tools included."
          />
        )}

        {/* What decides whether Save is offered, in sight: agent-manager's dry
            run of exactly the change. */}
        {dryRun.isLoading && !dryRun.result && (
          <Text color="secondary">Checking the change…</Text>
        )}
        {dryRun.failure && (
          <WriteFailure
            installation={installation}
            failure={dryRun.failure}
            title="Could not check the change"
          />
        )}
        {violations.length > 0 && <Violations errors={violations} />}
        {notes.length > 0 && <Notes notes={notes} />}
        {updating.failure && (
          <WriteFailure
            installation={installation}
            failure={updating.failure}
            title={
              viaPullRequest
                ? 'Could not propose the change'
                : 'Could not save the change'
            }
          />
        )}
        {committed && committed.signature === signature && (
          <CommitOutcome result={committed.result} />
        )}

        <details className={classes.technical}>
          <summary className={classes.technicalSummary}>
            Technical details
          </summary>
          <div className={classes.detailsBody}>
            <div className={classes.summary}>
              <SummaryItem label="Technical name">
                <span className={classes.code}>{agent.name}</span>
              </SummaryItem>
              <SummaryItem label="Environment">
                <span className={classes.code}>{installation}</span>
              </SummaryItem>
              <SummaryItem label="Namespace">
                <span className={classes.code}>{agent.namespace}</span>
              </SummaryItem>
              <SummaryItem label="Model">
                <span className={classes.code}>{state.modelConfigName}</span>
              </SummaryItem>
              {/* An edit cannot move the agent: its model is a ModelConfig of
                  the agent's own namespace. */}
              <UnderlyingModelItem
                installation={installation}
                modelConfigName={state.modelConfigName}
                namespace={agent.namespace}
              />
              <SummaryItem label="Harness">
                {agent.harness ? (
                  <span className={classes.code}>{agent.harness}</span>
                ) : (
                  <Text variant="body-small" color="secondary">
                    The platform Harness
                  </Text>
                )}
              </SummaryItem>
              <SummaryItem label="Toolset">
                <Text variant="body-small">
                  {keepsImplicitAccess ? (
                    <Text variant="body-small" color="secondary">
                      None declared
                    </Text>
                  ) : (
                    <span className={classes.code}>{declared.join(', ')}</span>
                  )}
                </Text>
              </SummaryItem>
              {state.egressPolicyRefs.length > 0 && (
                <SummaryItem label="EgressPolicies">
                  <PickedEgressPolicies
                    installation={installation}
                    namespace={agent.namespace}
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
              {editState.skills.length > 0 && (
                <SummaryItem label="Skill pins">
                  <Text variant="body-small">
                    {editState.skills.map((skill, index) => (
                      <span key={`${skill.name}#${index}`}>
                        {index > 0 ? ', ' : ''}
                        {skill.name}{' '}
                        <span className={classes.code}>
                          @
                          {shortPin(
                            'git' in skill ? skill.git.commit : skill.oci,
                          )}
                        </span>
                      </span>
                    ))}
                  </Text>
                </SummaryItem>
              )}
              {editState.plugins.length > 0 && (
                <SummaryItem label="Plugin pins">
                  <Text variant="body-small">
                    {editState.plugins.map((plugin, index) => (
                      <span key={`${pluginEntryName(plugin)}#${index}`}>
                        {index > 0 ? ', ' : ''}
                        {pluginEntryName(plugin)}{' '}
                        <span className={classes.code}>
                          @{shortPin(plugin.git?.commit ?? plugin.oci ?? '')}
                        </span>
                      </span>
                    ))}
                  </Text>
                </SummaryItem>
              )}
            </div>

            {!keepsImplicitAccess && (
              <div className={classes.section}>
                <SectionTitle
                  title="What the tools resolve to"
                  description="This is the toolset the agent declares and what it resolves to for you right now. Resolution happens per person: someone with access to more connectors sees more through the same agent, never less than the toolset allows."
                />
                <ToolsetResolutionList
                  resolution={resolution}
                  servers={servers}
                />
              </div>
            )}

            {dryRun.result && (
              <div className={classes.section}>
                <SectionTitle
                  title="The release's values"
                  description={
                    <>
                      agent-manager's dry run (
                      <span className={classes.code}>validate_agent</span>) of
                      exactly the change: the values the release would carry.
                    </>
                  }
                />
                <CodeBlock
                  filename={`${agent.name}-values.yaml`}
                  content={valuesYaml}
                  language="yaml"
                />
                <Text variant="body-x-small" color="secondary">
                  Values validated against the chart's schema at version{' '}
                  <span className={classes.code}>
                    {dryRun.result.schemaVersion}
                  </span>{' '}
                  ({dryRun.result.schemaSource}).
                </Text>
              </div>
            )}
          </div>
        </details>
      </Flex>
    </AgentWizardFrame>
  );
}
