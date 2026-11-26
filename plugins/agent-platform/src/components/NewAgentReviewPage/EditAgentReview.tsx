import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { dump } from 'js-yaml';
import {
  CommitSha,
  FileView,
  usePhoneLayout,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import {
  useAgentManagerClient,
  useAgentManagerInfo,
} from '../../hooks/useAgentManager';
import {
  agentGenerationOf,
  isStaleWriteConflict,
  supportsTags,
} from '../../lib/agentManager';
import { classifyCommitFailure } from '../../hooks/useAgentCommitCheck';
import { useMusterServers } from '../../hooks/useMusterServers';
import { useSignInTool } from '../../hooks/useSignInTool';
import { SIGN_IN_TOOL_SELECTOR } from '../../lib/signInTool';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useToolsetResolution } from '../../hooks/useToolsetResolution';
import {
  type AgentWriteFailure,
  useUpdateAgent,
} from '../../hooks/useUpdateAgent';
import { useConnectorsRefusal } from '../../hooks/useConnectorsRefusal';
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
import { MissingReleaseFileAlert } from '../MissingReleaseFileAlert';
import { pluginEntryName, pluginSummary } from '../../lib/plugins';
import {
  harnessTitle,
  platformHarnessOf,
  platformRuntimeLine,
  RUNTIME_LABEL,
} from '../../lib/harnesses';
import { declaredToolset, toolsetShape } from '../../lib/toolset';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { useRuntimeChoices } from '../HarnessPicker';
import { type AgentWizardEdit, useNewAgentForm } from '../NewAgentFormProvider';
import { ToolsetResolutionList } from '../ToolsetResolutionList';
import { ExceptionsNote } from '../AgentApprovalSettings';
import { useWizardApproval } from '../../hooks/useWizardApproval';
import {
  APPROVAL_NOT_ENFORCED_NOTE,
  agentToolListOf,
  approvalNotEnforced,
  approvalStateKey,
  carriesApprovalSettings,
  connectorAdminFrom,
  droppedExceptions,
  editApprovalPlan,
  isApprovalSetting,
} from '../../lib/agentApproval';
import { useAgentManagerAgent } from '../../hooks/useAgentManagerAgent';
import { PrivateSkillsNote } from '../PrivateSkillsNote';
import { pickedSourcesOf } from '../../lib/agentSpec';
import { agentSkillsSecretOf } from '../../lib/privateSkills';
import {
  Notes,
  PlainRow,
  SignInToolChange,
  SectionTitle,
  SummaryItem,
  toolsetSummaryLabel,
  UnderlyingModelItem,
  useReviewStyles,
  YAML_OPTS,
} from './reviewParts';
import { VALIDATION_REFUSAL_COPY } from '../../lib/egressCopy';
import { useFormHarnessRuntime } from '../../hooks/useFormHarnessRuntime';
import { ValidationRefusal } from '../ValidationRefusal';

/**
 * A refused or failed dry run or save, in agent-manager's words. The two
 * refusals the edit page checks for before the form — a release outside
 * agent-manager's directory, a GitHub authorization a sign-in gives — read as
 * they do there, should the repository or the authorization change in
 * between (`classifyCommitFailure`).
 */
