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
} from '../../lib/agentManager';
import { skillEntryOf } from '../../lib/agentSpec';
import type { DiscoveredSkill } from '../../lib/skills';
import { agentDetailRouteRef, agentsRouteRef } from '../../routes';
import { CodeBlock } from '../CodeBlock';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { TextAreaField } from '../NewAgentPage/TextAreaField';
import { isMounted, SkillPicker } from '../SkillPicker';
import { agentManagerAbsenceReason } from '../AgentDetailPage/AgentActionsMenu';
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
}: {
  installation: string;
  failure: {
    kind: 'refused' | 'not-connected' | 'error';
    code?: string;
    message: string;
  };
  action: string;
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
  let title = 'Save failed';
  if (failure.kind === 'refused') {
    title = failure.code === 'forbidden' ? 'Not permitted' : 'Refused';
  }
  return <Alert status="danger" title={title} description={failure.message} />;
}

/**
 * The form, once agent-manager's reading of the agent is in hand. Holds the
 * edit state; everything derived from it — the changed fields, the update to
 * send, the dry run — is computed from the baseline and the state, so Save
 * carries exactly what changed and nothing else.
 */
function EditAgentForm({
  installation,
  agent,
}: {
  installation: string;
  agent: AgentManagerAgent;
}) {
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
  const { info } = useAgentManagerInfo(installation);
  const canCommit = info?.capabilities?.commit === true;

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

  // agent-manager's dry run of exactly the update Save would send; nothing is
  // requested while nothing changed.
  const dryRun = useValidateAgentUpdate(
    installation,
    dirty ? update : undefined,
  );
  const violations = dryRun.result?.errors ?? [];
  const canWrite =
    dirty &&
    Boolean(dryRun.result) &&
    violations.length === 0 &&
    !dryRun.failure;

  const updating = useUpdateAgent(installation);
  const [commitResult, setCommitResult] = useState<CommitAgentResult>();

  const onSave = useCallback(async () => {
    setCommitResult(undefined);
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
          },
        },
      });
    }
  }, [updating, update, detailHref, navigate, installation, agent]);

  const onCommit = useCallback(async () => {
    // `update_agent` with `mode: commit` (giantswarm/agent-manager#24) is
    // offered only under the capability gate; agent-manager answers the pull
    // request or the connect step.
    setCommitResult(undefined);
    updating.reset();
    try {
      setCommitResult(await updating.commit(update));
    } catch {
      // Left to `updating.failure`.
    }
  }, [updating, update]);

  const isBusy = updating.isUpdating || updating.isCommitting;
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
        {canCommit && (
          <Button
            variant="secondary"
            isDisabled={isBusy || !canWrite}
            onPress={onCommit}
          >
            {updating.isCommitting ? 'Committing…' : 'Commit'}
          </Button>
        )}
        <Button
          variant="primary"
          isDisabled={isBusy || !canWrite}
          onPress={onSave}
        >
          {updating.isUpdating ? 'Saving…' : 'Save'}
        </Button>
      </Flex>
    ),
    [
      isBusy,
      canWrite,
      canCommit,
      detailHref,
      navigate,
      onCommit,
      onSave,
      updating.isCommitting,
      updating.isUpdating,
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
        The values of the agent's release, as agent-manager reads them. Saving
        sends only what you changed to{' '}
        <span className={classes.code}>{installation}</span> as you; a field you
        empty goes back to the chart's default. The agent runs on the platform
        Harness — there is no runtime to choose.
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
                description="Empty restores the chart's default prompt."
                value={edit.systemMessage}
                onChange={value => set('systemMessage', value)}
                rows={10}
                mono
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
              the change Save sends: the fields that change, the values the
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
              />
            </Box>
          )}
          {commitResult && (
            <Box mt="2">
              <CommitOutcome result={commitResult} />
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
                <Text weight="bold">Save to {installation}</Text>
                <Text variant="body-small" color="secondary">
                  Updates the release's values through agent-manager, as you.
                  The agent's page then shows the new revision becoming ready on
                  the platform Harness.
                </Text>
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
  const gate = {
    presence: availability.presenceOf(installation),
    isUnavailable: availability.isUnavailable,
  };
  const reason = agentManagerAbsenceReason(gate, installation);
  const { agent, isLoading, failure } = useAgentManagerAgent(
    installation,
    namespace,
    name,
    { enabled: gate.presence === 'available' },
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
  if (gate.presence === 'unknown' || isLoading) {
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
  return <EditAgentForm installation={installation} agent={agent} />;
}

/**
 * Editing one agent through agent-manager over muster, as the signed-in
 * person: the form pre-filled from `get_agent` (display name, description,
 * system prompt, model, toolset, skills with their pins — no runtime), the
 * review as `validate_agent`'s dry run of the update, Save as `update_agent`
 * with only the changed fields. A GitOps-owned or suspended agent's dry run
 * comes back as agent-manager's refusal and Save stays locked. Commit
 * (`mode: commit`) appears only when `get_info` reports the capability.
 */
export function EditAgentPage() {
  return (
    <Content>
      <EditAgentPageContent />
    </Content>
  );
}
