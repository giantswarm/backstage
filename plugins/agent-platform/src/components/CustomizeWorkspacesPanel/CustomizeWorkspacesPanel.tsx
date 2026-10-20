import { useMemo, useState } from 'react';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  ButtonIcon,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Menu,
  MenuItem,
  MenuSection,
  MenuTrigger,
  Table,
  Text,
} from '@backstage/ui';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import EditIcon from '@material-ui/icons/Edit';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';
import SyncIcon from '@material-ui/icons/Sync';
import {
  CatalogNoMatch,
  EmptyStateCard,
  getRelativeDate,
  INITIAL_ROWS,
  LoadingIndicator,
  MENU_WIDTH,
  ShowMore,
  StatusDot,
  StatusHint,
  usePhoneColumns,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';

import { useWorkspaceActions } from '../../hooks/useWorkspaceActions';
import { workspaceEditRouteRef } from '../../routes';
import {
  sharedIdentityReason,
  sharedIdentityTitle,
} from '../../lib/sharedIdentity';
import {
  searchWorkspaces,
  sizeLabel,
  sourceLabel,
  sourcesLabel,
  storedLabel,
  syncState,
  type WorkspaceRow,
} from '../../lib/workspaceList';
import { CreateWorkspaceButton } from '../CreateWorkspaceButton';
import { SharedIdentityNote } from '../SharedIdentityNote';
import { WorkspaceDeleteDialog } from '../WorkspaceDeleteDialog';
import { useWorkspacesData } from '../WorkspacesDataProvider';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/** What a muster without per-user sign-in withholds, and what goes through the manager. */
const WORKSPACES_BLOCKED = 'Workspaces cannot be used';
const WORKSPACES_VIA = 'Workspaces are managed through workspace-manager';

/**
 * Why Open is not offered yet: the workspace's page is built next, at
 * `/customize/workspaces/<installation>/<organization>/<name>`.
 */
const NOT_BUILT_YET = 'Coming with the workspace page';

export type CustomizeWorkspacesPanelProps = {
  search: string;
};

/**
 * What the volume stores, from the list. A manager whose list does not carry
 * it yet, and a workspace before its first sync, show none.
 */
function StoredCell({ row }: { row: WorkspaceRow }) {
  return (
    <CellText
      title={
        row.storedBytes === undefined
          ? '—'
          : storedLabel(row.storedBytes, row.volumeSize, row.grewFrom)
      }
      description={
        row.grewFrom
          ? `Grown from ${sizeLabel(row.grewFrom)} at the last sync`
          : undefined
      }
    />
  );
}

/**
 * The sync's state now, or the last cycle's result: the dot and its label,
 * and behind the info hint when it happened and the manager's words.
 */
function LastSyncCell({ row }: { row: WorkspaceRow }) {
  const state = syncState(row);
  return (
    <Cell>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--bui-space-1)',
        }}
      >
        <StatusDot tone={state.tone} label={state.label} />
        <StatusHint
          subject={row.name}
          explanation={[
            ...(state.when
              ? [
                  `${state.when.verb} ${getRelativeDate(state.when.at, new Date())}.`,
                ]
              : []),
            ...(state.detail ? [state.detail] : []),
          ]}
        />
      </span>
    </Cell>
  );
}

