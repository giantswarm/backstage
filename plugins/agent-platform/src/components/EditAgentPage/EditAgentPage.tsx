import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Content,
  EmptyState,
  Link,
  Progress,
} from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Box,
  Button,
  Card,
  CardBody,
  FieldLabel,
  Flex,
  Select,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { dump } from 'js-yaml';
import { useProvidePageHeaderActions } from '@giantswarm/backstage-plugin-ui-react';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import {
  useAgentManagerAvailability,
  useAgentManagerInfo,
} from '../../hooks/useAgentManager';
import { useAgentManagerAgent } from '../../hooks/useAgentManagerAgent';
import { useAgentManagerModelConfigs } from '../../hooks/useAgentManagerModelConfigs';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useUpdateAgent } from '../../hooks/useUpdateAgent';
import { useValidateAgentUpdate } from '../../hooks/useValidateAgentUpdate';
import {
  changedFields,
  EDIT_FIELD_LABELS,
  editStateOf,
  hasChanges,
  updateOf,
  type AgentEditState,
} from '../../lib/agentEdit';
import type {
  AgentManagerAgent,
  AgentSkillEntry,
  CommitAgentResult,
  WriteMode,
} from '../../lib/agentManager';
import { skillEntryOf } from '../../lib/agentSpec';
import type { DiscoveredSkill } from '../../lib/skills';
import { agentDetailRouteRef, agentsRouteRef } from '../../routes';
import { CodeBlock } from '../CodeBlock';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { TextAreaField } from '../NewAgentPage/TextAreaField';
import {
  MAX_SYSTEM_MESSAGE_LENGTH,
  systemMessageProblem,
} from '../../lib/systemMessage';
import { egressProblem, parseEgressText } from '../../lib/egress';
import { isMounted, SkillPicker } from '../SkillPicker';
import {
  agentManagerAbsenceReason,
  agentWriteMode,
} from '../AgentDetailPage/AgentActionsMenu';
import { CommitOutcome } from '../CommitOutcome';
import { EditAgentToolsetField } from './EditAgentToolsetField';

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
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
  violations: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
  },
  changed: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
  },
}));

// lineWidth: -1 keeps prompts and URLs unfolded; noRefs avoids YAML anchors.
const YAML_OPTS = { lineWidth: -1, noRefs: true } as const;

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

/** The write's refusal, in agent-manager's words, titled by its kind. */
function WriteFailure({
  installation,
  failure,
  action,
  verb,
}: {
  installation: string;
  failure: {
    kind: 'refused' | 'not-connected' | 'error';
    code?: string;
    message: string;
  };
  action: string;
  verb: string;
}) {
  if (failure.kind === 'not-connected') {
    return (
      <ConnectAgentManagerAlert
        installation={installation}
        message={failure.message}
        action={action}
      />
    );
  }
  let title = `${verb} failed`;
  if (failure.code === 'auth_required') {
    title = 'Authorize GitHub first';
  } else if (failure.kind === 'refused') {
    title = failure.code === 'forbidden' ? 'Not permitted' : 'Refused';
  }
  return <Alert status="danger" title={title} description={failure.message} />;
}

/**
 * The form, once agent-manager's reading of the agent is in hand. Holds the
 * edit state; everything derived from it — the changed fields, the update to
 * send, the dry run — is computed from the baseline and the state, so Save
 * (or Commit) carries exactly what changed and nothing else.
 *
 * `mode` is how the change lands: `apply` saves it live, `commit` — an agent
 * applied from git — opens a pull request as the person in the repository
 * that owns it. The dry run answers in the same mode, so its review is the
 * pull request's change.
 */
