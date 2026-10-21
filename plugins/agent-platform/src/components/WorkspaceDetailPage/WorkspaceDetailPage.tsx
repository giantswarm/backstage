import { useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
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
  useSplatBasePath,
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
import {
  useWorkspaceManagerAvailability,
  useWorkspaceManagerClient,
} from '../../hooks/useWorkspaceManager';
import { useWorkspaceProviders } from '../../hooks/useWorkspaceEditor';
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
import { workspacePageTabs } from './workspaceTabs';

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
 * Sessions with a directory on the volume with their cleanup dates, as the
 * tabs Repositories (the index), Sessions and Details. Synchronize
 * (`sync_workspace`) shows the synchronization running, refreshes the page
 * when it ends and reports its outcome as a notification; Edit and Delete sit
 * beside it. A person outside the Organization gets
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
            : `Workspaces are not turned on for ${installation}. Ask your platform team to turn them on.`
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
  const basePath = useSplatBasePath();
  const { search } = useLocation();
  const availability = useWorkspaceManagerAvailability(installation);
  // The sync this person asked for, until its outcome has been shown.
  const [requestedAt, setRequestedAt] = useState<string>();
  const detail = useWorkspaceDetail(installation, name, !needsManagerSignIn, {
    followSync: true,
    awaitingSync: Boolean(requestedAt),
  });
  const { sync, remove } = useWorkspaceActions(installation, name);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const workspace = detail.data?.workspace;
  // The outcome of the synchronization the person asked for, as a
  // notification: the page shows the state from then on, which may move on.
  useEffect(() => {
    if (
      workspace?.lastSync &&
      requestedAt &&
      requestedSyncEnded(workspace, requestedAt)
    ) {
      setRequestedAt(undefined);
      const result = lastSyncResult(workspace.lastSync);
      toastApi.post(
        result.tone === 'danger'
          ? {
              title: `Synchronization of ${name} failed`,
              description: result.sentence,
              status: 'danger',
            }
          : {
              title: 'Workspace synchronization successful',
              description: result.sentence,
              status: 'success',
              timeout: TOAST_TIMEOUT_MS,
            },
      );
    }
  }, [workspace, requestedAt, toastApi, name]);

  const syncNow = () => {
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
          title: `${name} could not be synchronized`,
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
        {syncing || sync.isPending ? 'Synchronizing…' : 'Synchronize'}
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
      tabs={workspacePageTabs({
        repositories: detail.data.mirrors.length,
        sessions: detail.data.sessionDirectories.length,
      })}
      tabsBasePath={basePath}
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
      <Flex direction="column" gap="5">
        {workspace.deleting && (
          <Alert
            status="info"
            title={`${name} is being deleted`}
            description="Its synchronization has stopped and no new session starts on it. Each session keeps its directory until it is cleaned up; then the disk is deleted."
          />
        )}
        <Routes>
          <Route
            index
            element={
              <RepositoriesTab
                installation={installation}
                name={name}
                detail={detail.data}
              />
            }
          />
          <Route
            path="sessions"
            element={
              <SessionsTab installation={installation} detail={detail.data} />
            }
          />
          <Route
            path="details"
            element={
              <Flex direction="column" gap="6">
                <SyncSection detail={detail.data} />
                <StorageSection detail={detail.data} />
              </Flex>
            }
          />
          {/* An address the page does not have lands on Repositories. */}
          <Route
            path="*"
            element={<Navigate to={`${basePath}${search}`} replace />}
          />
        </Routes>
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
          Synchronizing, started <When at={workspace.activeSync.startedAt} />
        </>
      ),
    });
  } else if (workspace.syncRequest) {
    facts.push({
      label: 'Now',
      value: (
        <>
          Synchronization requested{' '}
          <When at={workspace.syncRequest.requestedAt} />
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
      { label: 'Last synchronization', value: <When at={last.time} /> },
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
    facts.push({
      label: 'Last synchronization',
      value: 'Not synchronized yet',
    });
  }
  return (
    <PageSection
      title="Synchronization status"
      description="The repositories are fetched after every change to the workspace, on Synchronize, and when a session starts on it after a while without a synchronization. There is no schedule."
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
      label: 'Total',
      value: formatBytes(storage.mirrorsBytes + storage.sessionsBytes),
    },
    { label: 'Repositories', value: formatBytes(storage.mirrorsBytes) },
    { label: 'Sessions', value: formatBytes(storage.sessionsBytes) },
    {
      label: 'Capacity',
      value: volumeSize
        ? [
            sizeLabel(volumeSize),
            ...(neededSize ? [`needs ${sizeLabel(neededSize)}`] : []),
            ...(workspace.grewFrom
              ? [`grown from ${sizeLabel(workspace.grewFrom)}`]
              : []),
            'grows when more is needed, never shrinks',
          ].join(' · ')
        : 'The storage class grows the volume as it fills, so it has no fixed size.',
    },
  ];
  if (volumeSize) {
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
    <PageSection title="Disk">
      <FactList facts={facts} labelWidth={160} />
    </PageSection>
  );
}

/**
 * The repositories of the last sync's manifest: each with its default
 * branch, head commit, measured mirror size and last push, marked when its
 * provider lists a later push. Searchable past a handful, a page at a time.
 */
function RepositoriesTab({
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
  // Each repository at its provider instance's host, where the manager names
  // one: `https://<host>/<owner>/<name>`.
  const providers = useWorkspaceProviders(
    useWorkspaceManagerClient(installation),
  );
  const hosts = useMemo(
    () =>
      new Map(
        (providers.data ?? []).flatMap(provider =>
          provider.host ? [[provider.name, provider.host] as const] : [],
        ),
      ),
    [providers.data],
  );

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
          href={
            hosts.has(mirror.provider)
              ? `https://${hosts.get(mirror.provider)}/${mirror.repository}`
              : undefined
          }
          description={
            mirror.droppedAt
              ? 'left the selection, kept while a session uses it'
              : undefined
          }
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
          <Flex direction="column" gap="0">
            <When at={mirror.pushedAt} />
            {pushedSinceSync(mirror, pushes.data?.pushes) && (
              <Text variant="body-small" color="secondary">
                after last synchronization
              </Text>
            )}
          </Flex>
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
          ? 'The last synchronization fetched no repository.'
          : 'The repositories are listed once the first synchronization ends.'}
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
    <Flex direction="column" gap="3">
      <Text variant="body-medium" color="secondary">
        {[
          pushedSince > 0
            ? `${pushedSince} pushed to after the last synchronization; a session starting now fetches them first.`
            : 'As the last synchronization fetched them.',
          ...(pushes.data?.partial
            ? [
                'Pushes after it are marked for the first 5,000 repositories only.',
              ]
            : []),
        ].join(' ')}
      </Text>
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
  );
}

/**
 * The Sessions with a directory on the volume: each with its person, last
 * turn, directory size and cleanup date, filterable to the person's own and
 * shown a page at a time.
 */
function SessionsTab({
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
                ? 'Its session is gone; the directory waits for cleanup'
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
        No session has a directory on this workspace.
      </Text>
    );
  } else if (shown.length === 0) {
    body = (
      <CatalogNoMatch
        plural="sessions"
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
        noun="session"
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
    <Flex direction="column" gap="3">
      <Text variant="body-medium" color="secondary">
        The sessions with a directory on this workspace. A directory is deleted
        14 days after its session's last turn, unless the environment sets
        another time; a new turn moves the date.
      </Text>
      {(directories.length > SEARCH_MIN || search) && (
        <SearchField
          aria-label="Search sessions"
          placeholder="Search sessions"
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
