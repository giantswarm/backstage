import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  ConfirmDialog,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import { useAgentManagerAgent } from '../../hooks/useAgentManagerAgent';
import { useCommitAgentUpdateDryRun } from '../../hooks/useCommitAgentUpdateDryRun';
import { useValidateAgentUpdate } from '../../hooks/useValidateAgentUpdate';
import type { UpdateAgentState } from '../../hooks/useUpdateAgent';
import {
  missingReleaseFile,
  type AgentSkillEntry,
  type AgentUpdate,
  type CommitAgentResult,
  type WriteMode,
} from '../../lib/agentManager';
import { repoSlug } from '../../lib/skills';
import {
  refreshChangesAnything,
  skillRefreshPlan,
  type SkillRefreshEntry,
} from '../../lib/skillRefresh';
import { CellSkeleton } from './CellSkeleton';
import { SkillRefreshSkeletonRow } from './SkillRefreshSkeletonRow';
import { CommitOutcome } from '../CommitOutcome';
import { ConnectAgentManagerAlert } from '../ConnectAgentManagerAlert';
import { MissingReleaseFileAlert } from '../MissingReleaseFileAlert';
import { shortPin } from './helpers';

/**
 * Rows the table shows while the agent's skills are still being read, when the
 * page did not say how many it has: enough to read as a table, few enough not
 * to promise a long list.
 */
const DEFAULT_SKELETON_ROWS = 3;

