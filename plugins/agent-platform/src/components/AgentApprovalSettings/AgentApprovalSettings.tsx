import { useId, useMemo } from 'react';
import { reportedSetting } from '@giantswarm/backstage-plugin-muster';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Approval pills and settings are muster's.
import {
  APPROVAL_SETTING_HINTS,
  ApprovalPills,
  type ApprovalSetting,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';
import { LoadingIndicator } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentApprovalReport } from '../../hooks/useAgentApprovalReport';
import type { ServerInfo } from '../../lib/toolset';
import { parseSelector, selectorForTool } from '../../lib/toolset';
import {
  AGENT_APPROVAL_SETTINGS,
  APPROVAL_NOT_ENFORCED_NOTE,
  APPROVAL_PENDING_NOTE,
  TRUSTED_AGENT_NOTE,
  allowBlocker,
  allowBlockerOfMany,
  platformAskCount,
  shownSetting,
  type AgentApprovalDraft,
} from '../../lib/agentApproval';
import type { AgentApprovalSetting } from '../../lib/agentManager';
import { ToolsetResolutionList } from '../ToolsetResolutionList';

const useStyles = makeStyles(theme => ({
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(0.5, 2),
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    padding: theme.spacing(1, 0),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: theme.spacing(0.5),
    maxWidth: 320,
  },
}));

export type AgentApprovalSettingsProps = {
  /** The selection as it will be saved, the sign-in tool included. */
  selection: readonly string[];
  draft: AgentApprovalDraft;
  /** What muster reports for the list as it will be saved. */
  report: AgentApprovalReport;
  /** The installation's MCPServers, for the grouping. */
  servers: ServerInfo[];
  /** A connector's name in a sentence, by muster's server key. */
  labelOf: (server: string) => string;
  onSetting: (
    selector: string,
    setting: AgentApprovalSetting | undefined,
  ) => void;
  onDefault: (setting: AgentApprovalSetting | undefined) => void;
  /** The agent is applied from Git: its pull request carries no exceptions. */
  viaGit?: boolean;
  /** agent-manager says the settings are saved but not enforced. */
  notEnforced?: boolean;
  /** The agent's saved settings wait for its rollout. */
  pending?: boolean;
};

/** A tool's pills, at its row's end, with why *Allow* cannot be picked. */
function ToolPills({
  tool,
  draft,
  hintIds,
  labelOf,
  viaGit,
  onSetting,
}: {
  tool: ToolSummary;
  draft: AgentApprovalDraft;
  hintIds: Record<ApprovalSetting, string>;
  labelOf: (server: string) => string;
  viaGit?: boolean;
  onSetting: AgentApprovalSettingsProps['onSetting'];
}) {
  const classes = useStyles();
  const reasonId = useId();
  const selector = selectorForTool(tool);
  const own = draft.settings[selector];
  const blocker = allowBlocker(tool, {
    connectorLabel: labelOf(tool.server ?? ''),
    viaGit,
  });
  // A built-in, governance or unreadable Ask holds whatever the agent says:
  // the pills show what muster reports and never offer Allow, even where a
  // stored entry says Allow.
  const floor = isPlatformAsk(tool);
  let value = shownSetting(tool, draft);
  if (floor && tool.approval) {
    value = reportedSetting(tool.approval);
  }
  // An Allow the person picked over a connector's Ask: an exception, saved
  // with set_agent_approval, which only that connector's admins can.
  const exception =
    own === 'Allow' &&
    !floor &&
    (tool.approval?.admin?.setting ?? tool.approval?.setting) === 'ask' &&
    tool.approval?.source !== 'agent-exception';
  return (
    <span className={classes.cell}>
      <ApprovalPills
        aria-label={`Approval for ${tool.name}`}
        options={AGENT_APPROVAL_SETTINGS}
        value={value}
        disabledOptions={
          blocker && (floor || own !== 'Allow') ? ['Allow'] : undefined
        }
        describedBy={blocker ? reasonId : undefined}
        onChange={setting => onSetting(selector, setting)}
        hintIds={hintIds}
      />
      {blocker && (
        <Text id={reasonId} variant="body-small" color="secondary">
          {blocker}
        </Text>
      )}
      {exception && !blocker && (
        <Text variant="body-small" color="secondary">
          An exception for this agent: it runs without asking once saved.
        </Text>
      )}
      {own && (
        <Button
          variant="tertiary"
          size="small"
          aria-label={`Reset approval for ${tool.name}`}
          onPress={() => onSetting(selector, undefined)}
        >
          Reset
        </Button>
      )}
    </span>
  );
}