/** Open, Edit, Sync now and Delete for one workspace. */
function RowActions({ row }: { row: WorkspaceRow }) {
  const toastApi = useApi(toastApiRef);
  const { sync, remove } = useWorkspaceActions(row.installation, row.name);
  const editRoute = useRouteRef(workspaceEditRouteRef);
  const editHref = editRoute?.({
    installation: row.installation,
    organization: row.organization,
    name: row.name,
  });
  const [isDeleteOpen, setDeleteOpen] = useState(false);

  const syncNow = () =>
    sync.mutate(undefined, {
      onSuccess: () =>
        toastApi.post({
          title: `Sync of ${row.name} requested`,
          status: 'success',
          timeout: TOAST_TIMEOUT_MS,
        }),
      onError: error =>
        toastApi.post({
          title: `${row.name} could not be synced`,
          description: error.message,
          status: 'danger',
        }),
    });

  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        setDeleteOpen(false);
        toastApi.post({
          title: `${row.name} is being deleted`,
          status: 'success',
          timeout: TOAST_TIMEOUT_MS,
        });
      },
    });

  return (
    <Cell>
      <MenuTrigger>
        <ButtonIcon
          icon={<MoreVertIcon />}
          aria-label={`Actions for ${row.name}`}
          variant="tertiary"
          size="small"
        />
        <Menu maxWidth={MENU_WIDTH}>
          <MenuSection title={NOT_BUILT_YET}>
            <MenuItem iconStart={<OpenInNewIcon />} isDisabled>
              Open
            </MenuItem>
          </MenuSection>
          <MenuItem
            iconStart={<EditIcon />}
            isDisabled={row.deleting || !editHref}
            href={editHref}
          >
            Edit
          </MenuItem>
          <MenuItem
            iconStart={<SyncIcon />}
            isDisabled={row.deleting || sync.isPending}
            onAction={syncNow}
          >
            Sync now
          </MenuItem>
          <MenuItem
            color="danger"
            iconStart={<DeleteOutlineIcon />}
            isDisabled={row.deleting}
            onAction={() => {
              remove.reset();
              setDeleteOpen(true);
            }}
          >
            Delete…
          </MenuItem>
        </Menu>
      </MenuTrigger>
      <WorkspaceDeleteDialog
        row={row}
        isOpen={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        isDeleting={remove.isPending}
        error={remove.error?.message}
        onConfirm={confirmDelete}
      />
    </Cell>
  );
}

/** The installations whose workspaces could not be read, and why. */
function ReadFailures({
  failures,
  isEverything,
  onRetry,
}: {
  failures: Record<string, string>;
  isEverything: boolean;
  onRetry: () => void;
}) {
  const entries = Object.entries(failures);
  if (entries.length === 0) {
    return null;
  }
  const names = entries.map(([installation]) => installation).join(', ');
  return (
    <Alert
      status={isEverything ? 'danger' : 'warning'}
      icon
      title={
        isEverything
          ? 'Your workspaces could not be read'
          : `Workspaces on ${names} could not be read; the list shows the rest`
      }
      description={
        <Flex direction="column" gap="1">
          {entries.map(([installation, message]) => (
            <Text key={installation} variant="body-medium">
              {installation}: {message}
            </Text>
          ))}
        </Flex>
      }
      customActions={
        <Button variant="secondary" size="small" onPress={onRetry}>
          Try again
        </Button>
      }
    />
  );
}

/**
 * The Workspaces tab's heading, above its search: whose workspaces these are
 * and what they are for. Nothing while there is no Organization. Must be
 * mounted inside a `WorkspacesDataProvider`.
 */
export function CustomizeWorkspacesIntro() {
  const { organization } = useWorkspacesData();
  if (!organization) {
    return null;
  }
  return (
    <Flex direction="column" gap="1">
      <Text variant="title-small" as="h2">
        Workspaces of {organization}
      </Text>
      <Text variant="body-medium" color="secondary">
        The repositories an agent works on. Everyone in {organization} can use
        and change them.
      </Text>
    </Flex>
  );
}

/**
 * The Workspaces tab of the shell's Customize screen: the workspaces of the
 * scope's Organization on the installations in scope — sources, repositories,
 * what the volume stores, the last sync and the Sessions on it — with Sync now
 * and Delete per row. Must be mounted inside the plugin's
 * `CustomizeDataProvider`.
 */
