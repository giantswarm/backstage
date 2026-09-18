import { ReactNode, useMemo, useState } from 'react';
import { Alert, ButtonLink, Flex, Link, Text, TextField } from '@backstage/ui';
import { useApi } from '@backstage/frontend-plugin-api';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
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

/**
 * The intranet page on repository set-up: what alignment changes, the
 * opt-in, the checks and the nightly. The dialogs say the one thing the
 * click does and link here for the rest.
 */
export const REPOSITORY_SETUP_DOCS_URL =
  'https://intranet.giantswarm.io/docs/dev-and-releng/repository-setup/';

function DocsLink() {
  return (
    <Link
      href={REPOSITORY_SETUP_DOCS_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      How alignment works ↗
    </Link>
  );
}

/** The set-up workflow dispatched as the person, with the runs to follow it by. */
function Dispatched({ dispatch }: { dispatch: Dispatch }) {
  return (
    <Alert
      status="success"
      title={`Dispatched ${dispatch.workflow} as ${dispatch.as}`}
      description={
        <Flex direction="column" gap="2" data-testid="dispatch">
          <Text variant="body-small">{dispatch.then}</Text>
          <div>
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
        </Flex>
      }
    />
  );
}

/**
 * What the commit does, per the manager's mode, in one sentence: opted in,
 * the repository is aligned; declared but not opted in, the pull request
 * that opts it in, whose merge aligns it; otherwise a check. The rest is
 * the intranet page's.
 */
const LEAD: Record<
  Alignment['mode'],
  (repository: string, team: string) => ReactNode
> = {
  align: repository => (
    <>
      Applies the declared set-up and the company baseline to {repository} on
      GitHub and CircleCI, as you.
    </>
  ),
  'opt-in': (repository, team) => (
    <>
      {repository} has not opted in to alignment. <em>Opt in and align</em>{' '}
      opens a pull request as you that sets <code>align: true</code> in its
      entry; a member of {team} approves it and the reconciler applies the
      changes below when it merges.
    </>
  ),
  check: repository => (
    <>
      {repository} is not opted in to alignment: this run checks it against the
      baseline and changes nothing.
    </>
  ),
};

/**
 * The changes the last check planned, per step, as the manager returns
 * them, and when it checked; the two empty cases named -- no check yet, or
 * nothing to change.
 */
function PlannedChanges({ alignment }: { alignment: Alignment }) {
  const steps = alignment.planned?.filter(step => step.changes.length > 0);
  const checked = alignment.checkedAt ? (
    <>
      {' '}
      · checked <DateComponent value={alignment.checkedAt} relative />
    </>
  ) : null;
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
        Nothing to change{checked}.
      </Text>
    );
  }
  return (
    <Flex direction="column" gap="2" data-testid="planned">
      <Text variant="body-small" color="secondary">
        Planned changes{checked}
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
 * The dry run of an Align now on a declared repository: what the commit
 * does, the link to the rest, the changes the last check planned.
 */
function AlignmentPlan({
  repository,
  team,
  alignment,
}: {
  repository: string;
  team: string;
  alignment: Alignment;
}) {
  return (
    <Flex direction="column" gap="3" data-testid="alignment">
      <Text variant="body-medium" data-testid="lead">
        {LEAD[alignment.mode](repository, alignment.team ?? team)} <DocsLink />
      </Text>
      <PlannedChanges alignment={alignment} />
    </Flex>
  );
}

/**
 * An Align now committed: the opt-in pull request opened with its ask
 * delivered (`opt-in`), or the dispatch followed through the record to the
 * run's report (`align`, `check`).
 */
function AlignmentDone({
  repository,
  alignment,
}: {
  repository: string;
  alignment: Alignment;
}) {
  if (alignment.mode === 'opt-in') {
    return (
      <Flex direction="column" gap="3" data-testid="alignment">
        <PullRequestOpened
          result={alignment.optIn?.committed ?? { pullRequest: null }}
        />
        <Text variant="body-small" color="secondary" data-testid="then">
          When it merges, the reconciler aligns {repository}; the row shows the
          run until it reports.
        </Text>
      </Flex>
    );
  }
  return (
    <Flex direction="column" gap="3" data-testid="alignment">
      <Dispatched dispatch={alignment} />
      {alignment.dispatched && <LiveAlignment repository={repository} />}
    </Flex>
  );
}

const COMMIT_LABEL: Record<Alignment['mode'], string> = {
  align: 'Align now',
  'opt-in': 'Opt in and align',
  check: 'Check now',
};

/**
 * Align now: one dialog. A declared repository has nothing to fill in, so
 * the manager's dry run starts as the dialog opens and the dialog says in a
 * sentence what the commit does -- opted in, the set-up workflow is
 * dispatched; not opted in, the commit opens the pull request that opts it
 * in and the reconciler aligns it when that merges -- then the changes the
 * last check planned; the button follows the mode. An undeclared repository
 * needs the team and gets a check that changes nothing. A dispatched run is
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
  const args = () => ({ team: team.trim() || undefined });
  const commit = () =>
    api.alignRepository(record.repository, args(), { mode: 'commit' });
  const renderDone = (alignment: Alignment) => (
    <AlignmentDone repository={record.repository} alignment={alignment} />
  );
  const title = `Align ${record.name} now`;

  if (!isDeclared(record)) {
    return (
      <ActionDialog<Alignment, Alignment>
        title={title}
        intro={
          <>
            {record.repository} has no entry in a team file, so it cannot be
            aligned yet: the run checks it against the baseline for the team
            named below and changes nothing. <DocsLink />
          </>
        }
        isOpen={isOpen}
        onClose={onClose}
        ready={team.trim().length > 0}
        fields={
          <TextField
            label="Team"
            description="The team's GitHub slug: team-planeteers, …"
            isRequired
            value={team}
            onChange={setTeam}
          />
        }
        commit={commit}
        renderDone={renderDone}
        commitLabel={COMMIT_LABEL.check}
        onDone={onDone}
      />
    );
  }
  return (
    <ActionDialog<Alignment, Alignment>
      title={title}
      isOpen={isOpen}
      onClose={onClose}
      ready
      dryRun={() =>
        api.alignRepository(record.repository, args(), { dryRun: true })
      }
      renderPlan={alignment => (
        <AlignmentPlan
          repository={record.repository}
          team={record.declaration.team}
          alignment={alignment}
        />
      )}
      commit={commit}
      renderDone={renderDone}
      commitLabel={alignment => COMMIT_LABEL[alignment?.mode ?? 'align']}
      onDone={onDone}
    />
  );
}
