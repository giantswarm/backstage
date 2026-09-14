import { Alert, Flex, Text } from '@backstage/ui';
import {
  ServerSignIn,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';

import {
  CatalogueGroup,
  countNoun,
  groupWorkflows,
  selectorForTool,
  ServerBucket,
  serverSelector,
  workflowNameOf,
} from '../../lib/toolset';
import { Disclosures, type DisclosureEntry } from '../Disclosures';
import {
  SelectableRow,
  SelectableRowList,
  useSelectableCardStyles,
} from '../SelectableCard';
import { ShowMore } from '../ShowMore';
import { ToolMarkers } from '../ToolsetResolutionList';

function ToolRow({
  tool,
  selected,
  onSelect,
}: {
  tool: ToolSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const isWorkflow = selectorForTool(tool).startsWith('workflow:');
  const title = isWorkflow ? workflowNameOf(tool.name) : tool.name;
  return (
    <SelectableRow
      role="checkbox"
      selected={selected}
      ariaLabel={`${isWorkflow ? 'Workflow' : 'Tool'} ${title}`}
      onSelect={onSelect}
      title={title}
      code
      meta={<ToolMarkers tool={tool} />}
      summary={tool.summary ?? tool.description}
    />
  );
}

/** Compact rows, the first few at once and the rest behind *Show all*. */
function ToolRows({
  tools,
  ariaLabel,
  noun,
  selected,
  onToggle,
}: {
  tools: ToolSummary[];
  ariaLabel: string;
  noun: 'tool' | 'workflow';
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
}) {
  return (
    <ShowMore items={tools} noun={noun}>
      {visible => (
        <SelectableRowList role="group" ariaLabel={ariaLabel}>
          {visible.map(tool => {
            const selector = selectorForTool(tool);
            return (
              <ToolRow
                key={tool.name}
                tool={tool}
                selected={selected.has(selector)}
                onSelect={() => onToggle(selector)}
              />
            );
          })}
        </SelectableRowList>
      )}
    </ShowMore>
  );
}

function pickedSuffix(count: number, whole = false): string {
  if (whole) {
    return ' · whole server selected';
  }
  return count > 0 ? ` · ${count} selected` : '';
}

function pickedTools(
  tools: ToolSummary[],
  selected: ReadonlySet<string>,
): number {
  return tools.filter(tool => selected.has(selectorForTool(tool))).length;
}

/** Below the whole-server row: the sign-in, the tool rows, or why there are none. */
function ServerTools({
  bucket,
  installation,
  signInAvailable,
  wholeServerSelected,
  selected,
  onToggle,
}: {
  bucket: ServerBucket;
  installation: string | undefined;
  signInAvailable: boolean;
  wholeServerSelected: boolean;
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
}) {
  if (bucket.needsSignIn) {
    return (
      <Flex direction="column" gap="2">
        <Alert
          status="info"
          title={`Sign in to see the tools of ${bucket.name}`}
          description={
            wholeServerSelected
              ? `Selected without a sign-in: the whole server is part of the toolset and resolves for people who have access to ${bucket.name}. For you, the resolved list is incomplete until you sign in. Individual tools can be picked once they are listed.`
              : `Its tools are listed once your session is signed in to it. The whole server can be selected without signing in — it then resolves for the people who have access to it — but individual tools can only be picked once they are listed.`
          }
        />
        {/* muster naming the server in servers_requiring_auth is reason enough
            to offer its sign-in — a muster running from configuration rather
            than CRs has no MCPServer resource to go with it. */}
        {signInAvailable && bucket.canSignIn && (
          <ServerSignIn serverName={bucket.name} installation={installation} />
        )}
      </Flex>
    );
  }
  if (bucket.tools.length > 0) {
    return (
      <ToolRows
        tools={bucket.tools}
        ariaLabel={`Tools of ${bucket.name}`}
        noun="tool"
        selected={selected}
        onToggle={onToggle}
      />
    );
  }
  return (
    <Text variant="body-small" color="secondary">
      No tools listed for this server right now
      {bucket.state ? ` (${bucket.state})` : ''}. The whole server can still be
      selected.
    </Text>
  );
}

function ServerPanel({
  bucket,
  installation,
  signInAvailable,
  selected,
  onToggle,
}: {
  bucket: ServerBucket;
  installation: string | undefined;
  signInAvailable: boolean;
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
}) {
  const cardClasses = useSelectableCardStyles();
  const selector = serverSelector(bucket.name);
  const wholeServerSelected = selected.has(selector);
  return (
    <>
      <SelectableRowList role="group" ariaLabel={`Whole server ${bucket.name}`}>
        <SelectableRow
          role="checkbox"
          selected={wholeServerSelected}
          ariaLabel={`Server ${bucket.name}`}
          onSelect={() => onToggle(selector)}
          title={`Every tool of ${bucket.name}`}
          meta={
            <Text variant="body-x-small" color="secondary">
              <span className={cardClasses.code}>{selector}</span>
              {bucket.state ? ` · ${bucket.state}` : ''}
            </Text>
          }
          summary={
            bucket.isFamily
              ? 'A federated family: one tool surface across the management clusters it runs on.'
              : 'Whatever this server exposes, now and after it adds tools.'
          }
        />
      </SelectableRowList>
      <ServerTools
        bucket={bucket}
        installation={installation}
        signInAvailable={signInAvailable}
        wholeServerSelected={wholeServerSelected}
        selected={selected}
        onToggle={onToggle}
      />
    </>
  );
}

function serverEntries(
  group: CatalogueGroup,
  props: Pick<
    ToolCatalogueProps,
    'installation' | 'signInAvailable' | 'selected' | 'onToggle'
  >,
): DisclosureEntry[] {
  return group.servers.map(bucket => {
    const whole = props.selected.has(serverSelector(bucket.name));
    const summary = bucket.needsSignIn
      ? 'sign in to see its tools'
      : countNoun(bucket.tools.length, 'tool');
    return {
      key: `${group.key}/${bucket.name}`,
      trigger: `${bucket.name}${bucket.isFamily ? ' (family)' : ''} — ${summary}${pickedSuffix(
        pickedTools(bucket.tools, props.selected),
        whole,
      )}`,
      panel: () => (
        <ServerPanel
          bucket={bucket}
          installation={props.installation}
          signInAvailable={props.signInAvailable}
          selected={props.selected}
          onToggle={props.onToggle}
        />
      ),
    };
  });
}

/** muster's own core tools: warned, collapsed, selectable one by one (D7). */
function platformAdministrationEntry(
  group: CatalogueGroup,
  selected: ReadonlySet<string>,
  onToggle: (selector: string) => void,
): DisclosureEntry {
  const tools = group.platformAdministration;
  return {
    key: `${group.key}/platform-administration`,
    trigger: `Platform administration — ${countNoun(
      tools.length,
      'tool',
    )} of muster itself${pickedSuffix(pickedTools(tools, selected))}`,
    panel: () => (
      <>
        <Alert
          status="warning"
          title="These tools manage the platform itself"
          description="muster's own core tools register and control servers, run and change workflows, and read and change configuration. No shipped preset includes them except Full gateway; give them to an agent deliberately, one by one."
        />
        <ToolRows
          tools={tools}
          ariaLabel="Platform administration tools"
          noun="tool"
          selected={selected}
          onToggle={onToggle}
        />
      </>
    ),
  };
}

/**
 * The workflows, grouped by name prefix when there are enough of them to need
 * it — one collapsed group per prefix with its count — and one plain list when
 * there are not.
 */
function Workflows({
  workflows,
  query,
  selected,
  onToggle,
}: {
  workflows: ToolSummary[];
  query: string;
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
}) {
  const groups = groupWorkflows(workflows);
  if (!groups) {
    return (
      <ToolRows
        tools={workflows}
        ariaLabel="Workflows"
        noun="workflow"
        selected={selected}
        onToggle={onToggle}
      />
    );
  }
  return (
    <Disclosures
      nested
      query={query}
      entries={groups.map(group => ({
        key: `workflows/${group.key}`,
        trigger: `${group.label} — ${countNoun(
          group.workflows.length,
          'workflow',
        )}${pickedSuffix(pickedTools(group.workflows, selected))}`,
        panel: () => (
          <ToolRows
            tools={group.workflows}
            ariaLabel={`Workflows ${group.label}`}
            noun="workflow"
            selected={selected}
            onToggle={onToggle}
          />
        ),
      }))}
    />
  );
}

/** The trigger line of a group: what it holds, and how much of it is picked. */
export function groupSummary(
  group: CatalogueGroup,
  selected: ReadonlySet<string>,
): string {
  const parts: string[] = [];
  if (group.servers.length > 0) {
    parts.push(countNoun(group.servers.length, 'server'));
    const tools = group.servers.reduce(
      (sum, bucket) => sum + bucket.tools.length,
      0,
    );
    const awaiting = group.servers.filter(bucket => bucket.needsSignIn).length;
    // "0 tools" next to "1 awaiting sign-in" would read as a contradiction.
    if (tools > 0 || awaiting === 0) {
      parts.push(countNoun(tools, 'tool'));
    }
    if (awaiting > 0) {
      parts.push(`${awaiting} awaiting sign-in`);
    }
  }
  if (group.platformAdministration.length > 0) {
    parts.push(
      `${countNoun(
        group.platformAdministration.length,
        'platform administration tool',
      )}`,
    );
  }
  if (group.workflows.length > 0) {
    parts.push(countNoun(group.workflows.length, 'workflow'));
  }
  const picked =
    group.servers.filter(bucket => selected.has(serverSelector(bucket.name)))
      .length +
    group.servers.reduce(
      (sum, bucket) => sum + pickedTools(bucket.tools, selected),
      0,
    ) +
    pickedTools(group.platformAdministration, selected) +
    pickedTools(group.workflows, selected);
  return `${parts.join(' · ')}${pickedSuffix(picked)}`;
}

export type ToolCatalogueProps = {
  groups: CatalogueGroup[];
  /** The active search term, for expansion re-seeding. */
  query: string;
  installation: string | undefined;
  /**
   * Whether the muster plugin's API is installed, and so whether the per-server
   * Sign in can be rendered at all (its hook reads `musterApiRef` directly).
   * Without it the registered servers are still listed from their CRs, just
   * without an affordance that could not work.
   */
  signInAvailable: boolean;
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
};

/**
 * The gateway's catalogue, grouped the way the platform thinks about it:
 * Infrastructure, Agent Platform (with muster's own core tools as a warned,
 * collapsed *Platform administration* entry), Registered servers and
 * Workflows (by name prefix). Every group is collapsed until the author opens
 * it or a search matches inside it, and every list of rows shows a first page
 * before the rest, so no state of the page renders hundreds of options at
 * once. Every registered server is a row, signed in to or not; an *Auth
 * Required* server offers the muster plugin's Sign in right here, and its tools
 * become selectable once the callback lands.
 */
export function ToolCatalogue(props: ToolCatalogueProps) {
  const { groups, query, selected, onToggle } = props;
  return (
    <Disclosures
      query={query}
      ariaLabel="Tool catalogue"
      entries={groups.map(group => ({
        key: group.key,
        trigger: `${group.title} — ${groupSummary(group, selected)}`,
        panel: () => (
          <>
            {group.servers.length > 0 && (
              <Disclosures
                nested
                query={query}
                entries={serverEntries(group, props)}
              />
            )}
            {group.platformAdministration.length > 0 && (
              <Disclosures
                nested
                query={query}
                entries={[
                  platformAdministrationEntry(group, selected, onToggle),
                ]}
              />
            )}
            {group.workflows.length > 0 && (
              <Workflows
                workflows={group.workflows}
                query={query}
                selected={selected}
                onToggle={onToggle}
              />
            )}
          </>
        ),
      }))}
    />
  );
}
