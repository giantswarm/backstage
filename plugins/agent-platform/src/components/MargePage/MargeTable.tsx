import { useMemo } from 'react';
import {
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Link,
  Menu,
  MenuItem,
  MenuTrigger,
  ButtonIcon,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import { statusIntentOf, type BotPrRow } from '../../lib/marge';

export type BotPrAction = 'merge' | 'refresh' | 'remedy' | 'mark-blocked';

export type MargeGrouping = 'repository' | 'dependency';

export type MargeTableProps = {
  rows: BotPrRow[];
  groupBy: MargeGrouping;
  /** Whether the actions menu is offered: the person's session reaches marge. */
  canAct: boolean;
  onAction: (action: BotPrAction, row: BotPrRow) => void;
};

/**
 * The PR's age in whole days, from `created_at`. The engine's `age_days` is
 * left out of the JSON when it is zero, so a PR opened today would read as
 * unknown if the field alone decided; the timestamp is always there.
 */
export function ageOf(
  row: Pick<BotPrRow, 'created_at' | 'age_days'>,
  now = Date.now(),
): string {
  let days = row.age_days;
  if (row.created_at) {
    const created = Date.parse(row.created_at);
    if (!Number.isNaN(created)) {
      days = Math.max(0, Math.floor((now - created) / 86_400_000));
    }
  }
  if (days === undefined) {
    return '—';
  }
  return days === 0 ? 'today' : `${days} d`;
}

/**
 * The rescue column: the most recent prior rescue attempt the engine found
 * on the PR, or a dash. A stale attempt no longer describes the code; a
 * rebased one still does.
 */
function rescueOf(row: BotPrRow): { title: string; description?: string } {
  const rescue = row.rescue;
  if (!rescue) {
    return { title: '—' };
  }
  const who = rescue.tool ? ` by ${rescue.tool}` : '';
  const when = rescue.at ? ` on ${rescue.at.slice(0, 10)}` : '';
  let state = 'still stands';
  if (rescue.stale) {
    state = 'stale, the PR changed since';
  } else if (rescue.rebased) {
    state = 'still stands, rebased since';
  }
  return {
    title: `${rescue.outcome}${who}${when}`,
    description: rescue.reason ? `${state}: ${rescue.reason}` : state,
  };
}

function getColumnConfig(
  canAct: boolean,
  onAction: MargeTableProps['onAction'],
): ColumnConfig<BotPrRow>[] {
  return [
    {
      id: 'pr',
      label: 'Pull request',
      isRowHeader: true,
      cell: row => (
        <Cell>
          <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
            <Link
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              title={row.title}
            >
              {row.title}
            </Link>
            <Text variant="body-small" color="secondary">
              {row.ref}
            </Text>
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'kind',
      label: 'Kind',
      width: '8%',
      cell: row => <CellText title={row.kind ?? '—'} />,
    },
    {
      id: 'update',
      label: 'Update',
      width: '8%',
      cell: row => <CellText title={row.update_type ?? '—'} />,
    },
    {
      id: 'age',
      label: 'Age',
      width: '6%',
      cell: row => (
        <Cell>
          <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
            {ageOf(row)}
          </Text>
        </Cell>
      ),
    },
    {
      id: 'classification',
      label: 'Classification',
      width: '14%',
      cell: row => (
        <Cell>
          <StatusLabel
            label={row.status}
            intent={statusIntentOf(row.group)}
            title={row.label ? `label ${row.label}` : undefined}
          />
        </Cell>
      ),
    },
    {
      id: 'evidence',
      label: 'Last evidence',
      cell: row => <CellText title={row.detail ?? '—'} />,
    },
    {
      id: 'rescue',
      label: 'Rescue',
      width: '12%',
      cell: row => {
        const rescue = rescueOf(row);
        return (
          <CellText title={rescue.title} description={rescue.description} />
        );
      },
    },
    {
      id: 'actions',
      label: '',
      width: '4%',
      cell: row => (
        <Cell>
          {canAct ? (
            <MenuTrigger>
              <ButtonIcon
                icon={<MoreVertIcon />}
                aria-label={`Actions for ${row.ref}`}
                variant="tertiary"
                size="small"
              />
              <Menu>
                <MenuItem onAction={() => onAction('merge', row)}>
                  Merge…
                </MenuItem>
                <MenuItem onAction={() => onAction('refresh', row)}>
                  Refresh branch…
                </MenuItem>
                <MenuItem onAction={() => onAction('remedy', row)}>
                  Remedy…
                </MenuItem>
                <MenuItem onAction={() => onAction('mark-blocked', row)}>
                  Mark blocked…
                </MenuItem>
              </Menu>
            </MenuTrigger>
          ) : null}
        </Cell>
      ),
    },
  ];
}

function GroupTable({
  rows,
  columnConfig,
}: {
  rows: BotPrRow[];
  columnConfig: ColumnConfig<BotPrRow>[];
}) {
  const { tableProps } = useTable<BotPrRow>({
    mode: 'complete',
    data: rows,
    paginationOptions: { type: 'none' },
  });
  return <Table<BotPrRow> {...tableProps} columnConfig={columnConfig} />;
}

/**
 * The team's queue, one table per group: the repository the PRs belong to,
 * or the dependency they update. Every row is what the engine reported for
 * that PR and nothing more; a PR no sweep has labelled reads `Unclassified`
 * rather than a guess, and the per-PR actions are the engine's own steps
 * behind a preview.
 */
export function MargeTable({
  rows,
  groupBy,
  canAct,
  onAction,
}: MargeTableProps) {
  const columnConfig = useMemo(
    () => getColumnConfig(canAct, onAction),
    [canAct, onAction],
  );

  const groups = useMemo(() => {
    const byKey = new Map<string, BotPrRow[]>();
    for (const row of rows) {
      const key = groupBy === 'repository' ? row.repository : row.dependency;
      const list = byKey.get(key) ?? [];
      list.push(row);
      byKey.set(key, list);
    }
    return Array.from(byKey.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, groupBy]);

  if (rows.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        No open bot PR in this team's repositories.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="6">
      {groups.map(([key, groupRows]) => (
        <section key={key} aria-label={key}>
          <Flex direction="column" gap="2">
            <Flex gap="2" align="baseline">
              <Text as="h3" variant="title-x-small">
                {key}
              </Text>
              <Text variant="body-small" color="secondary">
                {groupRows.length} PR{groupRows.length === 1 ? '' : 's'}
              </Text>
            </Flex>
            <GroupTable rows={groupRows} columnConfig={columnConfig} />
          </Flex>
        </section>
      ))}
    </Flex>
  );
}
