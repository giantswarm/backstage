import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Flex,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  ServerSignIn,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';

import {
  CatalogueGroup,
  selectorForTool,
  ServerBucket,
  workflowNameOf,
} from '../../lib/toolset';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';
import { ToolMarkers } from '../ToolsetResolutionList';

const useStyles = makeStyles(theme => ({
  groupTitle: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
  },
  subgroupHeading: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  serverCard: {
    marginBottom: theme.spacing(1.5),
  },
}));

function ToolCard({
  tool,
  selected,
  onSelect,
}: {
  tool: ToolSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const classes = useSelectableCardStyles();
  const isWorkflow = selectorForTool(tool).startsWith('workflow:');
  const title = isWorkflow ? workflowNameOf(tool.name) : tool.name;
  return (
    <SelectableCard
      role="checkbox"
      selected={selected}
      ariaLabel={`${isWorkflow ? 'Workflow' : 'Tool'} ${title}`}
      onSelect={onSelect}
    >
      <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
        <Text weight="bold" className={classes.code}>
          {title}
        </Text>
        <ToolMarkers tool={tool} />
      </Flex>
      {(tool.summary || tool.description) && (
        <Text variant="body-small" color="secondary">
          {tool.summary ?? tool.description}
        </Text>
      )}
    </SelectableCard>
  );
}

function ToolGrid({
  tools,
  ariaLabel,
  selected,
  onToggle,
}: {
  tools: ToolSummary[];
  ariaLabel: string;
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
}) {
  return (
    <SelectableCardGrid role="group" ariaLabel={ariaLabel} minWidth={260}>
      {tools.map(tool => {
        const selector = selectorForTool(tool);
        return (
          <ToolCard
            key={tool.name}
            tool={tool}
            selected={selected.has(selector)}
            onSelect={() => onToggle(selector)}
          />
        );
      })}
    </SelectableCardGrid>
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
  const classes = useStyles();
  const cardClasses = useSelectableCardStyles();
  const serverSelector = `server:${bucket.name}`;
  const wholeServerSelected = selected.has(serverSelector);

  return (
    <Flex direction="column" gap="2">
      <div className={classes.serverCard}>
        <SelectableCardGrid
          role="group"
          ariaLabel={`Whole server ${bucket.name}`}
          minWidth={260}
        >
          <SelectableCard
            role="checkbox"
            selected={wholeServerSelected}
            ariaLabel={`Server ${bucket.name}`}
            onSelect={() => onToggle(serverSelector)}
          >
            <Text weight="bold">
              Every tool of{' '}
              <span className={cardClasses.code}>{bucket.name}</span>
            </Text>
            <Text variant="body-small" color="secondary">
              {bucket.isFamily
                ? 'A federated family: one tool surface across the management clusters it runs on.'
                : 'Whatever this server exposes, now and after it adds tools.'}
            </Text>
            <Text variant="body-x-small" color="secondary">
              <span className={cardClasses.code}>{serverSelector}</span>
              {bucket.state ? ` · ${bucket.state}` : ''}
            </Text>
          </SelectableCard>
        </SelectableCardGrid>
      </div>

      <ServerTools
        bucket={bucket}
        installation={installation}
        signInAvailable={signInAvailable}
        wholeServerSelected={wholeServerSelected}
        selected={selected}
        onToggle={onToggle}
      />
    </Flex>
  );
}

/** Below the whole-server card: the sign-in, the tool cards, or why there are none. */
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
        {signInAvailable && bucket.canSignIn && !bucket.unknownServer && (
          <ServerSignIn serverName={bucket.name} installation={installation} />
        )}
      </Flex>
    );
  }
  if (bucket.tools.length > 0) {
    return (
      <ToolGrid
        tools={bucket.tools}
        ariaLabel={`Tools of ${bucket.name}`}
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

function ServerAccordions({
  group,
  query,
  installation,
  signInAvailable,
  selected,
  onToggle,
}: {
  group: CatalogueGroup;
  query: string;
  installation: string | undefined;
  signInAvailable: boolean;
  selected: ReadonlySet<string>;
  onToggle: (selector: string) => void;
}) {
  const keys = group.servers.map(bucket => `${group.key}/${bucket.name}`);
  const signature = keys.join('|');

  // Controlled expansion, re-seeded like the Skills step: a search must reveal
  // its matches, and a server whose whole-server card is selected stays
  // readable. Collapsed by default when nothing is searched — a gateway lists
  // hundreds of tools, and the presets above are the usual starting point.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  useEffect(() => {
    setExpandedKeys(new Set(query === '' ? [] : keys));
    // signature stands in for keys (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, signature]);

  return (
    <AccordionGroup
      allowsMultiple
      expandedKeys={expandedKeys}
      onExpandedChange={next => setExpandedKeys(new Set(next as Set<string>))}
    >
      {group.servers.map(bucket => {
        const id = `${group.key}/${bucket.name}`;
        const isSelected = selected.has(`server:${bucket.name}`);
        const pickedTools = bucket.tools.filter(tool =>
          selected.has(selectorForTool(tool)),
        ).length;
        const summary = bucket.needsSignIn
          ? 'sign in to see its tools'
          : `${bucket.tools.length} tool${bucket.tools.length === 1 ? '' : 's'}`;
        let picked = '';
        if (isSelected) {
          picked = ' · whole server selected';
        } else if (pickedTools > 0) {
          picked = ` · ${pickedTools} selected`;
        }
        return (
          <Accordion id={id} key={id}>
            <AccordionTrigger>
              {bucket.name}
              {bucket.isFamily ? ' (family)' : ''} — {summary}
              {picked}
            </AccordionTrigger>
            <AccordionPanel>
              <ServerPanel
                bucket={bucket}
                installation={installation}
                signInAvailable={signInAvailable}
                selected={selected}
                onToggle={onToggle}
              />
            </AccordionPanel>
          </Accordion>
        );
      })}
    </AccordionGroup>
  );
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
 * Infrastructure, Agent Platform (with muster's own core tools as a warned
 * *Platform administration* sub-group), Registered servers and Workflows.
 * Every registered server is a row, signed in to or not; an *Auth Required*
 * server offers the muster plugin's Sign in right here, and its tools become
 * selectable once the callback lands.
 */
export function ToolCatalogue({
  groups,
  query,
  installation,
  signInAvailable,
  selected,
  onToggle,
}: ToolCatalogueProps) {
  const classes = useStyles();

  return (
    <Flex direction="column" gap="4">
      {groups.map(group => (
        <div key={group.key}>
          <Text
            as="h3"
            variant="title-x-small"
            weight="bold"
            className={classes.groupTitle}
          >
            {group.title}
          </Text>
          {group.servers.length > 0 && (
            <ServerAccordions
              group={group}
              query={query}
              installation={installation}
              signInAvailable={signInAvailable}
              selected={selected}
              onToggle={onToggle}
            />
          )}
          {group.platformAdministration.length > 0 && (
            <div>
              <Text
                as="h4"
                weight="bold"
                variant="body-small"
                className={classes.subgroupHeading}
              >
                Platform administration
              </Text>
              <Flex direction="column" gap="2">
                <Alert
                  status="warning"
                  title="These tools manage the platform itself"
                  description="muster's own core tools register and control servers, run and change workflows, and read and change configuration. No shipped preset includes them except Full gateway; give them to an agent deliberately, one by one."
                />
                <ToolGrid
                  tools={group.platformAdministration}
                  ariaLabel="Platform administration tools"
                  selected={selected}
                  onToggle={onToggle}
                />
              </Flex>
            </div>
          )}
          {group.workflows.length > 0 && (
            <ToolGrid
              tools={group.workflows}
              ariaLabel="Workflows"
              selected={selected}
              onToggle={onToggle}
            />
          )}
        </div>
      ))}
    </Flex>
  );
}
