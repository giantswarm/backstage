import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  toastApiRef,
  useApi,
  useRouteRef,
} from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Cell,
  CellText,
  ColumnConfig,
  Flex,
  Link,
  SearchField,
  Table,
  Text,
} from '@backstage/ui';
import {
  type BreadcrumbItem,
  CatalogFilterBar,
  CatalogNoMatch,
  type CatalogFacet,
  DateComponent,
  EmptyStateCard,
  type Fact,
  FactList,
  formatLocalDateFull,
  INITIAL_ROWS,
  MoreActionsMenu,
  PageSection,
  SEARCH_MIN,
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageFactsSkeleton,
  ShellPageTitleSkeleton,
  ShowMore,
  StatusDot,
  useCatalogFilters,
  usePhoneColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import { useServerSignIn } from '@giantswarm/backstage-plugin-muster';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useKagentCapabilitiesMap } from '../../hooks/useKagentCapabilities';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import {
  useWorkspaceActions,
  useWorkspaceDetail,
  useWorkspaceLastPushes,
} from '../../hooks/useWorkspaceActions';
import { useWorkspaceManagerAvailability } from '../../hooks/useWorkspaceManager';
import { formatBytes } from '../../lib/formatNumbers';
import {
  sharedIdentityReason,
  sharedIdentityTitle,
} from '../../lib/sharedIdentity';
import { shortCommit } from '../../lib/skills';
import {
  isSyncing,
  lastSyncResult,
  pushedSinceSync,
  requestedSyncEnded,
  searchDirectories,
  searchMirrors,
  sortedDirectories,
  sortedMirrors,
  syncTriggerLabel,
} from '../../lib/workspaceDetail';
import {
  sizeLabel,
  sourcesLabel,
  syncState,
  workspaceRowId,
  WORKSPACES_BLOCKED,
  WORKSPACES_VIA,
  type WorkspaceRow,
} from '../../lib/workspaceList';
import {
  classifyWorkspaceManagerError,
  WORKSPACE_MANAGER_SERVER,
  type SessionDirectory,
  type WorkspaceDetail,
  type WorkspaceMirror,
} from '../../lib/workspaceManager';
import {
  sessionDetailRouteRef,
  workspaceDetailRouteRef,
  workspaceEditRouteRef,
} from '../../routes';
import { WorkspaceDeleteDialog } from '../WorkspaceDeleteDialog';
import { WorkspaceManagerSignIn } from '../WorkspaceManagerSignIn';
import { useWorkspacesTabHref } from '../WorkspaceEditorPage';

/** Long enough to read two lines, short enough not to follow you to the next page. */
const TOAST_TIMEOUT_MS = 6000;

/** A row of the tables: the manager's entry with the id bui's `Table` keys it by. */
type MirrorRow = WorkspaceMirror & { id: string };
type DirectoryRow = SessionDirectory & { id: string };

/** A time as "3 hours ago", kept current, the full date behind it. */
function When({ at }: { at: string }) {
  return <DateComponent value={at} relative />;
}

/** The Organization a membership refusal names, as the manager words it. */
function refusedOrganization(message: string): string | undefined {
  return message.match(/\bOrganization ([\w.-]+)/)?.[1];
}

export type WorkspaceDetailPageProps = {
  installation: string;
  organization: string;
  name: string;
};

/**
 * One workspace of an Organization, read as the person (`get_workspace`):
 * its sources, the last sync with its result and what started it, what the
 * volume stores, the repositories of the last sync's manifest, and the
 * Sessions with a directory on the volume with their cleanup dates. Sync now
 * (`sync_workspace`) shows the sync running and refreshes the page when it
 * ends; Edit and Delete sit beside it. A person outside the Organization gets
 * a "not a member" page, not the workspace.
 */
export function WorkspaceDetailPage(props: WorkspaceDetailPageProps) {
  return useMusterPluginApi() ? (
    <SignedInWorkspaceDetail {...props} />
  ) : (
    <UnavailableWorkspace {...props} />
  );
}

/**
 * The frame of every state of the page: the breadcrumbs back to the
 * Workspaces tab of the workspace's Organization.
 */
