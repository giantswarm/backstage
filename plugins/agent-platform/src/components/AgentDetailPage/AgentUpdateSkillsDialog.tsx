import { useMemo } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ConfirmDialog } from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerAgent } from '../../hooks/useAgentManagerAgent';
import { useValidateAgentUpdate } from '../../hooks/useValidateAgentUpdate';
import type { UpdateAgentState } from '../../hooks/useUpdateAgent';
import type { AgentSkillEntry, AgentUpdate } from '../../lib/agentManager';
import { repoSlug } from '../../lib/skills';
import {
  refreshChangesAnything,
  skillRefreshPlan,
  type SkillRefreshEntry,
} from '../../lib/skillRefresh';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { shortPin } from './helpers';

const useStyles = makeStyles(theme => ({
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    '& th, & td': {
      textAlign: 'left',
      padding: theme.spacing(0.75, 1),
      borderBottom: `1px solid ${theme.palette.divider}`,
      verticalAlign: 'top',
    },
    '& th': {
      fontWeight: 600,
      color: theme.palette.text.secondary,
      fontSize: '0.75rem',
    },
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  violations: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
  },
}));

/** One row: what the skill is pinned to, what the head is, whether it moves. */
function PlanRow({ entry }: { entry: SkillRefreshEntry }) {
  const classes = useStyles();
  const place =
    entry.kind === 'git'
      ? `${repoSlug(entry.source)}${entry.path ? ` · ${entry.path}` : ''}`
      : entry.source.split('@')[0];

  let outcome: string;
  if (entry.kind === 'oci') {
    outcome = 'Pinned by digest — left alone';
  } else if (entry.head === undefined) {
    outcome = '—';
  } else if (entry.changes) {
    outcome = 'Moves to the head';
  } else {
    outcome = 'Already at the head';
  }

  return (
    <tr data-testid={`skill-refresh-${entry.name}`}>
      <td>
        <Text variant="body-small" weight="bold">
          {entry.name}
        </Text>
        <Text variant="body-x-small" color="secondary">
          {place}
        </Text>
      </td>
      <td>
        <span className={classes.code} title={entry.pinned}>
          {shortPin(entry.pinned)}
        </span>
      </td>
      <td>
        {entry.kind === 'git' && entry.head ? (
          <span className={classes.code} title={entry.head}>
            {shortPin(entry.head)}
          </span>
        ) : (
          <Text variant="body-x-small" color="secondary">
            {entry.kind === 'oci' ? 'n/a' : '…'}
          </Text>
        )}
      </td>
      <td>
        <Text
          variant="body-small"
          color={entry.changes ? 'primary' : 'secondary'}
        >
          {outcome}
        </Text>
      </td>
    </tr>
  );
}

export type AgentUpdateSkillsDialogProps = {
  installation: string;
  namespace: string;
  name: string;
  displayName: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /** The page's `useUpdateAgent`, shared with the edit flow's Save. */
  updating: UpdateAgentState;
  /** Called with agent-manager's result after the write landed. */
  onUpdated: (
    skills: AgentSkillEntry[] | undefined,
    requestedBy?: string,
  ) => void;
};

/**
 * "Update skills": re-pin every git skill of the agent to the head of its
 * repository's default branch (D8 — skills never move on their own).
 *
 * Open, the dialog asks agent-manager for the dry run (`validate_agent` with
 * `update: true` and `refreshSkills`) and shows, per git skill, the pinned
 * commit next to the head it would move to, and which entries change. Skills
 * pinned by digest are listed and left alone. A repository agent-manager
 * cannot reach comes back as its refusal and nothing can be confirmed;
 * confirming calls `update_agent` with `refreshSkills` and nothing else, so no
 * other value of the release moves.
 */
