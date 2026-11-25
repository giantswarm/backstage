import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckIcon from '@material-ui/icons/Check';
import {
  countNoun,
  LoadingIndicator,
  useProvidePageHeaderActions,
  WizardStepHeading,
  type PollingQuery,
} from '@giantswarm/backstage-plugin-ui-react';

import { musterServerListQueryKey } from '../../hooks/useMusterServerAvailability';
import { musterApiRef } from '../../apis';
import { musterPollingOptions } from '../../lib/musterPolling';
import type { McpServerListResponse, ToolSummary } from '../../apis/types';
import { mcpServerStateSeverity, type MCPServerState } from '../../lib/k8s';
import {
  connectorDisplayNameOn,
  musterOwnServer,
} from '../../lib/serverGrouping';
import { toolEffect } from '../../lib/toolAnnotations';
import { takesArgument } from '../../lib/mcpServerDefinition';
import {
  approvalOf,
  connectorAdminOf,
  approvalRefusalNote,
  approvalRefusalReason,
  GOVERNANCE_MODE_UNKNOWN_NOTE,
  isSettingsUnreadable,
  ruleOptionsOf,
} from '../../lib/toolApproval';
import { useGovernanceMode } from '../../hooks/useGovernanceMode';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { useNewMcpServerForm } from '../NewMcpServerFormProvider';
import { ServerSignIn, StateBadge, severityTone } from '../shared';
import { toolArgumentsQuery } from '../shared/hooks';
import { useConnectorWizardLinks } from '../NewMcpServerEditGate';
import {
  ToolApprovalEditor,
  useToolApprovalDraft,
} from '../ToolApprovalEditor';
import {
  SET_APPROVAL_TOOL,
  ToolApprovalConflictError,
  useSaveToolApproval,
} from './useSaveToolApproval';
import {
  ConnectorWizardFrame,
  useConnectorWizardCloseHref,
} from './ConnectorWizardFrame';

/** How often the runtime list is re-read while the server is still settling. */
const TEST_POLL_INTERVAL_MS = 5_000;
/** Once connected the panel only confirms; the slow poll covers drift. */
const SETTLED_POLL_INTERVAL_MS = 30_000;

const useStyles = makeStyles({
  connected: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    borderRadius: 12,
    background: 'var(--bui-success-bg-subdued, #e7f6ec)',
    color: 'var(--bui-success-fg-subdued, #14612a)',
    fontSize: 14,
    '& svg': { width: 18, height: 18, flex: 'none' },
  },
  code: {
    fontFamily: 'monospace',
    overflowWrap: 'anywhere',
  },
});

/** "N tools — X that read and Y that change things." */
export function toolCountsLine(tools: ToolSummary[]): string {
  const reads = tools.filter(tool => toolEffect(tool) === 'reads').length;
  const changes = tools.length - reads;
  const noun = tools.length === 1 ? 'tool' : 'tools';
  return `${tools.length} ${noun} — ${reads} that read and ${changes} that change things`;
}

/**
 * Step 3 (Test & Tools) of the shell's connector wizard. The connector is
 * already registered when this opens (step 2's "Add connector" created it),
 * so this is a live status panel, not a gate: it follows the CR and the
 * per-session runtime view until the connector is connected, then lists what
 * it offers — each tool with whether it only reads or changes things, and
 * its approval setting (`ToolApprovalEditor`): pills for a connector admin,
 * pre-filled by the preset the governance mode picks on a connector nobody
 * reviewed (*Recommended*, with a note, when the mode cannot be read) or
 * by the preset a create stored as a rule alone; the settings read-only for
 * everyone else. *Done* saves the explicit settings through `core_mcpserver_set_approval`; a failed save
 * keeps the person on the step with the reason. The edit flow reuses the
 * step, and the Tools tab's *Review* leads straight to it.
 *
 * `Auth Required` is a normal state here: an OAuth connector needs this
 * person's one-time sign-in before it can be tested as them, offered inline
 * through the same machinery the connector page uses. Leaving mid-test is
 * safe — the connector keeps connecting either way.
 */