function useWorkspaceFrame(name: string, organization: string) {
  const { customize, workspaces } = useCustomizePaths();
  const tabHref = useWorkspacesTabHref(organization);
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Customize', href: customize },
    { label: 'Workspaces', href: workspaces ? tabHref : undefined },
    { label: name },
  ];
  return {
    tabHref,
    frame: { breadcrumbs, documentTitle: [name, 'Workspaces'] },
  };
}

/**
 * Where workspaces cannot be read from this portal: no muster plugin, no
 * workspace-manager in the installation's muster, or a muster acting under
 * its shared identity — the list's and the editor's words.
 */
function UnavailableWorkspace({
  installation,
  organization,
  name,
  sharedIdentity = false,
}: WorkspaceDetailPageProps & { sharedIdentity?: boolean }) {
  const { tabHref, frame } = useWorkspaceFrame(name, organization);
  return (
    <ShellPage title={name} {...frame}>
      <EmptyStateCard
        title={
          sharedIdentity
            ? sharedIdentityTitle(WORKSPACES_BLOCKED, [installation])
            : 'Workspaces are not available here'
        }
        description={
          sharedIdentity
            ? sharedIdentityReason(WORKSPACES_VIA, [installation])
            : `${installation} does not run the workspace-manager for this portal.`
        }
        actions={<Link href={tabHref}>Back to workspaces</Link>}
      />
    </ShellPage>
  );
}

/** The page, with whether muster waits for the person's sign-in to it. */
function SignedInWorkspaceDetail(props: WorkspaceDetailPageProps) {
  const signIn = useServerSignIn(WORKSPACE_MANAGER_SERVER, props.installation, {
    noun: 'connector',
  });
  return (
    <WorkspaceDetailContent {...props} needsManagerSignIn={signIn.needsLogin} />
  );
}