export function AgentUpdateSkillsDialog({
  installation,
  namespace,
  name,
  displayName,
  isOpen,
  onOpenChange,
  updating,
  onUpdated,
}: AgentUpdateSkillsDialogProps) {
  const classes = useStyles();
  const {
    agent,
    isLoading: isLoadingAgent,
    failure: readFailure,
  } = useAgentManagerAgent(installation, namespace, name, { enabled: isOpen });

  const refresh = useMemo<AgentUpdate | undefined>(
    () => (isOpen ? { namespace, name, refreshSkills: true } : undefined),
    [isOpen, namespace, name],
  );
  const dryRun = useValidateAgentUpdate(installation, refresh);

  const current = useMemo(() => agent?.skills ?? [], [agent]);
  const refreshed = dryRun.result?.manifests.values.skills as
    AgentSkillEntry[] | undefined;
  const plan = useMemo(
    () => skillRefreshPlan(current, refreshed),
    [current, refreshed],
  );
  const gitSkills = plan.filter(entry => entry.kind === 'git');
  const violations = dryRun.result?.errors ?? [];
  const failure = dryRun.failure ?? readFailure;
  const notConnected =
    failure?.kind === 'not-connected' ||
    updating.failure?.kind === 'not-connected';
  const isLoading = isLoadingAgent || dryRun.isLoading;
  const changesAnything = refreshChangesAnything(plan);

  const canConfirm =
    !isLoading &&
    !failure &&
    violations.length === 0 &&
    Boolean(dryRun.result) &&
    changesAnything;

  const onConfirm = async () => {
    if (!canConfirm) {
      return;
    }
    let result;
    try {
      result = await updating.update({ namespace, name, refreshSkills: true });
    } catch {
      // Left to the dialog, which stays open and shows agent-manager's message.
      return;
    }
    onOpenChange(false);
    onUpdated(result.agent.skills, result.requestedBy);
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={isOpenNow => {
        if (!isOpenNow) {
          updating.reset();
        }
        onOpenChange(isOpenNow);
      }}
      title={`Update the skills of "${displayName}"?`}
      confirmLabel="Update skills"
      busyLabel="Updating…"
      isBusy={updating.isUpdating}
      isConfirmDisabled={!canConfirm}
      error={
        updating.failure && !notConnected ? updating.failure.message : undefined
      }
      onConfirm={onConfirm}
      width={720}
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium">
          Every git skill is re-pinned to the head of its repository's default
          branch — the agent then runs the skills as they are today. Nothing
          else about the agent changes.
        </Text>

        {isLoading && !dryRun.result && (
          <Text color="secondary">
            Asking agent-manager which skills would move…
          </Text>
        )}

        {failure?.kind === 'not-connected' && (
          <ConnectAgentManagerAlert
            installation={installation}
            message={failure.message}
            action="Skills are updated"
          />
        )}
        {failure && failure.kind !== 'not-connected' && (
          <Alert
            status="danger"
            title={
              failure.kind === 'refused'
                ? 'agent-manager refuses to update the skills'
                : 'Could not reach agent-manager'
            }
            description={failure.message}
          />
        )}
        {violations.length > 0 && (
          <Alert
            status="danger"
            title="agent-manager refuses the update"
            description={
              <ul className={classes.violations} aria-label="Violations">
                {violations.map(violation => (
                  <li key={violation}>{violation}</li>
                ))}
              </ul>
            }
          />
        )}

        {agent && plan.length === 0 && (
          <Text variant="body-small" color="secondary">
            This agent mounts no skills; there is nothing to re-pin.
          </Text>
        )}
        {agent && plan.length > 0 && gitSkills.length === 0 && (
          <Text variant="body-small" color="secondary">
            This agent mounts no git skills; digest-pinned skills never move.
          </Text>
        )}

        {plan.length > 0 && (
          <table className={classes.table} aria-label="Skills and their pins">
            <thead>
              <tr>
                <th>Skill</th>
                <th>Pinned</th>
                <th>Default-branch head</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((entry, index) => (
                <PlanRow key={`${entry.name}#${index}`} entry={entry} />
              ))}
            </tbody>
          </table>
        )}

        {dryRun.result && !failure && violations.length === 0 && (
          <Text variant="body-small" color="secondary">
            {changesAnything
              ? 'Confirming re-pins the skills marked above; the platform Harness then compiles a new revision.'
              : "Every git skill is already at its repository's default-branch head."}
          </Text>
        )}
      </Flex>
    </ConfirmDialog>
  );
}