export function NewConnectorTestPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const musterApi = useApi(musterApiRef);
  const wizardLinks = useConnectorWizardLinks();
  const closeHref = useConnectorWizardCloseHref();
  const {
    state,
    registeredName,
    registeredInstallation,
    lastSave,
    lastSaveAt,
    reset,
  } = useNewMcpServerForm();
  const { mcpServers, mcpServersUpdatedAt, retry } = useMusterInstance();
  const { authenticated } = useMusterSession();

  const installation = state.installation;
  const serverName = registeredName;

  // The CR was just created, but the provider's CRD read refreshes on a 30s
  // interval — kick one refresh on mount so the panel doesn't open on a stale
  // list. Ref'd so the effect runs exactly once.
  const retryRef = useRef(retry);
  retryRef.current = retry;
  useEffect(() => {
    retryRef.current();
  }, []);

  const cr = useMemo(
    () =>
      // The wizard registers in muster's own namespace, never an
      // organization's server of the same name.
      musterOwnServer(mcpServers, installation, serverName),
    [mcpServers, serverName, installation],
  );

  // After an update the CR keeps the previous configuration's status until
  // muster reconciles the new spec, so a "Connected" read would confirm a
  // change not yet applied. The Ready condition's observedGeneration trailing
  // metadata.generation says so; the verdict waits until they agree. Until
  // the server list is read again after the update, the CR in hand is the
  // pre-update one (its generations agree), so that counts as applying too.
  const isPreUpdateRead =
    lastSave === 'update' &&
    lastSaveAt !== undefined &&
    (mcpServersUpdatedAt ?? 0) < lastSaveAt;
  const applying = isPreUpdateRead || Boolean(cr?.isReconcilePending());
  useEffect(() => {
    if (!applying) {
      return undefined;
    }
    const timer = setInterval(() => retryRef.current(), TEST_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [applying]);

  // Live per-session runtime view; shares the query key with the connector
  // page's capability counts (`useServerCapabilityCounts`) so the two agree.
  // Not from a hidden tab: the connector takes up to a minute to connect,
  // the window where the person switches tabs, and the next tick, seconds
  // after this tab becomes visible again, shows where it got to (no read on
  // becoming visible on top: the client keeps focus refetches off and
  // `staleTime` at 0). Not after muster refused the person either.
  const { data: runtimeData } = useQuery({
    queryKey: musterServerListQueryKey(installation),
    queryFn: () => musterApi.listServers(installation),
    enabled: Boolean(installation && serverName),
    ...musterPollingOptions(
      (query: PollingQuery<McpServerListResponse>) => {
        if (applying) {
          return TEST_POLL_INTERVAL_MS;
        }
        const runtimeState = (query.state.data?.mcpServers ?? []).find(
          s => s.name === serverName,
        )?.state;
        return runtimeState === 'Connected' ||
          runtimeState === 'Running' ||
          runtimeState === 'Awaiting Session'
          ? SETTLED_POLL_INTERVAL_MS
          : TEST_POLL_INTERVAL_MS;
      },
      { refetchOnVisible: false },
    ),
  });
  const runtime = (runtimeData?.mcpServers ?? []).find(
    s => s.name === serverName,
  );

  const serverState = (
    applying ? undefined : (runtime?.state ?? cr?.getState())
  ) as MCPServerState | undefined;
  const severity = mcpServerStateSeverity(serverState);
  // A sigv4 connector signs as muster's own machine identity — a 401 on it is
  // a config error, never something a sign-in fixes.
  const authRequired =
    serverState === 'Auth Required' && state.authMode !== 'sigv4';
  const awaitingSession = serverState === 'Awaiting Session';
  const connected = serverState === 'Connected' || serverState === 'Running';
  const failed = severity === 'error';
  const toolsCount = runtime?.toolsCount;

  // The connector's tools, read from the same aggregated catalogue agents use.
  const prefix = cr?.getToolNamePrefix() ?? `x_${serverName}`;
  const pattern = `${prefix}_*`;
  const toolsQuery = useQuery({
    queryKey: ['muster', 'server-tools', installation, pattern],
    queryFn: () => musterApi.filterTools({ installation, pattern, limit: 200 }),
    enabled: Boolean(
      authenticated &&
      installation &&
      serverName &&
      (connected || (toolsCount ?? 0) > 0),
    ),
  });
  const tools = useMemo(() => toolsQuery.data?.tools ?? [], [toolsQuery.data]);
  // muster answers one page (the 200 asked for); its total counts every match,
  // so a larger connector is said to be larger rather than cut silently.
  const toolsTotal = Math.max(toolsQuery.data?.total ?? 0, tools.length);
  const partial = toolsTotal > tools.length;

  const displayName = cr
    ? connectorDisplayNameOn(mcpServers, installation, cr.getName())
    : state.name.trim() || serverName || 'The connector';

  // Tool approval: what is stored, who may change it, whether muster can
  // save it here.
  const { mode, settled: modeSettled } = useGovernanceMode(installation);
  const stored = runtime?.approval ?? cr?.getApproval();
  const approval = useToolApprovalDraft({ tools, prefix, stored, mode });
  const setApprovalSchema = useQuery({
    ...toolArgumentsQuery(musterApi, SET_APPROVAL_TOOL, installation),
    enabled: Boolean(authenticated && installation && tools.length > 0),
  });
  // Unknown while muster is asked; a muster without the tool cannot save.
  let canSave: boolean | undefined;
  if (setApprovalSchema.isSuccess) {
    canSave = takesArgument(setApprovalSchema.data.inputSchema, 'approval');
  } else if (setApprovalSchema.isError) {
    canSave = false;
  }
  const reportsApproval = tools.some(tool => tool.approval);
  const unavailable = isSettingsUnreadable(tools);
  const refusalReason = approvalRefusalReason(tools);
  const admin = connectorAdminOf(tools);
  const view = canSave && admin !== false ? 'edit' : 'read';
  const save = useSaveToolApproval();

  const onDone = useCallback(async () => {
    if (
      view === 'edit' &&
      !unavailable &&
      approval.rows.length > 0 &&
      approval.dirty &&
      serverName
    ) {
      try {
        await save.mutateAsync({
          name: serverName,
          installation,
          approval: approvalOf(approval.draft),
          base: stored,
        });
      } catch {
        // Shown in place; the person stays on the step.
        return;
      }
    }
    reset();
    navigate(closeHref);
  }, [
    view,
    unavailable,
    approval,
    serverName,
    save,
    stored,
    installation,
    reset,
    navigate,
    closeHref,
  ]);

  const onBack = useCallback(() => {
    const signIn = wizardLinks('auth', {
      name: registeredName,
      installation: registeredInstallation,
    });
    if (signIn) {
      navigate(signIn);
    }
  }, [wizardLinks, navigate, registeredName, registeredInstallation]);

  const actions = useMemo(
    () => (
      <Button variant="primary" onPress={onDone} loading={save.isPending}>
        Done
      </Button>
    ),
    [onDone, save.isPending],
  );

  const isRedirecting = !serverName;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // No registered connector in this wizard run (deep link, reload, reset) —
  // there is nothing to test yet.
  if (isRedirecting) {
    return <Navigate to={wizardLinks('connect') ?? '..'} replace />;
  }

  let status;
  if (connected && tools.length > 0) {
    status = (
      <div className={classes.connected}>
        <CheckIcon aria-hidden />
        <span>
          <strong style={{ fontWeight: 500 }}>Connected.</strong> {displayName}{' '}
          offers{' '}
          {partial ? countNoun(toolsTotal, 'tool') : toolCountsLine(tools)}.
        </span>
      </div>
    );
  } else if (connected) {
    status = (
      <div className={classes.connected}>
        <CheckIcon aria-hidden />
        <span>
          <strong style={{ fontWeight: 500 }}>Connected.</strong>{' '}
          {toolsQuery.isFetching
            ? 'Asking the connector what it can do…'
            : 'No tools reported yet — discovery can take a moment.'}
        </span>
      </div>
    );
  } else {
    status = (
      <Flex align="center" gap="3">
        {applying || !serverState ? (
          <StateBadge tone="neutral" label="Connecting…" />
        ) : (
          <StateBadge
            tone={severityTone(severity)}
            label={serverState}
            title={cr?.getStateExplanation()}
          />
        )}
        <Text variant="body-small" color="secondary">
          {applying || !serverState
            ? 'Registered. This updates automatically once Muster connects it.'
            : (runtime?.statusMessage ?? cr?.getStateExplanation() ?? '')}
        </Text>
      </Flex>
    );
  }

  return (
    <ConnectorWizardFrame step="test" onBack={onBack}>
      <WizardStepHeading title="Test the connection">
        The connector <span className={classes.code}>{serverName}</span> is
        registered on <strong>{installation}</strong>, tested as you. You can
        leave any time and finish later on the connector&apos;s page.
      </WizardStepHeading>

      {status}

      {authRequired && (
        <Flex direction="column" gap="3">
          <Alert
            status="info"
            title="This connector needs your sign-in — that's normal"
            description="Each person signs in once before its tools appear. Sign in now to test it, or later on the connector's page."
          />
          <ServerSignIn
            noun="connector"
            serverName={serverName}
            displayName={displayName}
            installation={installation}
          />
        </Flex>
      )}

      {awaitingSession && (
        <Alert
          status="info"
          title="This connector connects per session — that's normal"
          description={
            cr?.getStateExplanation() ??
            'It connects with each person’s own identity; its tools appear once Muster has connected it for your session.'
          }
        />
      )}

      {!applying && (failed || runtime?.error) && (
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="The connector is not connecting"
            description={
              runtime?.statusMessage ??
              runtime?.error ??
              'Muster reports a failure.'
            }
          />
          <Text variant="body-small" color="secondary">
            Muster keeps retrying. To fix the address or sign-in, go Back — your
            entries are kept and saved as an update to this connector.
          </Text>
        </Flex>
      )}

      {tools.length > 0 && (
        <ToolsSection
          installation={installation}
          loading={canSave === undefined}
          unavailable={unavailable}
          refusalReason={refusalReason}
          canSave={canSave}
          reportsApproval={reportsApproval}
          admin={admin}
          saveError={save.error}
          modeNote={
            view === 'edit' && !approval.reviewed && modeSettled && !mode
              ? GOVERNANCE_MODE_UNKNOWN_NOTE
              : undefined
          }
        >
          <ToolApprovalEditor
            approval={approval}
            view={view}
            ruleOptions={ruleOptionsOf(setApprovalSchema.data?.inputSchema)}
            partialNote={
              partial
                ? `Only the first ${tools.length} of ${toolsTotal} tools are listed.${
                    view === 'edit'
                      ? ' The others follow the rule for new tools.'
                      : ''
                  }`
                : undefined
            }
          />
        </ToolsSection>
      )}
    </ConnectorWizardFrame>
  );
}

/**
 * What stands around the tool settings: a reading state, why they cannot be
 * changed or applied here, and a failed save.
 */
function ToolsSection({
  installation,
  loading,
  unavailable,
  refusalReason,
  canSave,
  reportsApproval,
  admin,
  saveError,
  modeNote,
  children,
}: {
  installation: string | undefined;
  loading: boolean;
  unavailable: boolean;
  refusalReason: string | undefined;
  canSave: boolean | undefined;
  reportsApproval: boolean;
  admin: boolean | undefined;
  saveError: Error | null;
  /** Why the pre-selection is the stricter one: the mode is unknown. */
  modeNote?: string;
  children: ReactNode;
}) {
  if (loading) {
    return <LoadingIndicator label="Reading the tool settings…" />;
  }
  if (unavailable) {
    return (
      <Alert
        status="warning"
        title="The tool settings can't be read"
        description="Muster could not read this connector's tool approval settings. It reports every tool as Ask and does not run them until it can read the settings. Try again later; Done saves nothing here."
      />
    );
  }
  let note: ReactNode;
  if (!canSave) {
    note = (
      <Alert
        status="info"
        description={
          reportsApproval
            ? `Muster on ${installation} can't save tool settings from the portal yet. They are shown as they are, and Done saves nothing; set them in the connector's MCPServer (spec.approval) instead.`
            : `Muster on ${installation} doesn't support tool approval yet: every tool runs without asking.`
        }
      />
    );
  } else if (admin === false) {
    note = (
      <Alert
        status="info"
        description="Only a connector admin can change these settings. Ask one of the people who manage connectors here."
      />
    );
  }
  return (
    <Flex direction="column" gap="3">
      {refusalReason && (
        <Alert status="warning" {...approvalRefusalNote(refusalReason)} />
      )}
      {note}
      {modeNote && <Alert status="info" description={modeNote} />}
      {saveError instanceof ToolApprovalConflictError && (
        <Alert
          status="warning"
          title="The tool settings changed meanwhile"
          description={saveError.message}
        />
      )}
      {saveError && !(saveError instanceof ToolApprovalConflictError) && (
        <Alert
          status="danger"
          title="The tool settings were not saved"
          description={`${saveError.message} Nothing changed; press Done to try again, or leave and set them later on the connector's Tools tab.`}
        />
      )}
      {children}
    </Flex>
  );
}