export function CustomizeWorkspacesPanel({
  search,
}: CustomizeWorkspacesPanelProps) {
  const {
    isAvailable,
    rows: allRows,
    organization,
    installations,
    sharedIdentity,
    isLoading,
    failures,
    retry,
  } = useWorkspacesData();
  const rows = useMemo(
    () => searchWorkspaces(allRows, search),
    [allRows, search],
  );
  const showInstallation =
    new Set(allRows.map(row => row.installation)).size > 1;
  const isPhone = usePhoneLayout();

  const columns: ColumnConfig<WorkspaceRow>[] = [
    {
      id: 'name',
      label: 'Workspace',
      isRowHeader: true,
      defaultWidth: '3fr',
      minWidth: 200,
      cell: row => (
        <CellText
          title={row.name}
          description={[
            ...(showInstallation ? [row.installation] : []),
            // At phone width the Sources column is hidden: they join the
            // name's line.
            ...(isPhone ? [sourcesLabel(row.sources)] : []),
          ].join(' · ')}
        />
      ),
    },
    {
      id: 'sources',
      label: 'Sources',
      defaultWidth: '2fr',
      // One line per source.
      cell: row => (
        <Cell>
          <Flex direction="column" gap="0">
            {row.sources.map((source, index) => (
              <Text key={index} variant="body-medium">
                {sourceLabel(source)}
              </Text>
            ))}
          </Flex>
        </Cell>
      ),
    },
    {
      id: 'repositories',
      label: 'Repos',
      defaultWidth: '1fr',
      cell: row => (
        <CellText title={row.lastSync ? String(row.repositories) : '—'} />
      ),
    },
    {
      id: 'stored',
      label: 'Stored',
      defaultWidth: '1fr',
      // Fits "1023.9 MiB of 100Gi ↑" without cutting it.
      minWidth: 168,
      cell: row => <StoredCell row={row} />,
    },
    {
      id: 'lastSync',
      label: 'Last sync',
      defaultWidth: '2fr',
      minWidth: 152,
      cell: row => <LastSyncCell row={row} />,
    },
    {
      id: 'sessions',
      label: 'Sessions',
      defaultWidth: '1fr',
      cell: row => <CellText title={String(row.sessions)} />,
    },
    {
      id: 'actions',
      label: '',
      width: 56,
      cell: row => <RowActions row={row} />,
    },
  ];
  const shownColumns = usePhoneColumns(columns, [
    'name',
    'lastSync',
    'actions',
  ]);

  const isReading = isLoading && allRows.length === 0;
  const failed = Object.keys(failures).length > 0;
  const isEverythingFailed =
    failed && !isLoading && installations.every(name => name in failures);

  let body;
  if (isEverythingFailed) {
    // The alert above says why, with a way to try again.
    body = null;
  } else if (isAvailable === false && sharedIdentity.length > 0) {
    body = (
      <EmptyStateCard
        title={sharedIdentityTitle(WORKSPACES_BLOCKED, sharedIdentity)}
        description={sharedIdentityReason(WORKSPACES_VIA, sharedIdentity)}
      />
    );
  } else if (isAvailable === false) {
    body = (
      <EmptyStateCard
        title="Workspaces are not available here"
        description="No environment in scope runs the workspace-manager. Pick another environment, or ask your platform team to turn workspaces on."
      />
    );
  } else if (isReading || isAvailable === undefined) {
    body = <LoadingIndicator label="Reading your workspaces…" />;
  } else if (!organization) {
    body = failed ? null : (
      <EmptyStateCard
        title="No Organization to show workspaces of"
        description="Workspaces belong to an Organization, and you are a member of none here. An admin of your Organization can add you."
      />
    );
  } else if (allRows.length === 0) {
    body = (
      <EmptyStateCard
        title={`No workspaces in ${organization} yet`}
        description="A workspace holds the repositories a Session works on, synced for every member of the Organization."
        actions={<CreateWorkspaceButton />}
      />
    );
  } else if (rows.length === 0) {
    body = <CatalogNoMatch plural="workspaces" search={search} />;
  } else {
    body = (
      <ShowMore
        key={search.trim()}
        items={rows}
        initial={INITIAL_ROWS}
        noun="workspace"
      >
        {page => (
          <Flex direction="column" gap="2">
            <Table<WorkspaceRow>
              columnConfig={shownColumns}
              data={page}
              pagination={{ type: 'none' }}
            />
            <Text variant="body-small" color="secondary">
              A failed sync shows its reason in Last sync.
            </Text>
          </Flex>
        )}
      </ShowMore>
    );
  }

  return (
    <Flex direction="column" gap="5">
      <ReadFailures
        failures={failures}
        isEverything={isEverythingFailed}
        onRetry={retry}
      />
      {isAvailable && (
        <SharedIdentityNote
          installations={sharedIdentity}
          blocked={WORKSPACES_BLOCKED}
          via={WORKSPACES_VIA}
        />
      )}
      {body}
    </Flex>
  );
}