function WorkspaceDetailContent({
  installation,
  organization,
  name,
  needsManagerSignIn,
}: WorkspaceDetailPageProps & { needsManagerSignIn: boolean }) {
  const toastApi = useApi(toastApiRef);
  const navigate = useNavigate();
  const { tabHref, frame } = useWorkspaceFrame(name, organization);
  const detailRoute = useRouteRef(workspaceDetailRouteRef);
  const editRoute = useRouteRef(workspaceEditRouteRef);
  const availability = useWorkspaceManagerAvailability(installation);
  // The sync this person asked for, until its outcome has been shown.
  const [requestedAt, setRequestedAt] = useState<string>();
  const detail = useWorkspaceDetail(installation, name, !needsManagerSignIn, {
    followSync: true,
    awaitingSync: Boolean(requestedAt),
  });
  const { sync, remove } = useWorkspaceActions(installation, name);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [ended, setEnded] = useState<WorkspaceDetail['workspace']>();
  const workspace = detail.data?.workspace;
  useEffect(() => {
    if (
      workspace &&
      requestedAt &&
      requestedSyncEnded(workspace, requestedAt)
    ) {
      setEnded(workspace);
      setRequestedAt(undefined);
    }
  }, [workspace, requestedAt]);

  const syncNow = () => {
    // A new request: the last one's outcome no longer stands.
    setEnded(undefined);
    sync.mutate(undefined, {
      // The manager's time, which the last sync's is compared with; without
      // it, the last sync the page knows.
      onSuccess: result =>
        setRequestedAt(
          result.requestedAt ||
            workspace?.lastSync?.time ||
            new Date(0).toISOString(),
        ),
      onError: error =>
        toastApi.post({
          title: `${name} could not be synced`,
          description: error.message,
          status: 'danger',
        }),
    });
  };

  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        setDeleteOpen(false);
        toastApi.post({
          title: `${name} is being deleted`,
          status: 'success',
          timeout: TOAST_TIMEOUT_MS,
        });
        navigate(tabHref);
      },
    });

  if (needsManagerSignIn) {
    return (
      <ShellPage title={name} {...frame}>
        <WorkspaceManagerSignIn
          installation={installation}
          onSignedIn={() => void detail.refetch()}
        />
      </ShellPage>
    );
  }
  if (
    availability.presence === 'missing' ||
    availability.presence === 'sharedIdentity'
  ) {
    return (
      <UnavailableWorkspace
        installation={installation}
        organization={organization}
        name={name}
        sharedIdentity={availability.presence === 'sharedIdentity'}
      />
    );
  }
  if (detail.error) {
    const error = classifyWorkspaceManagerError(detail.error);
    let title = `${name} could not be read`;
    let description = error.message;
    if (error.kind === 'not_member') {
      // The manager names the workspace's Organization; the address's
      // segment is only what the link said.
      const owner = refusedOrganization(error.message);
      title = owner
        ? `You are not a member of ${owner}`
        : 'You are not a member of this workspace’s Organization';
      description = owner
        ? `${name} belongs to Organization ${owner}, and only its members can see its workspaces. An admin of ${owner} can add you.`
        : `Only the members of the Organization ${name} belongs to can see it. An admin of that Organization can add you.`;
    } else if (error.kind === 'not_found') {
      title = `No workspace ${name} on ${installation}`;
      description =
        'It may have been deleted, or the link names another environment.';
    }
    return (
      <ShellPage title={name} {...frame}>
        <EmptyStateCard
          title={title}
          description={description}
          actions={<Link href={tabHref}>Back to workspaces</Link>}
        />
      </ShellPage>
    );
  }
  if (!detail.data || !workspace) {
    return (
      <ShellPage
        title={<ShellPageTitleSkeleton label={`Reading ${name}…`} />}
        {...frame}
        badges={<ShellPageBadgeSkeleton />}
      >
        <ShellPageFactsSkeleton />
      </ShellPage>
    );
  }

  // The address names the workspace's Organization; a link that names
  // another goes to the workspace's own address.
  if (workspace.organization !== organization) {
    const canonical = detailRoute?.({
      installation,
      organization: workspace.organization,
      name,
    });
    if (canonical) {
      return <Navigate to={canonical} replace />;
    }
  }

  const state = syncState(workspace);
  const syncing = isSyncing(workspace) || Boolean(requestedAt);
  const row: WorkspaceRow = {
    ...workspace,
    installation,
    id: workspaceRowId({ installation, name }),
  };
  const editHref = editRoute?.({ installation, organization, name });

  const actions = (
    <>
      {editHref && (
        <Button
          variant="secondary"
          isDisabled={workspace.deleting}
          onPress={() => navigate(editHref)}
        >
          Edit
        </Button>
      )}
      <Button
        variant="primary"
        isDisabled={workspace.deleting || syncing || sync.isPending}
        onPress={syncNow}
      >
        {syncing || sync.isPending ? 'Syncing…' : 'Sync now'}
      </Button>
    </>
  );

  return (
    <ShellPage
      title={name}
      {...frame}
      badges={<StatusDot tone={state.tone} label={state.label} />}
      meta={`Organization ${organization} · ${installation} · ${sourcesLabel(
        workspace.sources,
      )}`}
      actions={actions}
      menu={
        <MoreActionsMenu
          items={
            workspace.deleting
              ? []
              : [
                  {
                    id: 'delete',
                    label: 'Delete…',
                    danger: true,
                    onAction: () => {
                      remove.reset();
                      setDeleteOpen(true);
                    },
                  },
                ]
          }
        />
      }
    >
      <Flex direction="column" gap="6">
        {workspace.deleting && (
          <Alert
            status="info"
            title={`${name} is being deleted`}
            description="Its sync has stopped and no new Session starts on it. Each Session below keeps its directory until it is cleaned up; then the volume goes."
          />
        )}
        {ended?.lastSync && <SyncEnded workspace={ended} />}
        <SyncSection detail={detail.data} />
        <StorageSection detail={detail.data} />
        <RepositoriesSection
          installation={installation}
          name={name}
          detail={detail.data}
        />
        <SessionsSection installation={installation} detail={detail.data} />
      </Flex>
      <WorkspaceDeleteDialog
        row={row}
        isOpen={isDeleteOpen}
        onOpenChange={setDeleteOpen}
        isDeleting={remove.isPending}
        error={remove.error?.message}
        onConfirm={confirmDelete}
      />
    </ShellPage>
  );
}