function EditAgentForm({
  installation,
  agent,
  mode,
}: {
  installation: string;
  agent: AgentManagerAgent;
  mode: WriteMode;
}) {
  const viaPullRequest = mode === 'commit';
  const verb = viaPullRequest ? 'Commit' : 'Save';
  const classes = useStyles();
  const navigate = useNavigate();
  const agentDetailLink = useRouteRef(agentDetailRouteRef);
  const detailHref = agentDetailLink?.({
    installation,
    namespace: agent.namespace,
    name: agent.name,
  });

  // Seeded once from agent-manager's reading; a later re-read (the page polls
  // nothing, but a sibling mutation may invalidate it) must not overwrite
  // what the person typed.
  const [edit, setEdit] = useState<AgentEditState>(() => editStateOf(agent));
  const seededFor = useRef(agent);
  useEffect(() => {
    if (
      seededFor.current !== agent &&
      !hasChanges(updateOf(seededFor.current, edit))
    ) {
      seededFor.current = agent;
      setEdit(editStateOf(agent));
    }
  }, [agent, edit]);

  const set = useCallback(
    <K extends keyof AgentEditState>(field: K, value: AgentEditState[K]) =>
      setEdit(previous => ({ ...previous, [field]: value })),
    [],
  );

  const {
    modelConfigs,
    isLoading: isLoadingModels,
    failure: modelsFailure,
  } = useAgentManagerModelConfigs(installation, agent.namespace);
  const catalog = useSkillCatalog();

  const toggleSkill = useCallback(
    (skill: DiscoveredSkill) =>
      setEdit(previous => ({
        ...previous,
        skills: isMounted(previous.skills, skill)
          ? previous.skills.filter(
              entry =>
                !(
                  'git' in entry &&
                  entry.git.url === skill.repoUrl &&
                  (entry.path ?? '') === skill.path
                ),
            )
          : // Pinned to the commit the card showed — never a branch.
            [...previous.skills, skillEntryOf(skill)],
      })),
    [],
  );
  const removeSkill = useCallback(
    (skill: AgentSkillEntry) =>
      setEdit(previous => ({
        ...previous,
        skills: previous.skills.filter(entry => entry !== skill),
      })),
    [],
  );

  const changed = useMemo(() => changedFields(agent, edit), [agent, edit]);
  const update = useMemo(() => updateOf(agent, edit), [agent, edit]);
  const dirty = hasChanges(update);
  const signature = useMemo(() => JSON.stringify(update), [update]);

  // agent-manager's dry run of exactly the update Save or Commit would send;
  // nothing is requested while nothing changed.
  const dryRun = useValidateAgentUpdate(
    installation,
    dirty ? update : undefined,
    mode,
  );
  const violations = dryRun.result?.errors ?? [];
  const promptProblem = systemMessageProblem(edit.systemMessage);
  const egressIssue = egressProblem(parseEgressText(edit.egressText));
  const canWrite =
    dirty &&
    !promptProblem &&
    !egressIssue &&
    Boolean(dryRun.result) &&
    violations.length === 0 &&
    !dryRun.failure;

  const updating = useUpdateAgent(installation);

  // The change a commit answered for. Its pull request stays the one for that
  // change: Commit is locked until the form says something else, so a second
  // click never opens a second pull request.
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
      // The detail page shows the new revision converging on the platform
      // Harness (get_agent_status until ready or failed).
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
  let writeLabel = updating.isUpdating ? 'Saving…' : 'Save';
  if (viaPullRequest) {
    writeLabel = updating.isCommitting ? 'Committing…' : 'Commit';
    if (isCommitted) {
      writeLabel = 'Committed';
    }
  }
  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          isDisabled={isBusy}
          onPress={() => detailHref && navigate(detailHref)}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          isDisabled={isBusy || !canWrite || isCommitted}
          onPress={viaPullRequest ? onCommit : onSave}
        >
          {writeLabel}
        </Button>
      </Flex>
    ),
    [
      isBusy,
      canWrite,
      isCommitted,
      detailHref,
      navigate,
      viaPullRequest,
      onCommit,
      onSave,
      writeLabel,
    ],
  );
  useProvidePageHeaderActions(actions);

  const valuesYaml = dryRun.result
    ? dump(dryRun.result.manifests.values, YAML_OPTS)
    : '';
  const modelOptions = modelConfigs.map(modelConfig => ({
    id: modelConfig.name,
    label: modelConfig.model
      ? `${modelConfig.name} — ${modelConfig.model}`
      : modelConfig.name,
  }));
  // The agent's current model is offered even when the list does not carry it
  // (a ModelConfig the person may not list, or one that is gone): the form
  // must be able to show what the agent has.
  if (
    edit.modelConfig &&
    !modelOptions.some(option => option.id === edit.modelConfig)
  ) {
    modelOptions.unshift({ id: edit.modelConfig, label: edit.modelConfig });
  }

  return (
    <div className={classes.column}>
      <Text
        as="h2"
        variant="title-large"
        weight="bold"
        className={classes.pageTitle}
      >
        Edit agent: {agent.displayName || agent.name}
      </Text>
      <Text as="p" color="secondary" className={classes.intro}>
        The values of the agent's release, as agent-manager reads them.{' '}
        {viaPullRequest ? (
          <>
            This agent is applied from git: Commit opens a pull request as you
            with only what you changed in the repository that owns it on{' '}
            <span className={classes.code}>{installation}</span>, and the agent
            changes once it is merged.
          </>
        ) : (
          <>
            Saving sends only what you changed to{' '}
            <span className={classes.code}>{installation}</span> as you.
          </>
        )}{' '}
        A field you empty goes back to the chart's default. The agent runs on
        the platform Harness — there is no runtime to choose.
      </Text>

      <div className={classes.section}>
        <Card>
          <CardBody>
            <Flex direction="column" gap="4">
              <TextField
                label="Display name"
                description="The friendly name the portal shows. Empty keeps the technical name."
                value={edit.displayName}
                onChange={value => set('displayName', value)}
              />
              <TextAreaField
                label="Description"
                value={edit.description}
                onChange={value => set('description', value)}
                rows={3}
              />
              <TextAreaField
                label="System prompt"
                description="Empty restores the chart's default prompt. Put long reference material in a skill; the prompt is limited in length."
                value={edit.systemMessage}
                onChange={value => set('systemMessage', value)}
                rows={10}
                mono
                maxLength={MAX_SYSTEM_MESSAGE_LENGTH}
                error={promptProblem}
              />
              <Flex direction="column" gap="2">
                <FieldLabel
                  label="Model"
                  secondaryLabel="admin-provisioned"
                  description={`A ModelConfig in ${agent.namespace}, as agent-manager lists them.`}
                />
                <Select
                  aria-label="Model"
                  isRequired
                  isDisabled={isLoadingModels && modelOptions.length === 0}
                  options={modelOptions}
                  selectedKey={edit.modelConfig || null}
                  onSelectionChange={key =>
                    key && set('modelConfig', String(key))
                  }
                  placeholder={
                    isLoadingModels ? 'Loading models…' : 'Select a model'
                  }
                />
                {modelsFailure && (
                  <Text variant="body-x-small" color="secondary">
                    The model list could not be read: {modelsFailure.message}
                  </Text>
                )}
              </Flex>
              <TextAreaField
                label="Extra egress origins"
                description="Hosts the agent may reach beyond its model, MCP servers, skill and plugin sources and telemetry. One http(s) origin per line, such as https://github.com:443; a leading * matches one host label. Empty removes every extra origin."
                value={edit.egressText}
                onChange={value => set('egressText', value)}
                rows={3}
                mono
                error={egressIssue}
              />
            </Flex>
          </CardBody>
        </Card>
      </div>

      <div className={classes.section}>
        <Card>
          <CardBody>
            <EditAgentToolsetField
              installation={installation}
              value={edit.toolset}
              onChange={selectors => set('toolset', selectors)}
            />
          </CardBody>
        </Card>
      </div>

      <div className={classes.section}>
        <Card>
          <CardBody>
            <Flex direction="column" gap="3">
              <FieldLabel
                label="Skills"
                description="Each skill stays at the commit it is pinned to; adding one pins it to the head shown on its card. Update skills on the agent's page moves the pins."
              />
              <SkillPicker
                catalog={catalog}
                selected={edit.skills}
                onToggle={toggleSkill}
                onRemove={removeSkill}
              />
            </Flex>
          </CardBody>
        </Card>
      </div>

      <div className={classes.section}>
        <SectionTitle
          title="Review"
          description={
            <>
              agent-manager's dry run (
              <span className={classes.code}>validate_agent</span>) of exactly
              the change {verb} sends: the fields that change, the values the
              release would carry, and every violation.
            </>
          }
        />
        <Flex direction="column" gap="3">
          {!dirty && <Text color="secondary">Nothing changed yet.</Text>}
          {dirty && (
            <Flex direction="column" gap="1">
              <Text variant="body-small" weight="bold">
                Changes
              </Text>
              <ul className={classes.changed} aria-label="Changed fields">
                {changed.map(field => (
                  <li key={field}>
                    <Text variant="body-small">{EDIT_FIELD_LABELS[field]}</Text>
                  </li>
                ))}
              </ul>
            </Flex>
          )}
          {dryRun.isLoading && !dryRun.result && (
            <Text color="secondary">Asking agent-manager for the dry run…</Text>
          )}
          {dryRun.failure && (
            <WriteFailure
              installation={installation}
              failure={dryRun.failure}
              action="Agents are edited"
              verb={verb}
            />
          )}
          {violations.length > 0 && (
            <Alert
              status="danger"
              title="agent-manager refuses this change"
              description={
                <ul className={classes.violations} aria-label="Violations">
                  {violations.map(violation => (
                    <li key={violation}>{violation}</li>
                  ))}
                </ul>
              }
            />
          )}
          {dryRun.result && (
            <>
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
            </>
          )}
          {updating.failure && (
            <Box mt="2">
              <WriteFailure
                installation={installation}
                failure={updating.failure}
                action="Agents are edited"
                verb={verb}
              />
            </Box>
          )}
          {committed && committed.signature === signature && (
            <Box mt="2">
              <CommitOutcome result={committed.result} />
            </Box>
          )}
        </Flex>
      </div>

      {/* The same actions as the header's, at the end of a long form. */}
      <div className={classes.section}>
        <Card>
          <CardBody>
            <Flex justify="between" align="center" gap="4">
              <Flex direction="column" gap="1">
                {viaPullRequest ? (
                  <>
                    <Text weight="bold">Commit to the GitOps repository</Text>
                    <Text variant="body-small" color="secondary">
                      agent-manager opens a pull request as you that rewrites
                      the release's file. Nothing changes on {installation}{' '}
                      until it is merged.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text weight="bold">Save to {installation}</Text>
                    <Text variant="body-small" color="secondary">
                      Updates the release's values through agent-manager, as
                      you. The agent's page then shows the new revision becoming
                      ready on its Harness.
                    </Text>
                  </>
                )}
              </Flex>
              {actions}
            </Flex>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function EditAgentPageContent() {
  const classes = useStyles();
  const { installation = '', namespace = '', name = '' } = useParams();
  const agentsLink = useRouteRef(agentsRouteRef);
  const agentDetailLink = useRouteRef(agentDetailRouteRef);
  const detailHref = agentDetailLink?.({ installation, namespace, name });

  // Feature detection, the same as the create flow's and the detail page's:
  // edits go through agent-manager, reached through the installation's muster.
  const availability = useAgentManagerAvailability(
    installation ? [installation] : [],
  );
  const presence = availability.presenceOf(installation);
  const { agent, isLoading, failure } = useAgentManagerAgent(
    installation,
    namespace,
    name,
    { enabled: presence === 'available' },
  );

  // An agent applied from git is edited through a pull request when
  // agent-manager reports the commit capability, and never offered otherwise —
  // the same sentence the detail page's actions menu gives, in the same place
  // this page already explains a missing agent-manager. While either read is in
  // flight there is no verdict and no reason; that lands on the progress branch
  // below.
  const isGitOpsOwned = agent?.managed === 'gitops';
  const { info, isLoading: isInfoLoading } = useAgentManagerInfo(
    presence === 'available' ? installation : undefined,
  );
  const canCommit = info?.capabilities?.commit === true;
  const gate = {
    presence,
    isUnavailable: availability.isUnavailable,
    isGitOpsOwned,
    canCommit,
    isVerdictPending: isLoading || (isGitOpsOwned && isInfoLoading),
  };
  const mode = agentWriteMode(gate);
  const reason = agentManagerAbsenceReason(
    { ...gate, isGitOpsOwned: isGitOpsOwned && !canCommit },
    installation,
  );

  if (reason) {
    return (
      <EmptyState
        missing="info"
        title="This agent cannot be edited from here"
        description={reason}
        action={
          detailHref ? (
            <Link to={detailHref}>Back to the agent</Link>
          ) : undefined
        }
      />
    );
  }
  if (gate.presence === 'unknown' || gate.isVerdictPending) {
    return <Progress aria-label="Loading agent" />;
  }
  if (failure) {
    return (
      <div className={classes.column}>
        <Flex direction="column" gap="3">
          {failure.kind === 'not-connected' ? (
            <ConnectAgentManagerAlert
              installation={installation}
              message={failure.message}
              action="Agents are edited"
            />
          ) : (
            <Alert
              status="danger"
              title="agent-manager could not read this agent"
              description={failure.message}
            />
          )}
          {detailHref ? <Link to={detailHref}>Back to the agent</Link> : null}
        </Flex>
      </div>
    );
  }
  if (!agent) {
    return (
      <EmptyState
        missing="data"
        title="Agent not found"
        description={`agent-manager on ${installation} knows no agent "${name}" in namespace "${namespace}".`}
        action={
          agentsLink ? <Link to={agentsLink()}>Back to agents</Link> : undefined
        }
      />
    );
  }
  return (
    <EditAgentForm
      installation={installation}
      agent={agent}
      mode={mode ?? 'apply'}
    />
  );
}

/**
 * Editing one agent through agent-manager over muster, as the signed-in
 * person: the form pre-filled from `get_agent` (display name, description,
 * system prompt, model, toolset, skills with their pins — no runtime), the
 * review as `validate_agent`'s dry run of the update, Save as `update_agent`
 * with only the changed fields. An agent applied from git is dry-run and
 * written in mode `commit` — Commit opens a pull request in place of Save —
 * where agent-manager reports the capability, and never reaches the form
 * otherwise. A suspended agent's dry run comes back as agent-manager's refusal
 * and Save stays locked.
 */
export function EditAgentPage() {
  return (
    <Content>
      <EditAgentPageContent />
    </Content>
  );
}
