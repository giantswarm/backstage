import { useMemo, useState } from 'react';
import { Alert, ButtonLink, Flex, Text, TextField } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { load } from 'js-yaml';
import {
  Alignment,
  Committed,
  DeclarationEntry,
  Dispatch,
  InventoryRecord,
  Plan,
  repositoriesApiRef,
} from '../../apis';
import { EMPTY, flavourProblem } from '../../lib/declaration';
import { editedEntry, fromEntry, keptFields } from '../../lib/entry';
import { DeclarationFields } from '../CreateRepositoryPage/DeclarationFields';
import { ActionDialog } from './ActionDialog';
import { LiveAlignment } from './LiveAlignment';
import { PlanView } from './PlanView';
import { PullRequestOpened } from './PullRequestOpened';

export interface RowDialogProps {
  record: InventoryRecord;
  isOpen: boolean;
  onClose: () => void;
  /** The write landed (a pull request, a dispatch). */
  onDone: () => void;
}

const reasonField = (
  label = 'Why, for the pull request body and the ask.',
): { label: string; description: string } => ({
  label: 'Reason',
  description: label,
});

/**
 * The entry as the team file holds it: the one item of the file's list. Not
 * parseable → undefined (the dialog says so); the schema's verdict on the
 * content is the manager's.
 */