/**
 * A row for an entry covering many tools — a whole connector, or the
 * list's default — with its pills, why Allow cannot be picked (the group's
 * description) and, for an Allow that lifts a connector's Ask, that it is
 * an exception.
 */
function EntryRow({
  label,
  groupLabel,
  resetLabel,
  resetText,
  description,
  note,
  value,
  tools,
  blocker,
  hintIds,
  onChange,
}: {
  label: string;
  groupLabel: string;
  resetLabel: string;
  resetText: string;
  description: string;
  note?: string;
  value: AgentApprovalSetting | undefined;
  tools: readonly ToolSummary[];
  blocker: string | undefined;
  hintIds: Record<ApprovalSetting, string>;
  onChange: (setting: AgentApprovalSetting | undefined) => void;
}) {
  const classes = useStyles();
  const reasonId = useId();
  return (
    <div className={classes.row} role="group" aria-label={label}>
      <Flex direction="column" gap="1">
        <Text weight="bold">{label}</Text>
        <Text variant="body-small" color="secondary">
          {description}
        </Text>
        {note && (
          <Text variant="body-small" color="secondary">
            {note}
          </Text>
        )}
      </Flex>
      <span className={classes.cell}>
        <ApprovalPills
          aria-label={groupLabel}
          options={AGENT_APPROVAL_SETTINGS}
          value={value}
          disabledOptions={blocker && value !== 'Allow' ? ['Allow'] : undefined}
          describedBy={blocker ? reasonId : undefined}
          onChange={onChange}
          hintIds={hintIds}
        />
        {blocker && (
          <Text id={reasonId} variant="body-small" color="secondary">
            {blocker}
          </Text>
        )}
        {value === 'Allow' && !blocker && liftsConnectorAsk(tools) && (
          <Text variant="body-small" color="secondary">
            An exception for this agent: the tools here that ask run without
            asking once saved.
          </Text>
        )}
        {value && (
          <Button
            variant="tertiary"
            size="small"
            aria-label={resetLabel}
            onPress={() => onChange(undefined)}
          >
            {resetText}
          </Button>
        )}
      </span>
    </div>
  );
}

/** A tool that asks whatever the agent says: built in, governance, unreadable. */
function isPlatformAsk(tool: Pick<ToolSummary, 'approval'>): boolean {
  const source = tool.approval?.source;
  return (
    source === 'builtin' || source === 'governance' || source === 'unavailable'
  );
}

/**
 * Whether an Allow on a whole connector or the default lifts a connector's
 * Ask among these tools: an exception, said beside its pills.
 */
function liftsConnectorAsk(tools: readonly ToolSummary[]): boolean {
  return tools.some(
    tool =>
      !isPlatformAsk(tool) &&
      tool.approval?.source !== 'agent-exception' &&
      (tool.approval?.admin?.setting ?? tool.approval?.setting) === 'ask',
  );
}

/**
 * *How it asks* on the Tools step (tool approval, milestone 2): the list's
 * default on top, then each whole connector the agent has and each tool it
 * resolves to, with `Allow · Ask · Block` pills showing what applies now.
 * The words are muster's settings' everywhere; muster decides. *Allow* over
 * a connector's `Ask` is an exception only that connector's admins can give
 * (`connectorAdmin`), and nothing lifts a built-in or a governance `Ask`.
 */
