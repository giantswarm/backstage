import { type ReactNode, useRef, useState } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Link } from '@backstage/core-components';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  DialogHeader,
  DialogTrigger,
  Flex,
  Skeleton,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { KagentSessionWorkspace } from '@giantswarm/backstage-plugin-agent-platform-common';
import { formatLocalDateFull } from '@giantswarm/backstage-plugin-ui-react';

import { formatBytes } from '../../lib/formatNumbers';
import { useWorkspaceDetail } from '../../hooks/useWorkspaceActions';
import type { SessionWorkspaceName } from '../../hooks/useWorkspaceNames';
import {
  syncedAgo,
  UNNAMED_WORKSPACE_REASON,
  workspaceChipText,
} from '../../lib/sessionWorkspace';
import type { Workspace } from '../../lib/workspaceManager';
import { workspaceDetailRouteRef } from '../../routes';

const useStyles = makeStyles({
  // A drawer on the right, the conversation still in view beside it: the
  // dialog's overlay centres its box, which the auto margin pushes right,
  // stretched to the window's height.
  drawer: {
    marginLeft: 'auto',
    alignSelf: 'stretch',
    height: '100vh',
    maxHeight: '100vh',
    borderRadius: 0,
  },
  // Outlined and filled, so it reads as a control among the header's text.
  // The bui Button's colours are custom properties set on
  // `.bui-Button[data-variant='secondary']`, which `&&&` outranks whatever
  // order the stylesheets load in.
  chip: {
    borderRadius: 999,
    '&&&': {
      '--bg': 'var(--bui-bg-neutral-2)',
      '--bg-hover': 'var(--bui-bg-neutral-2-hover)',
      '--bg-active': 'var(--bui-bg-neutral-2-pressed)',
      border: '1px solid var(--bui-border-2)',
      fontWeight: 'normal',
    },
    maxWidth: 360,
    minWidth: 0,
  },
  chipLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  // Lines of their own above the details: a bold headline at the tooltip's
  // own size, which says what the chip shows, then the full name when the
  // chip cuts it off. On elements inside the tooltip: bui's `Tooltip` drops
  // a `className`.
  tooltipHeading: {
    display: 'block',
    fontWeight: 'bold',
  },
  tooltipName: {
    display: 'block',
    overflowWrap: 'anywhere',
  },
  list: {
    margin: 0,
    paddingLeft: 0,
    listStyle: 'none',
    overflowWrap: 'anywhere',
  },
});

export type SessionWorkspaceChipProps = {
  /** The session's id, which names its directory on the workspace's volume. */
  sessionId: string;
  installation: string;
  /** The session's workspace as its record says it. */
  workspace: KagentSessionWorkspace;
  /** The workspace by name, as `useWorkspaceNames` resolves it. */
  name: SessionWorkspaceName;
};

/** Whether the label is cut off by the chip's width. */
function isTruncated(element: HTMLElement | null): boolean {
  return Boolean(element && element.scrollWidth > element.clientWidth);
}

/**
 * The session header's workspace: a chip with the workspace's name, its last
 * sync and how many repositories were fetched fresh at the start in a tooltip
 * on hover and keyboard focus, opening a drawer with the rest. The tooltip
 * is headed "Workspace", and gives the full name when the chip cuts it off. The chip's accessible
 * name carries the name and the details, so the tooltip hides nothing from a
 * screen reader. A workspace the person cannot see any more shows unnamed,
 * never an error: the session works either way.
 */
export function SessionWorkspaceChip({
  sessionId,
  installation,
  workspace,
  name,
}: SessionWorkspaceChipProps) {
  const classes = useStyles();
  const labelRef = useRef<HTMLSpanElement>(null);
  // Read when the tooltip opens: nothing re-renders an idle session's header
  // on a clock, so the sync's age would otherwise be the age at the last
  // render, and only an open tooltip shows whether the label is cut off.
  const [opened, setOpened] = useState<{ now: Date; truncated: boolean }>();
  if (name.status === 'loading') {
    return <Skeleton width={160} height={24} />;
  }
  const { label, details } = workspaceChipText(
    name,
    workspace.fetched.length,
    opened?.now,
  );
  return (
    <DialogTrigger>
      {/* Inside the dialog's trigger, so its press still reaches the button:
          react-aria's tooltip trigger only adds hover and focus handling, and
          closes the tooltip on a press. */}
      <TooltipTrigger
        delay={200}
        onOpenChange={isOpen => {
          if (isOpen) {
            setOpened({
              now: new Date(),
              truncated: isTruncated(labelRef.current),
            });
          }
        }}
      >
        <Button
          size="small"
          variant="secondary"
          className={classes.chip}
          aria-label={`Workspace: ${label} · ${details}`}
          aria-haspopup="dialog"
        >
          <span ref={labelRef} className={classes.chipLabel}>
            {label}
          </span>
        </Button>
        <Tooltip>
          <span className={classes.tooltipHeading}>Workspace</span>
          {opened?.truncated && (
            <span className={classes.tooltipName}>{label}</span>
          )}
          {details}
        </Tooltip>
      </TooltipTrigger>
      <Dialog width={420} className={classes.drawer}>
        <DialogHeader>
          {name.status === 'named'
            ? `Workspace: ${name.workspace.name}`
            : 'Workspace'}
        </DialogHeader>
        <DialogBody>
          <SessionWorkspaceDetails
            sessionId={sessionId}
            installation={installation}
            workspace={workspace}
            named={name.status === 'named' ? name.workspace : undefined}
          />
        </DialogBody>
      </Dialog>
    </DialogTrigger>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Flex direction="column" gap="1">
      <Text as="h3" variant="body-small" weight="bold" color="secondary">
        {title}
      </Text>
      {children}
    </Flex>
  );
}