/** The outcome of the sync this person started with Sync now. */
function SyncEnded({ workspace }: { workspace: WorkspaceDetail['workspace'] }) {
  const result = lastSyncResult(workspace.lastSync!);
  return (
    <Alert
      status={result.tone === 'danger' ? 'danger' : 'success'}
      title={
        result.tone === 'danger'
          ? 'The sync failed'
          : `The sync ended: ${result.label.toLowerCase()}`
      }
      description={result.sentence}
      data-testid="workspace-sync-ended"
    />
  );
}

/** The last sync, its result and what started it, and the sync running now. */
function SyncSection({ detail }: { detail: WorkspaceDetail }) {
  const { workspace } = detail;
  const last = workspace.lastSync;
  const facts: Fact[] = [];
  if (workspace.activeSync) {
    facts.push({
      label: 'Now',
      value: (
        <>
          Syncing, started <When at={workspace.activeSync.startedAt} />
        </>
      ),
    });
  } else if (workspace.syncRequest) {
    facts.push({
      label: 'Now',
      value: (
        <>
          Sync requested <When at={workspace.syncRequest.requestedAt} />
          {workspace.syncRequest.requestedBy &&
            ` by ${workspace.syncRequest.requestedBy}`}
          , waiting to start
        </>
      ),
    });
  }
  if (last) {
    const result = lastSyncResult(last);
    facts.push(
      { label: 'Last sync', value: <When at={last.time} /> },
      {
        label: 'Result',
        value: (
          <Flex direction="column" gap="1">
            <StatusDot tone={result.tone} label={result.label} />
            <Text variant="body-medium" color="secondary">
              {result.sentence}
            </Text>
          </Flex>
        ),
      },
    );
    const trigger = syncTriggerLabel(last.trigger);
    if (trigger) {
      facts.push({ label: 'Started by', value: trigger });
    }
  } else if (!workspace.activeSync) {
    facts.push({ label: 'Last sync', value: 'Not synced yet' });
  }
  return (
    <PageSection
      title="Sync"
      description="The mirrors are fetched after every change to the workspace, on Sync now, and when a Session starts on it after a while without a sync. There is no schedule."
    >
      <FactList facts={facts} labelWidth={160} />
    </PageSection>
  );
}

/**
 * What the volume stores, and where its StorageClass provisions a size, the
 * share's size, what it needs, and the workspace's own headroom and minimum.
 * An elastic class shows only what is stored.
 */
function StorageSection({ detail }: { detail: WorkspaceDetail }) {
  const { workspace, storage } = detail;
  const volumeSize = storage.volumeSize ?? workspace.volumeSize;
  const neededSize = storage.neededSize ?? workspace.neededSize;
  const facts: Fact[] = [
    {
      label: 'Stored',
      value: `${formatBytes(
        storage.mirrorsBytes + storage.sessionsBytes,
      )}: ${formatBytes(storage.mirrorsBytes)} of repositories, ${formatBytes(
        storage.sessionsBytes,
      )} of Session directories`,
    },
  ];
  if (volumeSize) {
    facts.push({
      label: 'Share',
      value: [
        sizeLabel(volumeSize),
        ...(neededSize ? [`needs ${sizeLabel(neededSize)}`] : []),
        ...(workspace.grewFrom
          ? [`grown from ${sizeLabel(workspace.grewFrom)} at the last sync`]
          : []),
      ].join(' · '),
    });
    facts.push({
      label: 'Headroom',
      value: workspace.sizing?.headroom
        ? `${sizeLabel(workspace.sizing.headroom)}, set on the workspace`
        : 'Computed from the repositories',
    });
    if (workspace.sizing?.minimum) {
      facts.push({
        label: 'Minimum',
        value: sizeLabel(workspace.sizing.minimum),
      });
    }
  }
  return (
    <PageSection
      title="Storage"
      description={
        volumeSize
          ? 'The share grows when more is needed and never shrinks.'
          : 'The storage class grows the volume as it fills, so it has no fixed size.'
      }
    >
      <FactList facts={facts} labelWidth={160} />
    </PageSection>
  );
}

/**
 * The repositories of the last sync's manifest: each with its default
 * branch, head commit, measured mirror size and last push, marked when its
 * provider lists a later push. Searchable past a handful, a page at a time.
 */
