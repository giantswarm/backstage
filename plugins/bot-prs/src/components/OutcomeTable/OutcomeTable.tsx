import { Fragment, useMemo } from 'react';
import {
  Alert,
  Cell,
  CellText,
  Flex,
  Link,
  Table,
  Text,
  VisuallyHidden,
  type ColumnConfig,
} from '@backstage/ui';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import {
  GREEN_GROUP,
  rowsOf,
  statusIntentOf,
  withoutCommitType,
  type BotPrRow,
  type MargeResult,
} from '../../lib/marge';
import { nameOf } from '../../lib/rows';

/**
 * A dry run leaves a PR in its class and says what the run would do in the
 * evidence line, after a `dry-run:` prefix. That line is the outcome a
 * preview is for, so it leads the row; the class the engine filed the PR
 * under follows it. Without the prefix the line is the classification's own
 * evidence, a refusal included.
 */
export function splitDryRun(detail: string | undefined): {
  would?: string;
  evidence?: string;
} {
  if (!detail) {
    return {};
  }
  const parts = detail.split(/;\s*dry-run:\s*|^dry-run:\s*/).filter(Boolean);
  if (parts.length === 1 && !/^dry-run:/.test(detail)) {
    return { evidence: detail };
  }
  if (/^dry-run:/.test(detail)) {
    return { would: parts[0] };
  }
  return { evidence: parts[0], would: parts.slice(1).join('; ') };
}

const capitalized = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** `would approve, merge (squash)` as a sentence: `Would approve, merge (squash)`. */
function sentence(would: string): string {
  return capitalized(
    would.replace(/^rule (\S+) would apply (\S+)$/, 'rule $1 applies $2'),
  );
}

/** One team's run: its result, or none when the engine refused the call. */
export type OutcomeRun = {
  team: string;
  result?: MargeResult;
};

export type OutcomeTableProps = {
  runs: OutcomeRun[];
  /** The run is in flight: skeleton rows stand where the PRs will be. */
  isPending?: boolean;
  /** More than one team is in the run, so every row names its team. */
  showTeam?: boolean;
  /** Read out while the run is in flight, e.g. `Checking 8 PRs…`. */
  pendingLabel?: string;
};

/**
 * What the engine reported for one PR, as the Result cell shows it. A green
 * PR's preview line says what its class means -- the step the run takes -- so
 * that line is the label and the class is left out: on a list of green PRs
 * the class would say the same word on every row. Any other PR leads with its
 * class, the thing that differs, and the engine's reason follows.
 */
function Result({ row }: { row: BotPrRow }) {
  const { would, evidence } = splitDryRun(row.detail);
  const step = would && row.group === GREEN_GROUP ? sentence(would) : undefined;
  const lines = [step ? undefined : would, evidence]
    .filter((line): line is string => Boolean(line))
    .map(sentence);

  return (
    <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
      <StatusLabel
        label={step ?? row.status}
        intent={statusIntentOf(row.group)}
        title={row.label}
      />
      {lines.map(line => (
        <Text key={line} variant="body-small" color="secondary">
          {line}
        </Text>
      ))}
    </Flex>
  );
}

/**
 * The widths share the dialog out; the minimums keep each column readable
 * where the dialog is narrower than the four of them, and the table scrolls
 * sideways instead of breaking every word onto a line of its own.
 */
function columnsOf(showTeam: boolean): ColumnConfig<BotPrRow>[] {
  return [
    {
      id: 'team',
      label: 'Team',
      width: '12%',
      minWidth: 112,
      isHidden: !showTeam,
      cell: row => <CellText title={row.team} />,
    },
    {
      // Wraps like the title: a long repository name is as much of the row's
      // identity as its first half.
      id: 'repository',
      label: 'Repository',
      width: '18%',
      minWidth: 120,
      cell: row => (
        <Cell>
          <Text
            variant="body-medium"
            title={row.repository}
            style={{ overflowWrap: 'anywhere' }}
          >
            {nameOf(row)}
          </Text>
        </Cell>
      ),
    },
    {
      // The page's own column: the number is the link, the title says what
      // the PR updates. The commit type every bot PR shares is left out, and
      // the title wraps rather than cuts off: it is what tells the rows apart.
      id: 'title',
      label: 'Pull request',
      isRowHeader: true,
      minWidth: 200,
      cell: row => (
        <Cell>
          <Text
            variant="body-medium"
            title={row.title}
            style={{ overflowWrap: 'anywhere' }}
          >
            <Link href={row.url} target="_blank" rel="noopener noreferrer">
              #{row.number}
            </Link>{' '}
            {capitalized(withoutCommitType(row.title))}
          </Text>
        </Cell>
      ),
    },
    {
      id: 'result',
      label: 'Result',
      width: '33%',
      minWidth: 200,
      cell: row => (
        <Cell>
          <Result row={row} />
        </Cell>
      ),
    },
  ];
}

