import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Cell,
  CellText,
  ColumnConfig,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  DateComponent,
  stopRowPress,
  UserEntityLink,
} from '@giantswarm/backstage-plugin-ui-react';
import { pullRouteRef } from '../../routes';
import { EpicChip } from '../EpicChip';
import { PlanPullRow, sortPullsBy } from './helpers';
import {
  AuthorProfile,
  useAuthorProfiles,
  userEntityRef,
} from './useAuthorProfiles';

/** Dash shown where a pull request carries no value at all. */
function Unknown() {
  return (
    <Text variant="body-medium" color="secondary">
      —
    </Text>
  );
}

function getColumnConfig(
  hrefFor: (row: PlanPullRow) => string | undefined,
  profiles: Map<string, AuthorProfile>,
): ColumnConfig<PlanPullRow>[] {
  return [
    {
      id: 'number',
      label: 'PR',
      isSortable: true,
      width: '8%',
      cell: row => <CellText title={`#${row.number}`} />,
    },
    {
      // The author is a GitHub login, and the catalog's User entities are named
      // by that same login -- so the login resolves to the person.
      // `EntityRefLink` shows their display name and profile photo and links to
      // their entity page; a login with no catalog entity (an outside
      // contributor, a bot) degrades to the login itself.
      id: 'author',
      label: 'Author',
      isSortable: true,
      // Wide enough for a full display name on one line; several people here
      // have three or four names.
      width: '18%',
      cell: row => {
        if (!row.author) {
          return (
            <Cell>
              <Unknown />
            </Cell>
          );
        }
        const profile = profiles.get(row.author.toLowerCase());
        return (
          <Cell>
            <UserEntityLink
              entityRef={userEntityRef(row.author)}
              displayName={profile?.displayName}
              picture={profile?.picture}
              inRow
            />
          </Cell>
        );
      },
    },
    {
      // Every row here is an open pull request, so only the draft is worth
      // marking; a second badge saying "open" on all the others would be noise.
      id: 'draft',
      label: 'Status',
      isSortable: true,
      width: '10%',
      cell: row => (
        <Cell>{row.draft ? <Badge size="small">Draft</Badge> : null}</Cell>
      ),
    },
    {
      id: 'updatedAt',
      label: 'Last updated',
      isSortable: true,
      width: '14%',
      cell: row => (
        <Cell>
          {row.updatedAt ? (
            <DateComponent value={row.updatedAt} relative />
          ) : (
            <Unknown />
          )}
        </Cell>
      ),
    },
    {
      // The row header, and the widest column: it takes whatever the fixed-width
      // columns leave.
      id: 'title',
      label: 'Title',
      isRowHeader: true,
      isSortable: true,
      cell: row => {
        const href = hrefFor(row);
        // A real anchor as well as the whole-row click below. The anchor is what
        // makes cmd/middle-click open a new tab and what gives keyboard users
        // something focusable; the row click is the convenience affordance. The
        // two must not both fire for one click — see {@link stopRowPress}.
        return (
          <Cell>
            {href ? (
              <Link
                to={href}
                title={row.title}
                noWrap
                display="block"
                onPointerDown={stopRowPress}
                onPointerUp={stopRowPress}
                onClick={stopRowPress}
              >
                {row.title}
              </Link>
            ) : (
              <Text variant="body-medium" truncate style={{ minWidth: 0 }}>
                {row.title}
              </Text>
            )}
          </Cell>
        );
      },
    },
    {
      // Just the issue number: the column heading already says "Epic".
      id: 'epic',
      label: 'Epic',
      width: '12%',
      cell: row => (
        <Cell>
          {row.epic ? <EpicChip epic={row.epic} variant="link" /> : null}
        </Cell>
      ),
    },
  ];
}

export type ProposedPlansTableProps = {
  rows: PlanPullRow[];
  /** Carried in the link as `?repo=`, so the review page opens against the same repository. */
  repo: string;
  /** True only while the pull requests are still loading, so the skeleton replaces the rows. */
  isLoading?: boolean;
};

/**
 * Open pull requests against the plan repository — plans proposed for team
 * review — one column per fact. Selecting a row opens the plan's review page
 * (`/plans/pr/:number?repo=...`), which is where documents are read and
 * commented on.
 */
export function ProposedPlansTable({
  rows,
  repo,
  isLoading,
}: ProposedPlansTableProps) {
  const navigate = useNavigate();
  const pullLink = useRouteRef(pullRouteRef);

  // Undefined when the route isn't bound, in which case titles render as plain
  // text rather than as links that go nowhere.
  const hrefFor = useCallback(
    (row: PlanPullRow) => {
      const path = pullLink?.({ number: String(row.number) });
      return path ? `${path}?repo=${encodeURIComponent(repo)}` : undefined;
    },
    [pullLink, repo],
  );

  // One batched catalog request for the distinct authors, not one per row.
  const profiles = useAuthorProfiles(rows.map(row => row.author));

  const columnConfig = useMemo(
    () => getColumnConfig(hrefFor, profiles),
    [hrefFor, profiles],
  );

  const { tableProps } = useTable<PlanPullRow>({
    mode: 'complete',
    // `undefined` rather than `[]` while loading: an empty array renders the
    // empty state, so the skeleton would never show and "No proposed plans"
    // would flash before the first rows arrive.
    data: isLoading ? undefined : rows,
    sortFn: sortPullsBy,
    initialSort: { column: 'updatedAt', direction: 'descending' },
    // `useCompletePagination` resets its offset on a page-size or query change
    // but never when the data shrinks, so a refetched shorter list can end up
    // sliced to nothing and falsely report itself empty.
    paginationOptions: { type: 'none' },
  });

  return (
    <Table<PlanPullRow>
      {...tableProps}
      isPending={isLoading}
      columnConfig={columnConfig}
      rowConfig={{
        // Whole-row click as a convenience, on top of the anchor in the title
        // cell.
        onClick: row => {
          const href = hrefFor(row);
          if (href) {
            navigate(href);
          }
        },
      }}
      emptyState={
        <Text variant="body-medium" color="secondary">
          No proposed plans.
        </Text>
      }
    />
  );
}