function RepositoriesSection({
  installation,
  name,
  detail,
}: {
  installation: string;
  name: string;
  detail: WorkspaceDetail;
}) {
  const [search, setSearch] = useState('');
  const mirrors = useMemo(
    () => sortedMirrors(detail.mirrors),
    [detail.mirrors],
  );
  const shown = useMemo(
    () => searchMirrors(mirrors, search),
    [mirrors, search],
  );
  const pushes = useWorkspaceLastPushes(
    installation,
    name,
    detail.workspace.lastSync?.time,
    mirrors.length > 0,
  );
  const pushedSince = mirrors.filter(mirror =>
    pushedSinceSync(mirror, pushes.data?.pushes),
  ).length;

  const columns: ColumnConfig<MirrorRow>[] = [
    {
      id: 'repository',
      label: 'Repository',
      isRowHeader: true,
      defaultWidth: '3fr',
      minWidth: 200,
      cell: mirror => (
        <CellText
          title={mirror.repository}
          description={[
            ...(pushedSinceSync(mirror, pushes.data?.pushes)
              ? ['pushed since the last sync']
              : []),
            ...(mirror.droppedAt
              ? ['left the selection, kept while a Session uses it']
              : []),
          ].join(' · ')}
        />
      ),
    },
    {
      id: 'branch',
      label: 'Default branch',
      defaultWidth: '1fr',
      cell: mirror => <CellText title={mirror.defaultBranch ?? '—'} />,
    },
    {
      id: 'head',
      label: 'Head',
      defaultWidth: '1fr',
      cell: mirror => (
        <Cell>
          <code title={mirror.head}>
            {mirror.head ? shortCommit(mirror.head) : '—'}
          </code>
        </Cell>
      ),
    },
    {
      id: 'size',
      label: 'Mirror',
      defaultWidth: '1fr',
      cell: mirror => <CellText title={formatBytes(mirror.sizeBytes)} />,
    },
    {
      id: 'pushed',
      label: 'Last push',
      defaultWidth: '1fr',
      cell: mirror => (
        <Cell>
          <When at={mirror.pushedAt} />
        </Cell>
      ),
    },
  ];
  const shownColumns = usePhoneColumns(columns, ['repository', 'head']);

  let body;
  if (mirrors.length === 0) {
    body = (
      <Text variant="body-medium" color="secondary">
        {detail.workspace.lastSync
          ? 'The last sync mirrored no repository.'
          : 'The repositories are listed once the first sync ends.'}
      </Text>
    );
  } else if (shown.length === 0) {
    body = <CatalogNoMatch plural="repositories" search={search} />;
  } else {
    body = (
      <ShowMore
        key={search.trim()}
        items={shown}
        initial={INITIAL_ROWS}
        noun="repository"
        plural="repositories"
      >
        {page => (
          <Table<MirrorRow>
            columnConfig={shownColumns}
            data={page.map(mirror => ({
              ...mirror,
              id: `${mirror.provider}/${mirror.repository}`,
            }))}
            pagination={{ type: 'none' }}
          />
        )}
      </ShowMore>
    );
  }

  return (
    <PageSection
      title={`Repositories (${mirrors.length})`}
      description={[
        pushedSince > 0
          ? `${pushedSince} pushed to since the last sync; a Session starting now fetches them first.`
          : 'As the last sync mirrored them.',
        ...(pushes.data?.partial
          ? [
              'Pushes since the last sync are marked for the first 5,000 repositories only.',
            ]
          : []),
      ].join(' ')}
    >
      <Flex direction="column" gap="3">
        {(mirrors.length > SEARCH_MIN || search) && (
          <SearchField
            aria-label="Search repositories"
            placeholder="Search repositories"
            value={search}
            onChange={setSearch}
          />
        )}
        {body}
      </Flex>
    </PageSection>
  );
}

/**
 * The Sessions with a directory on the volume: each with its person, last
 * turn, directory size and cleanup date, filterable to the person's own and
 * shown a page at a time.
 */