function WriteFailure({
  installation,
  failure,
  title,
  onSignedIn,
}: {
  installation: string;
  failure: AgentWriteFailure;
  title: string;
  /**
   * Clears the refusal once the person is signed in to agent-manager; a dry
   * run's re-reads by itself, with every muster query.
   */
  onSignedIn?: () => void;
}) {
  const refused = classifyCommitFailure(failure);
  if (refused?.kind === 'connect') {
    return (
      <ConnectAgentManagerAlert
        installation={installation}
        message={refused.message}
        signInRequired={refused.signInRequired}
        action="Agents are edited"
        needsGitHub={refused.github}
        onSignedIn={onSignedIn}
      />
    );
  }
  if (refused?.kind === 'release-outside') {
    return (
      <MissingReleaseFileAlert
        missing={refused.missing}
        message={refused.message}
        action="edit"
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
  const { hasRepositories } = useSkillCatalog(edit.installation);
  const { agent, installation, writeMode, detailHref } = edit;
  const { info, isLoading: isInfoLoading } = useAgentManagerInfo(installation);
  // The platform Harness the runtime field shows, for its summary row.
  const { platformChoice } = useRuntimeChoices();
  // The Harness a refusal names, by the title the runtime field shows.
  const formRuntime = useFormHarnessRuntime();
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
  const tagsSupported = supportsTags(info);
  const editState = useMemo(
    () =>
      editStateOfForm(agent, { ...state, toolset }, { tags: tagsSupported }),
    [agent, state, toolset, tagsSupported],
  );
  const changed = useMemo(
    () => changedFields(agent, editState),
    [agent, editState],
  );
  // The approval settings (tool approval), where agent-manager and the
  // agent's chart take them: the list's entries go with what the agent can
  // reach (`update_agent_access`), an Allow over a connector's Ask and the
  // default with `set_agent_approval` after it.
  const approvalResolution = useToolsetResolution(
    installation,
    declaredToolset(toolset),
  );
  const approval = useWizardApproval(
    installation,
    toolset,
    state.approval,
    approvalResolution,
    agent.grants,
  );
  const approvalActive = approval.supported && agent.approvalSettings === true;
  // An agent with settings while agent-manager's support cannot be told:
  // a save now could write the list without them, so there is none.
  const approvalUnknown =
    carriesApprovalSettings(agent) && approval.support !== 'supported';
  const approvalPending =
    approval.support === 'reading' ||
    (approvalActive &&
      (approval.coveragePending || approval.report.status === 'loading'));
  // agent-manager's reading now, for the exceptions a save drops: not the one
  // the form opened with (another admin may have granted one since).
  const live = useAgentManagerAgent(installation, agent.namespace, agent.name);
  const grants = useMemo(
    () => live.agent?.grants ?? agent.grants ?? [],
    [live.agent?.grants, agent.grants],
  );
  const client = useAgentManagerClient(installation);
  const [stale, setStale] = useState(false);
  const [savedWithWarnings, setSavedWithWarnings] = useState<string[]>();
  const reported =
    approval.report.status === 'ready' ? approval.report.tools : undefined;
  const plan = useMemo(() => {
    if (!approvalActive) {
      return {};
    }
    const fallback = agent.defaultApproval;
    return editApprovalPlan(
      {
        tools: agentToolListOf(agent) ?? agent.toolset ?? [],
        default: isApprovalSetting(fallback) ? fallback : undefined,
      },
      { tools: approval.tools, default: approval.default },
      reported,
    );
  }, [approvalActive, agent, approval.tools, approval.default, reported]);
  const update = useMemo(() => {
    const base = updateOf(agent, editState);
    if (!approvalActive) {
      return base;
    }
    const { toolset: _selection, ...rest } = base;
    return plan.tools ? { ...rest, tools: plan.tools } : rest;
  }, [agent, editState, approvalActive, plan.tools]);
  const save = useMemo(
    () => (plan.approval ? { ...update, approval: plan.approval } : update),
    [update, plan.approval],
  );
  const updates = hasChanges(update);
  const dirty = updates || Boolean(plan.approval);
  const signature = useMemo(() => JSON.stringify(save), [save]);
  // The exceptions the save drops that the person did not change themselves.
  const dropped = useMemo(
    () =>
      droppedExceptions(
        grants,
        { tools: approval.tools, default: approval.default },
        connectorAdminFrom(reported),
        viaPullRequest,
      ),
    [grants, approval.tools, approval.default, reported, viaPullRequest],
  );
  const isReady = isComplete && isToolsetValid;

  // agent-manager's dry run of exactly the update Save sends; nothing is
  // requested while nothing changed.
  const dryRun = useValidateAgentUpdate(
    installation,
    // Not before the sign-in tool is decided, nor before agent-manager says
    // whether it takes tags: the update would differ from what Save sends.
    isReady &&
      updates &&
      !signIn.isLoading &&
      !isInfoLoading &&
      !approvalPending
      ? update
      : undefined,
    writeMode,
  );
  const violations = dryRun.result?.errors ?? [];
  const notes = dryRun.result?.notes ?? [];
  const canWrite =
    !signIn.isLoading &&
    !approvalPending &&
    !approvalUnknown &&
    !stale &&
    dirty &&
    // Settings alone are not dry-run: validate_agent has none of them.
    (!updates || Boolean(dryRun.result)) &&
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
  // A refusal of the connectors shows next to them on the Tools step too.
  useConnectorsRefusal(
    [...violations, dryRun.failure?.message, updating.failure?.message],
    Boolean(dryRun.result),
  );
  // The change a commit answered for. Its pull request stays the one for that
  // change: the button is locked until the wizard says something else, so a
  // second press never opens a second pull request.
  const [committed, setCommitted] = useState<{
    signature: string;
    result: CommitAgentResult;
  }>();
  const isCommitted =
    committed?.signature === signature && committed.result.commit !== undefined;

  /**
   * Right before a write: whether the agent's list, default, grants or
   * generation moved since the form read it. A save composed from that
   * reading would write its old values back.
   */
  const changedMeanwhile = useCallback(async () => {
    if (!client || !approvalActive) {
      return false;
    }
    try {
      const fresh = await client.getAgent(agent.namespace, agent.name);
      return approvalStateKey(fresh) !== approvalStateKey(agent);
    } catch {
      // The write's own precondition still holds it.
      return false;
    }
  }, [client, approvalActive, agent]);
  const generation = agentGenerationOf(agent);

  const onSave = useCallback(async () => {
    updating.reset();
    if (await changedMeanwhile()) {
      setStale(true);
      return;
    }
    let result;
    try {
      result = await updating.update(
        generation === undefined
          ? save
          : { ...save, expectedGeneration: generation },
      );
    } catch {
      // Left to `updating.failure`, rendered inline below.
      return;
    }
    // Saved, but agent-manager could not finish everything (muster not yet
    // told about a dropped exception): said here before leaving.
    if (
      result.sessionsUpdated === false ||
      (result.warnings?.length ?? 0) > 0
    ) {
      setSavedWithWarnings(result.warnings ?? []);
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
  }, [
    updating,
    save,
    generation,
    changedMeanwhile,
    detailHref,
    navigate,
    installation,
    agent,
  ]);

  const onCommit = useCallback(async () => {
    updating.reset();
    if (await changedMeanwhile()) {
      setStale(true);
      return;
    }
    try {
      const result = await updating.commit(save);
      setCommitted({ signature, result });
    } catch {
      // Left to `updating.failure`, rendered inline below.
    }
  }, [updating, save, signature, changedMeanwhile]);

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
        isDisabled={
          isBusy || !canWrite || isCommitted || Boolean(savedWithWarnings)
        }
        onPress={viaPullRequest ? onCommit : onSave}
      >
        {writeLabel}
      </Button>
    ),
    [
      isBusy,
      canWrite,
      isCommitted,
      savedWithWarnings,
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
  const platformHarness = platformHarnessOf(info);
  let runtime: string | undefined = platformRuntimeLine(platformChoice);
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
          {(editState.tags.length > 0 || changed.includes('tags')) && (
            <PlainRow label="Tags">
              {editState.tags.length === 0 ? 'None' : editState.tags.join(', ')}
            </PlainRow>
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
              {plan.approval && !changed.includes('toolset') && (
                <li>
                  <Text variant="body-small">Approval settings</Text>
                </li>
              )}
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

        {savedWithWarnings && (
          <Flex direction="column" align="start" gap="1">
            <Alert
              status="warning"
              title="Saved, with something left to finish"
              description={`Sessions already running may keep a removed exception until muster is told; agent-manager keeps trying.${
                savedWithWarnings.length > 0
                  ? ` ${savedWithWarnings.join(' ')}`
                  : ''
              }`}
            />
            {detailHref && (
              <Button
                variant="secondary"
                size="small"
                onPress={() => navigate(detailHref)}
              >
                Open the agent
              </Button>
            )}
          </Flex>
        )}
        {(stale || isStaleWriteConflict(updating.failure)) && (
          <Flex direction="column" align="start" gap="1">
            <Alert
              status="warning"
              title="This agent changed since you opened it"
              description="Someone saved its tools, settings or exceptions meanwhile. Saving now would write back what you started from, so nothing was saved. Reload the agent and make your change again."
            />
            <Button
              variant="secondary"
              size="small"
              onPress={() => window.location.reload()}
            >
              Reload the agent
            </Button>
          </Flex>
        )}
        {approvalUnknown && (
          <Alert
            status="warning"
            title="The approval settings can't be checked right now"
            description="agent-manager's tools could not be read, so a save now could drop this agent's approval settings. Nothing is saved until they can be read; try again in a moment."
          />
        )}
        {approvalActive && approvalNotEnforced(agent) && (
          <Alert
            status="info"
            title="Approval settings not enforced"
            description={APPROVAL_NOT_ENFORCED_NOTE}
          />
        )}
        {dirty && (
          <ExceptionsNote
            notAdmin={dropped.notAdmin}
            viaGit={dropped.viaGit}
            unchecked={dropped.unchecked}
            labelOf={server => labels.get(server) ?? server}
          />
        )}

        {shape === 'full' && !keepsImplicitAccess && (
          <Alert
            status="warning"
            title="Full gateway access"
            description="This agent can discover and call every tool the gateway exposes to whoever invokes it, platform tools included."
          />
        )}

        <PrivateSkillsNote
          installation={installation}
          {...pickedSourcesOf(state)}
          agentSecretName={agentSkillsSecretOf(agent)}
        />

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
        {violations.length > 0 && (
          <ValidationRefusal
            errors={violations}
            title={VALIDATION_REFUSAL_COPY.editTitle}
            harness={formRuntime.harness}
          />
        )}
        {notes.length > 0 && <Notes notes={notes} />}
        {updating.failure && (
          <WriteFailure
            installation={installation}
            failure={updating.failure}
            // The save's refusal is kept until the next write: cleared once
            // signed in, so the person saves again on the re-read dry run.
            onSignedIn={updating.reset}
            title={
              viaPullRequest
                ? 'Could not propose the change'
                : 'Could not save the change'
            }
          />
        )}
        {committed &&
          committed.signature === signature &&
          (committed.result.earlier?.length ?? 0) > 0 && (
            <Text variant="body-small">
              This change is {(committed.result.earlier?.length ?? 0) + 1} pull
              requests, one per kind of change: merge them in the order below.
            </Text>
          )}
        {committed &&
          committed.signature === signature &&
          [...(committed.result.earlier ?? []), committed.result].map(
            (result, index) => <CommitOutcome key={index} result={result} />,
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
                          <CommitSha
                            value={
                              'git' in skill ? skill.git.commit : skill.oci
                            }
                          />
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
                          @
                          <CommitSha
                            value={plugin.git?.commit ?? plugin.oci ?? ''}
                          />
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
                <FileView
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