export function parseEntry(yaml: string): DeclarationEntry | undefined {
  try {
    const parsed = load(yaml);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { name?: unknown }).name === 'string'
    ) {
      return entry as DeclarationEntry;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** A record with its team-file entry: what the team-file edits work on. */
export type DeclaredRecord = InventoryRecord & {
  declaration: NonNullable<InventoryRecord['declaration']>;
};

export const isDeclared = (record: InventoryRecord): record is DeclaredRecord =>
  record.declaration !== null;

/**
 * Edit: the entry as the Create form shows it -- description and
 * visibility, the preset with the declaration as its result behind Adjust,
 * the opt-in to alignment, the reason -- opened on the entry as it stands in
 * the team file; the team and the name are fixed. `update_repository` takes
 * the entry whole: the form's fields replaced, every field the form does not
 * carry kept as it was and named on the form.
 */
export function EditDialog({
  record,
  isOpen,
  onClose,
  onDone,
}: Omit<RowDialogProps, 'record'> & { record: DeclaredRecord }) {
  const api = useApi(repositoriesApiRef);
  const { team, file, entry: yaml } = record.declaration;
  const entry = useMemo(() => parseEntry(yaml), [yaml]);
  const [form, setForm] = useState(() =>
    entry ? fromEntry(entry, team) : EMPTY,
  );
  const change = () => {
    if (!entry) {
      throw new Error(`${file}: the entry of ${record.name} could not be read`);
    }
    return {
      entry: editedEntry(entry, form),
      reason: form.reason.trim() || undefined,
    };
  };
  return (
    <ActionDialog<Plan, Committed>
      title={`Edit ${record.name}`}
      intro={`The team-file entry of ${record.repository} is replaced by the declaration below, the fields as Create repository asks them. The manager validates the entry against the repositories schema; the reconciler applies the change after ${team}'s review of the pull request.`}
      isOpen={isOpen}
      onClose={onClose}
      ready={!!entry && !flavourProblem(form.language, form.flavours)}
      fields={
        entry ? (
          <DeclarationFields
            form={form}
            onChange={setForm}
            subject={{
              kind: 'existing',
              repository: record.repository,
              team,
              file,
              kept: keptFields(entry),
            }}
            isDisabled={false}
          />
        ) : (
          <Alert
            status="danger"
            title={`The entry of ${record.name} in ${file} could not be read`}
            description="Not one YAML item with a name: the team file needs a look before the entry can be edited here."
          />
        )
      }
      dryRun={() =>
        api.updateRepository(record.repository, change(), { dryRun: true })
      }
      renderPlan={plan => <PlanView plan={plan} />}
      commit={() =>
        api.updateRepository(record.repository, change(), { mode: 'commit' })
      }
      renderDone={result => <PullRequestOpened result={result} />}
      commitLabel="Open pull request"
      onDone={onDone}
    />
  );
}

/** Transfer: the receiving team; its member approves, the giving team is told. */
export function TransferDialog({
  record,
  isOpen,
  onClose,
  onDone,
}: RowDialogProps) {
  const api = useApi(repositoriesApiRef);
  const [toTeam, setToTeam] = useState('');
  const [reason, setReason] = useState('');
  const from = record.declaration?.team ?? 'its team';
  const args = () => ({ toTeam: toTeam.trim(), reason: reason || undefined });
  return (
    <ActionDialog<Plan, Committed>
      title={`Transfer ${record.name}`}
      intro={`${from} gives ${record.repository}; the team named below takes it. Its entry leaves ${from}'s file and enters the receiving team's file in one pull request that names both teams. The ask goes to the receiving team's channel and its member approves; ${from} gets a notice. The reconciler then re-applies permissions, CODEOWNERS and the catalog mapping for the new owner.`}
      isOpen={isOpen}
      onClose={onClose}
      ready={toTeam.trim().length > 0}
      fields={
        <>
          <TextField
            label="Receiving team"
            description="The team's GitHub slug: team-planeteers, …"
            isRequired
            value={toTeam}
            onChange={setToTeam}
          />
          <TextField {...reasonField()} value={reason} onChange={setReason} />
        </>
      }
      dryRun={() =>
        api.transferRepository(record.repository, args(), { dryRun: true })
      }
      renderPlan={plan => <PlanView plan={plan} />}
      commit={() =>
        api.transferRepository(record.repository, args(), { mode: 'commit' })
      }
      renderDone={result => <PullRequestOpened result={result} />}
      commitLabel="Open pull request"
      onDone={onDone}
    />
  );
}

const LIFECYCLE_TEXT = {
  deprecated:
    'security-only Renovate updates and a deprecated flag on the catalog entity; the repository stays as it is.',
  archived:
    'the reconciler archives the repository on GitHub and unfollows it on CircleCI; the entry stays in the team file as the record. Deletion is not expressible.',
};

/** Deprecate or Archive: `set_lifecycle`, the team's review asked in its channel. */
export function LifecycleDialog({
  lifecycle,
  record,
  isOpen,
  onClose,
  onDone,
}: RowDialogProps & { lifecycle: 'deprecated' | 'archived' }) {
  const api = useApi(repositoriesApiRef);
  const [reason, setReason] = useState('');
  const team = record.declaration?.team ?? 'the owning team';
  const verb = lifecycle === 'archived' ? 'Archive' : 'Deprecate';
  const args = () => ({ lifecycle, reason: reason || undefined });
  return (
    <ActionDialog<Plan, Committed>
      title={`${verb} ${record.name}`}
      intro={
        <>
          Sets <code>lifecycle: {lifecycle}</code> in the team-file entry of{' '}
          {record.repository}: {LIFECYCLE_TEXT[lifecycle]} The pull request is
          opened as you; the ask goes to {team}'s channel, where a member's
          Approve (or an approving review on GitHub) lands it.
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      ready
      fields={
        <TextField {...reasonField()} value={reason} onChange={setReason} />
      }
      dryRun={() =>
        api.setLifecycle(record.repository, args(), { dryRun: true })
      }
      renderPlan={plan => <PlanView plan={plan} />}
      commit={() =>
        api.setLifecycle(record.repository, args(), { mode: 'commit' })
      }
      renderDone={result => <PullRequestOpened result={result} />}
      commitLabel="Open pull request"
      onDone={onDone}
    />
  );
}

function DispatchView({ dispatch }: { dispatch: Dispatch }) {
  return (
    <Alert
      status={dispatch.dispatched ? 'success' : 'info'}
      title={
        dispatch.dispatched
          ? `Dispatched ${dispatch.workflow} as ${dispatch.as}`
          : `Would dispatch ${dispatch.workflow} as ${dispatch.as}`
      }
      description={
        <div data-testid="dispatch">
          <Text variant="body-small">
            Inputs:{' '}
            {Object.entries(dispatch.inputs)
              .map(([key, value]) => `${key}=${String(value)}`)
              .join(', ')}
            . {dispatch.then}
          </Text>
          <div style={{ marginTop: 8 }}>
            <ButtonLink
              href={dispatch.runsUrl}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="small"
            >
              Workflow runs ↗
            </ButtonLink>
          </div>
        </div>
      }
    />
  );
}

/** The opt-in line: who has opted in to what, or that the run only checks. */
function OptIn({ alignment }: { alignment: Alignment }) {
  const team = alignment.team ?? 'The owning team';
  return (
    <Text variant="body-medium" data-testid="opt-in">
      {alignment.optedIn
        ? `${team} has opted in: the changes below are applied.`
        : `${team} has not opted in: this run checks and changes nothing.`}
    </Text>
  );
}

/**
 * The changes the last check planned, per step, as the manager returns
 * them; the two empty cases named -- no check yet, or nothing to change.
 */
function PlannedChanges({ alignment }: { alignment: Alignment }) {
  const steps = alignment.planned?.filter(step => step.changes.length > 0);
  const checked = alignment.checkedAt
    ? ` Checked at ${alignment.checkedAt}.`
    : '';
  if (!steps) {
    return (
      <Text variant="body-small" color="secondary" data-testid="planned">
        No check yet: the run's own check plans the changes.
      </Text>
    );
  }
  if (steps.length === 0) {
    return (
      <Text variant="body-small" color="secondary" data-testid="planned">
        Nothing to change.{checked}
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="2" data-testid="planned">
      <Text variant="body-small" color="secondary">
        Planned changes.{checked}
      </Text>
      {steps.map(step => (
        <div key={step.step}>
          <Text variant="body-small" weight="bold">
            {step.step}
          </Text>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {step.changes.map(change => (
              <li key={change}>
                <Text variant="body-small">{change}</Text>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Flex>
  );
}

/**
 * An alignment as the manager rendered it: what the run changes, whether the
 * team has opted in, the changes the last check planned, and the dispatch --
 * planned in the dry run, done afterwards (the plan is then behind the run).
 */
function AlignmentView({ alignment }: { alignment: Alignment }) {
  return (
    <Flex direction="column" gap="3" data-testid="alignment">
      {!alignment.dispatched && (
        <div data-testid="alignment-warning">
          <Alert status="warning" title={alignment.warning} />
        </div>
      )}
      <OptIn alignment={alignment} />
      {!alignment.dispatched && <PlannedChanges alignment={alignment} />}
      <DispatchView dispatch={alignment} />
    </Flex>
  );
}

/**
 * Align now: the set-up workflow dispatched as the person, after the
 * manager's dry run said what it would change and whether the team has
 * opted in to having it changed (else the run only checks); then the run
 * followed to its report through the record.
 */
export function AlignDialog({
  record,
  isOpen,
  onClose,
  onDone,
}: RowDialogProps) {
  const api = useApi(repositoriesApiRef);
  const [team, setTeam] = useState('');
  const undeclared = record.declaration === null;
  const args = () => ({ team: team.trim() || undefined });
  return (
    <ActionDialog<Alignment, Alignment>
      title={`Align ${record.name} now`}
      intro={`Changes ${record.repository} on GitHub and CircleCI to its declared set-up and the company baseline — settings, permissions, branch protection, the CircleCI project — as you, by dispatching the set-up workflow. Nothing is written to the team files.`}
      isOpen={isOpen}
      onClose={onClose}
      ready={!undeclared || team.trim().length > 0}
      fields={
        undeclared ? (
          <TextField
            label="Team"
            description="This repository has no entry: it is aligned from the team alone."
            isRequired
            value={team}
            onChange={setTeam}
          />
        ) : (
          <Text variant="body-small" color="secondary">
            Declared by {record.declaration!.team}.
          </Text>
        )
      }
      dryRun={() =>
        api.alignRepository(record.repository, args(), { dryRun: true })
      }
      renderPlan={alignment => <AlignmentView alignment={alignment} />}
      commit={() =>
        api.alignRepository(record.repository, args(), { mode: 'commit' })
      }
      renderDone={alignment => (
        <Flex direction="column" gap="3">
          <AlignmentView alignment={alignment} />
          {alignment.dispatched && (
            <LiveAlignment repository={record.repository} />
          )}
        </Flex>
      )}
      commitLabel={alignment =>
        alignment?.optedIn === false ? 'Check now' : 'Align now'
      }
      onDone={onDone}
    />
  );
}