function SessionsSection({
  installation,
  detail,
}: {
  installation: string;
  detail: WorkspaceDetail;
}) {
  const sessionRoute = useRouteRef(sessionDetailRouteRef);
  const installations = useMemo(() => [installation], [installation]);
  const capabilitiesFor = useKagentCapabilitiesMap(installations);
  const caller = capabilitiesFor(installation).caller?.toLowerCase();
  const [search, setSearch] = useState('');

  const directories = useMemo(
    () => sortedDirectories(detail.sessionDirectories),
    [detail.sessionDirectories],
  );
  const searched = useMemo(
    () => searchDirectories(directories, search),
    [directories, search],
  );
  // "Created by: Me": kagent's creator against the person as kagent names
  // them, compared as the IdP may write them in either case.
  const facets = useMemo<CatalogFacet<SessionDirectory>[]>(
    () =>
      caller
        ? [
            {
              id: 'createdBy',
              label: 'Created by',
              value: directory =>
                directory.creator?.toLowerCase() === caller ? 'me' : undefined,
              optionLabel: () => 'Me',
            },
          ]
        : [],
    [caller],
  );
  const filters = useCatalogFilters({ items: directories, searched, facets });
  const shown = filters.filtered;

  const columns: ColumnConfig<DirectoryRow>[] = [
    {
      id: 'session',
      label: 'Session',
      isRowHeader: true,
      defaultWidth: '3fr',
      minWidth: 200,
      cell: directory => {
        const href =
          !directory.unknown &&
          sessionRoute?.({ installation, sessionId: directory.session });
        return (
          <CellText
            title={directory.name || directory.session}
            href={href || undefined}
            description={
              directory.unknown
                ? 'Its Session is gone; the directory waits for cleanup'
                : directory.error
            }
          />
        );
      },
    },
    {
      id: 'person',
      label: 'Person',
      defaultWidth: '2fr',
      cell: directory => <CellText title={directory.creator ?? '—'} />,
    },
    {
      id: 'lastTurn',
      label: 'Last turn',
      defaultWidth: '1fr',
      cell: directory => (
        <Cell>
          {directory.lastTurn ? <When at={directory.lastTurn} /> : '—'}
        </Cell>
      ),
    },
    {
      id: 'size',
      label: 'Directory',
      defaultWidth: '1fr',
      cell: directory => <CellText title={formatBytes(directory.sizeBytes)} />,
    },
    {
      id: 'cleanup',
      label: 'Cleanup',
      defaultWidth: '1fr',
      cell: directory => (
        <CellText
          title={
            directory.cleanupAfter
              ? formatLocalDateFull(directory.cleanupAfter)
              : '—'
          }
        />
      ),
    },
  ];
  const shownColumns = usePhoneColumns(columns, ['session', 'cleanup']);

  let body;
  if (directories.length === 0) {
    body = (
      <Text variant="body-medium" color="secondary">
        No Session has a directory on this workspace.
      </Text>
    );
  } else if (shown.length === 0) {
    body = (
      <CatalogNoMatch
        plural="Sessions"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    );
  } else {
    body = (
      <ShowMore
        key={`${search.trim()}|${filters.key}`}
        items={shown}
        initial={INITIAL_ROWS}
        noun="Session"
      >
        {page => (
          <Table<DirectoryRow>
            columnConfig={shownColumns}
            data={page.map(directory => ({
              ...directory,
              id: directory.session,
            }))}
            pagination={{ type: 'none' }}
          />
        )}
      </ShowMore>
    );
  }

  return (
    <PageSection
      title={`Sessions on this workspace (${directories.length})`}
      description="A Session's directory is deleted 14 days after its last turn, unless the installation sets another time; a new turn moves the date."
    >
      <Flex direction="column" gap="3">
        {(directories.length > SEARCH_MIN || search) && (
          <SearchField
            aria-label="Search Sessions"
            placeholder="Search Sessions"
            value={search}
            onChange={setSearch}
          />
        )}
        <CatalogFilterBar
          dimensions={filters.dimensions}
          onSelect={filters.select}
          onClear={filters.clear}
        />
        {body}
      </Flex>
    </PageSection>
  );
}

/** The page at its address: `<installation>/<organization>/<name>`. */
export function WorkspaceDetailRoute() {
  const { installation, organization, name } = useParams();
  if (!installation || !organization || !name) {
    return null;
  }
  return (
    <WorkspaceDetailPage
      installation={installation}
      organization={organization}
      name={name}
    />
  );
}