const useStyles = makeStyles(theme => ({
  // At phone width the table scrolls inside the dialog rather than squeezing
  // its pins into nothing.
  tableScroll: {
    overflowX: 'auto',
  },
  // Fixed layout with set column widths: the heads and outcomes that arrive
  // with the dry run fill their cells instead of resizing the columns.
  table: {
    width: '100%',
    minWidth: '36rem',
    tableLayout: 'fixed',
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
  // A git commit (12 characters) fits, and so does an OCI pin's digest
  // (`sha256:` and 12). Anything longer is cut, and its title carries the
  // whole pin.
  colPinned: { width: '10.5rem' },
  colHead: { width: '8rem' },
  colOutcome: { width: '11rem' },
  pin: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  skill: {
    overflowWrap: 'anywhere',
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  // Holds the line under the table at the loading indicator's height in every
  // state, so the indicator's delayed label, the note or notice that replaces
  // it, or nothing at all do not push the dialog around.
  status: {
    minHeight: theme.spacing(5),
  },
  violations: {
    margin: 0,
    paddingLeft: theme.spacing(2.5),
  },
}));

/**
 * The pin as the Pinned column shows it: a short commit, or an OCI reference's
 * digest without the repository the Skill column already names.
 */
function pinLabel(entry: SkillRefreshEntry): string {
  if (entry.kind === 'oci') {
    return shortPin(entry.pinned.slice(entry.pinned.indexOf('@') + 1));
  }
  return shortPin(entry.pinned);
}

/**
 * One row: what the skill is pinned to, what the head is, whether it moves.
 * `isReading` while the dry run has not answered: the head and the outcome
 * are placeholders, in the space they will take.
 */
function PlanRow({
  entry,
  isReading,
}: {
  entry: SkillRefreshEntry;
  isReading: boolean;
}) {
  const classes = useStyles();
  const awaitsHead = isReading && entry.kind === 'git';
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

  let headCell: ReactNode;
  if (awaitsHead) {
    headCell = <CellSkeleton width="80%" />;
  } else if (entry.kind === 'git' && entry.head) {
    headCell = (
      <span className={classes.code} title={entry.head}>
        {shortPin(entry.head)}
      </span>
    );
  } else {
    // No head: a digest pin has none, and a git skill whose dry run failed or
    // matched no head has none to show either.
    headCell = (
      <Text variant="body-x-small" color="secondary">
        {entry.kind === 'oci' ? 'n/a' : '—'}
      </Text>
    );
  }

  return (
    <tr data-testid={`skill-refresh-${entry.name}`}>
      <td className={classes.skill}>
        {/* The name over its source: two elements, spaced by the layout. */}
        <Flex direction="column" gap="0.5">
          <Text variant="body-small" weight="bold">
            {entry.name}
          </Text>
          <Text variant="body-x-small" color="secondary">
            {place}
          </Text>
        </Flex>
      </td>
      <td className={classes.pin}>
        <span className={classes.code} title={entry.pinned}>
          {pinLabel(entry)}
        </span>
      </td>
      <td className={classes.pin}>{headCell}</td>
      <td>
        {awaitsHead ? (
          <CellSkeleton width="70%" />
        ) : (
          <Text
            variant="body-small"
            color={entry.changes ? 'primary' : 'secondary'}
          >
            {outcome}
          </Text>
        )}
      </td>
    </tr>
  );
}

const ALREADY_AT_HEAD =
  "Every git skill is already at its repository's default-branch head.";

export type AgentUpdateSkillsDialogProps = {
  installation: string;
  namespace: string;
  name: string;
  displayName: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /**
   * How many skills the page already shows for the agent, so the table holds
   * that many placeholder rows while agent-manager's reading of them loads.
   */
  skillCount?: number;
  /**
   * `apply` re-pins live. `commit` is for an agent applied from git, which
   * agent-manager refuses to write live: the only action is then a pull request
   * in the owning GitOps repository (`mode: commit`,
   * giantswarm/agent-manager#24). Fixed by the page when it opens the dialog.
   */
  mode?: WriteMode;
  /** The page's `useUpdateAgent`, shared with the edit flow's Save. */
  updating: UpdateAgentState;
  /**
   * Called with agent-manager's result after the write landed. `fromGeneration`
   * is the template generation from before it, which the page hands to the
   * progress so it waits for this write's revision rather than reporting the
   * one that was already there.
   */
  onUpdated: (
    skills: AgentSkillEntry[] | undefined,
    requestedBy?: string,
    fromGeneration?: number,
  ) => void;
};

/**
 * "Update all skills to latest": re-pin every git skill of the agent to the head of its
 * repository's default branch (D8 — skills never move on their own).
 *
 * Open, the dialog asks agent-manager for the dry run (`validate_agent` with
 * `update: true` and `refreshSkills`) and shows, per git skill, the pinned
 * commit next to the head it would move to, and which entries change. Skills
 * pinned by digest are listed and left alone. A repository agent-manager
 * cannot reach comes back as its refusal and nothing can be confirmed;
 * confirming calls `update_agent` with `refreshSkills` and nothing else, so no
 * other value of the release moves.
 *
 * For an agent applied from git (`mode: commit`) the same dry run is asked in
 * commit mode and confirming opens a pull request as the person instead; the
 * dialog then shows the pull request (`CommitOutcome`) and only closes, and the
 * page has no revision to watch — the agent moves once it is merged.
 *
 * `validate_agent` does not read the repository. So once it shows a pull
 * request to open — skills that move, no violations — the dialog asks
 * `update_agent`'s own commit dry run, which does, and the plan shows the pins
 * that dry run would commit. agent-manager edits a release only in its own
 * file in its directory; when that file is missing the dry run is refused, and
 * the dialog says, under the plan, that the skills are updated in the GitOps
 * source instead, and offers only Close. Any other refusal of that dry run (no
 * GitHub authorization yet, say) leaves the confirm as it was: the write
 * reports it in agent-manager's words.
 */
export function AgentUpdateSkillsDialog({
  installation,
  namespace,
  name,
  displayName,
  isOpen,
  onOpenChange,
  skillCount,
  mode = 'apply',
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
  const validated = useValidateAgentUpdate(installation, refresh, mode);
  const viaPullRequest = mode === 'commit';
  // What `mode: commit` answered: the pull request. Cleared on close, so the
  // next open starts from the dry run again.
  const [commitResult, setCommitResult] = useState<CommitAgentResult>();
  const isCommitted = commitResult?.commit !== undefined;

  const current = useMemo(() => agent?.skills ?? [], [agent]);
  const validatedSkills = validated.result?.manifests.values.skills as
    AgentSkillEntry[] | undefined;
  const validatedPlan = useMemo(
    () => skillRefreshPlan(current, validatedSkills),
    [current, validatedSkills],
  );
  const violations = validated.result?.errors ?? [];
  const failure = validated.failure ?? readFailure;

  // The pull request's own dry run, only when there is one to open: it reads
  // GitHub as the person, and agent-manager refuses a missing release file
  // even when nothing would change.
  const opensPullRequest =
    viaPullRequest &&
    Boolean(validated.result) &&
    !failure &&
    violations.length === 0 &&
    refreshChangesAnything(validatedPlan);
  const commitDryRun = useCommitAgentUpdateDryRun(
    installation,
    opensPullRequest ? refresh : undefined,
  );
  const plan = useMemo(
    () =>
      commitDryRun.result
        ? skillRefreshPlan(current, commitDryRun.result.skills)
        : validatedPlan,
    [commitDryRun.result, current, validatedPlan],
  );
  // The write itself can still answer it when the dry run did not (it was
  // refused for another reason, or the file went in between).
  const missing =
    missingReleaseFile(commitDryRun.failure) ??
    missingReleaseFile(updating.failure);

  const gitSkills = plan.filter(entry => entry.kind === 'git');
  const notConnected =
    failure?.kind === 'not-connected' ||
    updating.failure?.kind === 'not-connected';
  const isReadingPlan = isLoadingAgent || validated.isLoading;
  const isLoading = isReadingPlan || commitDryRun.isLoading;
  // No skills to list yet: the table shows placeholder rows, as many as the
  // page knows of, so the table keeps its height when the real ones arrive.
  const isAwaitingSkills = isLoadingAgent;
  const skeletonRows =
    skillCount && skillCount > 0 ? skillCount : DEFAULT_SKELETON_ROWS;
  const changesAnything = refreshChangesAnything(plan);

  const confirmNote = viaPullRequest
    ? 'Confirming opens a pull request re-pinning the skills marked above; once merged, the Harness compiles a new revision.'
    : 'Confirming re-pins the skills marked above; its Harness then compiles a new revision.';

  const showsNote =
    Boolean(validated.result) &&
    !isLoading &&
    !failure &&
    !missing &&
    violations.length === 0 &&
    !isCommitted;
  const canConfirm = showsNote && changesAnything;

  const onConfirm = async () => {
    if (!canConfirm) {
      return;
    }
    if (viaPullRequest) {
      updating.reset();
      try {
        setCommitResult(
          await updating.commit({ namespace, name, refreshSkills: true }),
        );
      } catch {
        // Left to the dialog, which stays open and shows agent-manager's message.
      }
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
    onUpdated(result.agent.skills, result.requestedBy, result.fromGeneration);
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={isOpenNow => {
        if (!isOpenNow) {
          updating.reset();
          setCommitResult(undefined);
        }
        onOpenChange(isOpenNow);
      }}
      title={`Update all skills of "${displayName}" to latest?`}
      confirmLabel={viaPullRequest ? 'Open pull request' : 'Update all skills'}
      busyLabel={viaPullRequest ? 'Opening pull request…' : 'Updating…'}
      isBusy={updating.isUpdating || updating.isCommitting}
      // Nothing left to confirm once the pull request is open, or once
      // agent-manager said it cannot open one: only Close stays.
      isDone={isCommitted || Boolean(missing)}
      isConfirmDisabled={!canConfirm}
      error={
        updating.failure && !notConnected && !missing
          ? updating.failure.message
          : undefined
      }
      onConfirm={onConfirm}
      width="min(90vw, 720px)"
    >
      <Flex direction="column" gap="3">
        <Text variant="body-medium">
          Every git skill moves to the latest commit of its repository's default
          branch. Nothing else about the agent changes.
        </Text>
        {viaPullRequest && !missing && (
          <Text variant="body-medium">
            This agent is applied from GitOps, so agent-manager opens a pull
            request as you with the new pins. The skills move once it is merged.
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

        {(plan.length > 0 || isAwaitingSkills) && (
          <div className={classes.tableScroll}>
            <table
              className={classes.table}
              aria-label="Skills and their pins"
              aria-busy={isLoading}
            >
              <colgroup>
                <col />
                <col className={classes.colPinned} />
                <col className={classes.colHead} />
                <col className={classes.colOutcome} />
              </colgroup>
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Pinned</th>
                  <th>Default-branch head</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {isAwaitingSkills
                  ? Array.from({ length: skeletonRows }, (_, index) => (
                      <SkillRefreshSkeletonRow key={index} />
                    ))
                  : plan.map((entry, index) => (
                      <PlanRow
                        key={`${entry.name}#${index}`}
                        entry={entry}
                        isReading={isLoading}
                      />
                    ))}
              </tbody>
            </table>
          </div>
        )}

        {/* One line under the table: what is being asked, then what confirming
            does, why it cannot be done here, or nothing; its height is held
            either way. The indicator stays mounted from the first question to
            the last, so it does not restart between them. */}
        <div className={classes.status}>
          {missing && (
            <MissingReleaseFileAlert
              missing={missing}
              title="Skills cannot be updated here"
              summary="To update the skills, change their pins in the agent's GitOps source."
              change="the pins to the default-branch heads listed above"
            />
          )}
          {isLoading && (
            <LoadingIndicator
              label={
                isReadingPlan
                  ? 'Asking agent-manager which skills would move…'
                  : 'Asking agent-manager whether it can open the pull request…'
              }
            />
          )}
          {showsNote && (
            <Text variant="body-small" color="secondary">
              {changesAnything ? confirmNote : ALREADY_AT_HEAD}
            </Text>
          )}
        </div>

        {commitResult && <CommitOutcome result={commitResult} />}
      </Flex>
    </ConfirmDialog>
  );
}