export function AgentApprovalSettings({
  selection,
  draft,
  report,
  servers,
  labelOf,
  onSetting,
  onDefault,
  viaGit,
  notEnforced,
  pending,
}: AgentApprovalSettingsProps) {
  const classes = useStyles();
  const id = useId();
  const hintIds = useMemo(
    () =>
      Object.fromEntries(
        AGENT_APPROVAL_SETTINGS.map(setting => [setting, `${id}-${setting}`]),
      ) as Record<ApprovalSetting, string>,
    [id],
  );
  const connectorEntries = selection.filter(
    selector => parseSelector(selector)?.kind === 'server',
  );
  const resolution = useMemo(
    () => ({
      tools: report.tools,
      unmatched: [],
      truncated: report.truncated,
      isLoading: false,
      status: 'resolved' as const,
    }),
    [report.tools, report.truncated],
  );
  const defaultBlocker = allowBlockerOfMany(report.tools, { labelOf, viaGit });

  let body;
  if (
    report.status === 'loading' ||
    (report.status === 'idle' && selection.length > 0)
  ) {
    body = <LoadingIndicator label="Reading how the tools ask…" />;
  } else if (report.status === 'unsupported') {
    body = (
      <Alert
        status="info"
        title="Settings per agent are not available here"
        description="This environment's muster does not report an agent's settings yet, so the connectors' settings apply to this agent as they are."
      />
    );
  } else if (report.status === 'error') {
    body = (
      <Alert
        status="warning"
        title="Could not read how the tools ask"
        description={report.error}
      />
    );
  } else {
    body = (
      <Flex direction="column" gap="3">
        <EntryRow
          label="Default"
          groupLabel="Default approval"
          resetLabel="Remove the default approval"
          resetText="No default"
          description="For every tool below without a setting of its own."
          value={draft.default}
          tools={report.tools}
          blocker={defaultBlocker?.replace('can allow this', 'can allow it')}
          hintIds={hintIds}
          onChange={onDefault}
        />
        {connectorEntries.map(selector => {
          const server = parseSelector(selector)!.name;
          const tools = report.tools.filter(tool => tool.server === server);
          const platformAsks = platformAskCount(tools);
          const own = draft.settings[selector];
          return (
            <EntryRow
              key={selector}
              label={labelOf(server)}
              groupLabel={`Approval for ${labelOf(server)}`}
              resetLabel={`Reset approval for ${labelOf(server)}`}
              resetText="Reset"
              description={
                own
                  ? 'Every tool of it, new ones too, unless a tool has its own setting.'
                  : "No setting: the connector's own settings apply."
              }
              note={
                platformAsks > 0
                  ? `${platformAsks} of its tools always ask when an agent calls them, whatever is set here.`
                  : undefined
              }
              value={own}
              tools={tools}
              blocker={allowBlockerOfMany(tools, { labelOf, viaGit })}
              hintIds={hintIds}
              onChange={setting => onSetting(selector, setting)}
            />
          );
        })}
        <ToolsetResolutionList
          resolution={resolution}
          servers={servers}
          emptyText="The selection resolves to no tools for you right now."
          trailingOf={tool => (
            <ToolPills
              tool={tool}
              draft={draft}
              hintIds={hintIds}
              labelOf={labelOf}
              viaGit={viaGit}
              onSetting={onSetting}
            />
          )}
        />
      </Flex>
    );
  }

  return (
    <section aria-label="How it asks">
      <Flex direction="column" gap="2">
        <Text as="h3" variant="title-x-small" weight="bold">
          How it asks
        </Text>
        <Text variant="body-small" color="secondary">
          The stricter of the connector's setting and the agent's applies. Only
          a connector's admins can let this agent skip one of its Asks.
        </Text>
        <ul className={classes.legend} aria-label="Settings">
          {AGENT_APPROVAL_SETTINGS.map(setting => (
            <li key={setting} id={hintIds[setting]}>
              <Text variant="body-small">
                <strong>{setting}</strong> — {APPROVAL_SETTING_HINTS[setting]}
              </Text>
            </li>
          ))}
        </ul>
        {report.governance === 'trusted' && (
          <Text variant="body-small" color="secondary">
            {TRUSTED_AGENT_NOTE}
          </Text>
        )}
        {pending && !notEnforced && (
          <Text variant="body-small" color="secondary">
            {APPROVAL_PENDING_NOTE}
          </Text>
        )}
        {notEnforced && (
          <Alert
            status="warning"
            title="Not enforced"
            description={APPROVAL_NOT_ENFORCED_NOTE}
          />
        )}
        {body}
      </Flex>
    </section>
  );
}