const repositories = (count: number) =>
  count === 1 ? '1 repository' : `${count} repositories`;

/**
 * What the engine reported for each PR of a run, one row per PR and one
 * column per fact, in the page's own columns. A refusal is one of these rows
 * -- `Held` or `Failed` with the guard's reason -- and nothing here offers a
 * way around it, because the engine has none.
 *
 * The engine answers in its own class order, which reads as no order at all
 * past a screen, so the rows are ordered by team, repository and PR number.
 *
 * What a run could not decide at all -- a repository it could not read, a
 * failure no catalogue rule matches, a catalogue it could not load -- is not
 * a PR, so it follows the table as an alert per team.
 */
export function OutcomeTable({
  runs,
  isPending = false,
  showTeam = false,
  pendingLabel,
}: OutcomeTableProps) {
  const rows = useMemo(
    () =>
      runs
        .flatMap(run => rowsOf(run.result, run.team))
        .sort(
          (a, b) =>
            a.team.localeCompare(b.team, 'en') ||
            a.repository.localeCompare(b.repository, 'en') ||
            a.number - b.number,
        ),
    [runs],
  );
  const columnConfig = useMemo(() => columnsOf(showTeam), [showTeam]);
  const of = (team: string) => (showTeam ? ` of ${team}` : '');

  return (
    <Flex direction="column" gap="3">
      <VisuallyHidden role="status">
        {isPending ? pendingLabel : ''}
      </VisuallyHidden>
      <Table<BotPrRow>
        columnConfig={columnConfig}
        // `undefined` while pending: an empty array renders the empty state.
        data={isPending ? undefined : rows}
        isPending={isPending}
        pagination={{ type: 'none' }}
        emptyState={
          <Text variant="body-medium" color="secondary">
            marge reported no PR for this run.
          </Text>
        }
      />
      {isPending
        ? null
        : runs.map(({ team, result }) => {
            const failed = result?.repositories_failed ?? [];
            const unhandled = result?.unhandled ?? [];
            if (
              failed.length === 0 &&
              unhandled.length === 0 &&
              !result?.rules?.error
            ) {
              return null;
            }
            return (
              <Fragment key={team}>
                {failed.length > 0 ? (
                  <Alert
                    status="warning"
                    icon
                    title={`marge could not read ${repositories(
                      failed.length,
                    )}${of(team)}`}
                    description={
                      <Flex direction="column" gap="1">
                        <Text variant="body-small">
                          {failed.length === 1
                            ? 'Its PRs are'
                            : 'Their PRs are'}{' '}
                          not in the list.
                        </Text>
                        {failed.map(failure => (
                          <Text
                            key={failure.repo}
                            variant="body-small"
                            color="secondary"
                          >
                            {failure.repo}: {failure.error}
                          </Text>
                        ))}
                      </Flex>
                    }
                  />
                ) : null}
                {unhandled.length > 0 ? (
                  <Alert
                    status="warning"
                    icon
                    title={`No catalogue rule matches ${
                      unhandled.length === 1
                        ? '1 failure'
                        : `${unhandled.length} failures`
                    }${of(team)}`}
                    description={
                      <Flex direction="column" gap="1">
                        <Text variant="body-small">
                          Nothing is written for them. Each signature is what
                          `marge rules draft` takes.
                        </Text>
                        {unhandled.map(failure => (
                          <Text
                            key={failure.signature}
                            variant="body-small"
                            color="secondary"
                          >
                            {failure.prs.join(', ')}:{' '}
                            {failure.checks.join(', ')} ({failure.signature})
                          </Text>
                        ))}
                      </Flex>
                    }
                  />
                ) : null}
                {result?.rules?.error ? (
                  <Alert
                    status="danger"
                    icon
                    title={`The rule catalogue${of(team)} could not be read`}
                    description={`Every remedy is refused until it can: ${result.rules.error}`}
                  />
                ) : null}
              </Fragment>
            );
          })}
    </Flex>
  );
}