function RepositoryList({
  repositories,
  fetched,
}: {
  repositories: string[];
  fetched?: Set<string>;
}) {
  const classes = useStyles();
  return (
    <ul className={classes.list}>
      {repositories.map(repository => (
        <li key={repository}>
          <Text variant="body-medium">
            {repository}
            {fetched?.has(repository) && (
              <Text as="span" variant="body-medium" color="secondary">
                {' '}
                (fetched)
              </Text>
            )}
          </Text>
        </li>
      ))}
    </ul>
  );
}

/**
 * The drawer's body. Read when the drawer opens: the workspace's
 * repositories, and this session's directory with its size and cleanup date
 * (`get_workspace`). What the session's record says (the fetched
 * repositories, the provider sign-in) needs no read.
 */
function SessionWorkspaceDetails({
  sessionId,
  installation,
  workspace,
  named,
}: {
  sessionId: string;
  installation: string;
  workspace: KagentSessionWorkspace;
  named?: Workspace;
}) {
  const detailRoute = useRouteRef(workspaceDetailRouteRef);
  const detail = useWorkspaceDetail(
    installation,
    named?.name ?? '',
    Boolean(named),
  );
  const href =
    named &&
    detailRoute?.({
      installation,
      organization: named.organization,
      name: named.name,
    });
  const fetched = new Set(workspace.fetched);
  const mirrors = (detail.data?.mirrors ?? [])
    .filter(mirror => !mirror.droppedAt)
    .map(mirror => mirror.repository)
    .sort((a, b) => a.localeCompare(b));
  const directory = detail.data?.sessionDirectories.find(
    entry => entry.session === sessionId,
  );
  const lastSync = named?.lastSync?.time;

  return (
    <Flex direction="column" gap="4">
      {named ? (
        <Flex direction="column" gap="1">
          {href ? (
            <Link to={href}>{named.name}</Link>
          ) : (
            <Text variant="body-medium">{named.name}</Text>
          )}
          <Text
            variant="body-small"
            color="secondary"
            title={lastSync ? formatLocalDateFull(lastSync) : undefined}
          >
            {syncedAgo(lastSync)}
            {lastSync && ` (${formatLocalDateFull(lastSync)})`}
          </Text>
        </Flex>
      ) : (
        <Alert status="info" description={UNNAMED_WORKSPACE_REASON} />
      )}

      <Section title="Fetched before the first turn">
        {workspace.fetched.length > 0 ? (
          <RepositoryList repositories={workspace.fetched} />
        ) : (
          <Text variant="body-medium" color="secondary">
            None: no repository had moved since the last synchronization.
          </Text>
        )}
      </Section>

      {named && (
        <Section
          title={
            detail.data ? `Repositories (${mirrors.length})` : 'Repositories'
          }
        >
          {detail.isPending && (
            <Flex direction="column" gap="1">
              <Skeleton width="80%" height={16} />
              <Skeleton width="60%" height={16} />
            </Flex>
          )}
          {detail.error && (
            <Text variant="body-medium" color="secondary">
              The repositories could not be read: {detail.error.message}
            </Text>
          )}
          {detail.data && (
            <>
              <Text variant="body-small" color="secondary">
                Each is in this session's directory, checked out when the agent
                first works in it.
              </Text>
              <RepositoryList repositories={mirrors} fetched={fetched} />
            </>
          )}
        </Section>
      )}

      {directory && (
        <Section title="This session's directory">
          <Text variant="body-medium">{formatBytes(directory.sizeBytes)}</Text>
          {directory.cleanupAfter && (
            <Text variant="body-medium">
              Deleted on {formatLocalDateFull(directory.cleanupAfter)}, unless
              the session has another turn before then.
            </Text>
          )}
        </Section>
      )}

      {workspace.providers.length > 0 && (
        <Section title="Acting as you on">
          <Text variant="body-medium">{workspace.providers.join(', ')}</Text>
        </Section>
      )}
    </Flex>
  );
}
