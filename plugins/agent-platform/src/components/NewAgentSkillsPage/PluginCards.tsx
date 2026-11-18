import { ReactNode, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
  Button,
  Checkbox,
  Flex,
  SearchField,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  CatalogNoMatch,
  countNoun,
  ExternalLink,
  isSearchableList,
  joinNames,
  shortSha,
  ShowMore,
  CommitSha,
} from '@giantswarm/backstage-plugin-ui-react';

import type { AgentPluginEntry } from '../../lib/agentManager';
import {
  DiscoveredPlugin,
  PluginPickState,
  PluginSkill,
  pluginEntryKey,
  pluginEntryName,
  pluginId,
  pluginSelectionOf,
  pluginSkillsOf,
  searchPlugins,
  SelectedPlugin,
  skillsByRepo,
} from '../../lib/plugins';
import { canonicalRepoUrl, DiscoveredSkill, repoSlug } from '../../lib/skills';
import {
  SelectableCard,
  SelectableCardGrid,
  StaticCard,
  useClampedText,
  useSelectableCardStyles,
} from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  heading: {
    marginBottom: theme.spacing(1),
  },
  actions: {
    marginTop: theme.spacing(1),
  },
  // One bordered list per group, a row per plugin: a package's skills fold
  // under its row, so a package of 25 skills is one line until it is opened
  // and never pushes the other plugins off the step.
  rows: {
    border: '1px solid var(--bui-border-1)',
    borderRadius: 'var(--bui-radius-3)',
    background: 'var(--bui-bg-neutral-1)',
  },
  row: {
    paddingLeft: theme.spacing(1.5),
    '& + &': {
      borderTop: '1px solid var(--bui-border-1)',
    },
  },
  // On the first line of the plugin's name: the Accordion's padding, and the
  // 2px by which the name's line is taller than the checkbox.
  checkbox: {
    flex: 'none',
    paddingTop: 'calc(var(--bui-space-3) + 2px)',
  },
  details: {
    minWidth: 0,
    flex: '1 1 auto',
  },
  // A row without skills has no Accordion; the same padding keeps it aligned.
  plain: {
    padding: 'var(--bui-space-3)',
  },
  notes: {
    marginTop: theme.spacing(0.5),
  },
  // bui gives an expanded panel 4px of padding; the cards need more room from
  // the row's lines above them (as `skillsPanel` on the skills above).
  panel: {
    '[data-expanded="true"] > &': {
      marginTop: theme.spacing(1),
    },
  },
}));

/** Where a plugin lives and the commit it is (or will be) pinned to. */
function PluginSource({
  plugin,
  pinned,
}: {
  plugin: DiscoveredPlugin;
  /** The commit an edited agent is pinned to, when the repo has moved on. */
  pinned?: string;
}) {
  const classes = useSelectableCardStyles();
  return (
    <>
      <Text variant="body-x-small" color="secondary">
        {repoSlug(plugin.repoUrl)}
        {plugin.path && (
          <>
            {' · '}
            <span className={classes.code}>{plugin.path}</span>
          </>
        )}
      </Text>
      {pinned ? (
        <Text variant="body-x-small" color="secondary">
          pinned at{' '}
          <CommitSha value={pinned} copy={false} className={classes.code} />
          {' · '}
          {plugin.ref} is at{' '}
          <CommitSha
            value={plugin.commit}
            copy={false}
            className={classes.code}
          />
        </Text>
      ) : (
        <Text
          variant="body-x-small"
          color="secondary"
          aria-label={`Pinned to commit ${shortSha(plugin.commit)} of ${plugin.ref}`}
        >
          {plugin.ref}{' '}
          <span className={classes.code}>
            @<CommitSha value={plugin.commit} copy={false} />
          </span>
        </Text>
      )}
    </>
  );
}

/** A skill card's name and its description, cut to a few lines. */
function useSkillCardBody(skill: PluginSkill) {
  const description = useClampedText({
    text: skill.description,
    subject: skill.name,
  });
  return {
    body: (
      <>
        <Text weight="bold">{skill.name}</Text>
        {description.content}
      </>
    ),
    toggle: description.toggle,
    describedById: description.describedById,
  };
}

/** A skill of an Agent Plugins package: a card the person ticks. */
function PackageSkillCard({
  skill,
  selected,
  disabled,
  onSelect,
}: {
  skill: PluginSkill;
  selected: boolean;
  /** A whole-plugin entry: every skill loads, so none is picked on its own. */
  disabled: boolean;
  onSelect: () => void;
}) {
  const { body, toggle, describedById } = useSkillCardBody(skill);
  return (
    <SelectableCard
      role="checkbox"
      selected={selected}
      disabled={disabled}
      ariaLabel={skill.name}
      onSelect={onSelect}
      hoverAction={toggle}
      describedById={describedById}
    >
      {body}
    </SelectableCard>
  );
}

/** A skill of a Claude Code plugin: shown, never picked on its own. */
function BundledSkillCard({ skill }: { skill: PluginSkill }) {
  const { body, toggle } = useSkillCardBody(skill);
  return (
    <StaticCard>
      {body}
      {toggle && <div>{toggle}</div>}
    </StaticCard>
  );
}

/** What of a plugin the agent gets, as its row's metadata line says it. */
function selectionLine(
  plugin: DiscoveredPlugin,
  skills: PluginSkill[],
  state: PluginPickState,
): string {
  if (plugin.format === 'claude-code') {
    return skills.length > 0
      ? `Claude Code plugin · Loads whole: ${countNoun(
          skills.length,
          'skill',
        )}, plus its commands, hooks and subagents`
      : 'Claude Code plugin · Loads whole, with its commands, hooks, subagents and skills';
  }
  const total = skills.length;
  switch (state.selection) {
    case 'whole':
      return 'Agent Plugins · Whole plugin, as pinned';
    case 'empty':
      return 'Agent Plugins · No skills selected';
    case 'all':
      return `Agent Plugins · All ${countNoun(total, 'skill')} at this commit`;
    default:
      if (total === 0) {
        return 'Agent Plugins · No skills in its skills directory';
      }
      return state.selection === 'some'
        ? `Agent Plugins · ${state.listed.length} of ${countNoun(
            total,
            'skill',
          )} selected`
        : `Agent Plugins · ${countNoun(total, 'skill')}`;
  }
}

/**
 * The sentences under a row's metadata line: what the line cannot say about
 * an edited agent's entry, and what "all" leaves out.
 */
function selectionNotes(
  plugin: DiscoveredPlugin,
  pick: SelectedPlugin | undefined,
  state: PluginPickState,
): string[] {
  if (plugin.format === 'claude-code') {
    // Picked at a commit where the directory was an Agent Plugins package.
    return pick && pick.skills.length > 0
      ? [
          `At its pinned commit it is an Agent Plugins package, and the agent loads only ${joinNames(
            pick.skills,
          )}. Clear its checkbox and pick it again to load it whole at the latest commit.`,
        ]
      : [];
  }
  const notes: string[] = [];
  if (state.selection === 'all') {
    // Until agent-manager stores a whole package
    // (giantswarm/giantswarm#39190), "all" is the list of names.
    notes.push(
      'Skills added to the plugin later are not included until you pick them.',
    );
  }
  if (state.selection === 'whole') {
    notes.push(
      'The agent loads it whole at its pinned commit. To pick skills instead, clear its checkbox and pick them at the latest commit.',
    );
  }
  if (state.selection === 'empty') {
    notes.push(
      "The agent's entry for it selects no skills, so the agent loads none of them.",
    );
  }
  if (state.stale.length > 0) {
    notes.push(
      `Also selected at its pinned commit, and no longer in the plugin: ${joinNames(
        state.stale,
      )}.`,
    );
  }
  return notes;
}

type PluginRowProps = {
  plugin: DiscoveredPlugin;
  /** The skills the row shows: every one, or a search's matches. */
  skills: PluginSkill[];
  /** Every skill the plugin brings, which its counts are of. */
  allSkills: PluginSkill[];
  pick: SelectedPlugin | undefined;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onTogglePlugin: (plugin: DiscoveredPlugin) => void;
  onSelectAllPluginSkills: (plugin: DiscoveredPlugin) => void;
  onTogglePluginSkill: (plugin: DiscoveredPlugin, skill: string) => void;
};

/**
 * One plugin: a checkbox for the plugin as a whole beside a fold-out (bui's
 * Accordion, as the skill repositories above use) whose trigger names the
 * plugin and what of it the agent gets, and whose panel holds its skills.
 *
 * A Claude Code plugin's checkbox is the plugin itself; its skills are shown
 * without checkboxes, since it loads whole. An Agent Plugins package's
 * checkbox picks every skill it lists at this commit (checked), some of them
 * (mixed) or none; its skills are picked one by one in the panel.
 */
function PluginRow({
  plugin,
  skills,
  allSkills,
  pick,
  isExpanded,
  onExpandedChange,
  onTogglePlugin,
  onSelectAllPluginSkills,
  onTogglePluginSkill,
}: PluginRowProps) {
  const classes = useStyles();
  const isPackage = plugin.format === 'agent-plugins';
  // A Claude Code plugin is picked whole or not at all.
  const state: PluginPickState = isPackage
    ? pluginSelectionOf(plugin, pick)
    : { selection: pick ? 'whole' : 'none', listed: [], stale: [] };
  const { selection } = state;
  const listed = new Set(state.listed);
  const pin = pick?.plugin.commit;
  const pinned = pin && pin !== plugin.commit ? pin : undefined;
  const isChecked = selection === 'whole' || selection === 'all';

  // Checked, or nothing left to pick: the plugin goes. Otherwise a Claude
  // Code plugin is added, and a package gets every skill it lists.
  const onChange = () => {
    if (isChecked || !isPackage || allSkills.length === 0) {
      onTogglePlugin(plugin);
    } else {
      onSelectAllPluginSkills(plugin);
    }
  };

  const header = (
    <Flex direction="column" gap="1">
      <Text weight="bold">{plugin.name}</Text>{' '}
      <Text
        variant="body-small"
        color={selection === 'none' ? 'secondary' : 'primary'}
      >
        {selectionLine(plugin, allSkills, state)}
      </Text>
    </Flex>
  );
  const details = (
    <Flex direction="column" gap="1" className={classes.notes}>
      {selectionNotes(plugin, pick, state).map(note => (
        <Text key={note} variant="body-small" color="secondary">
          {note}
        </Text>
      ))}
      <PluginSource plugin={plugin} pinned={pinned} />
    </Flex>
  );

  return (
    <div role="listitem" className={classes.row}>
      <Flex align="start" gap="1">
        <div className={classes.checkbox}>
          <Checkbox
            aria-label={`Plugin ${plugin.name}`}
            isSelected={isChecked}
            isIndeterminate={selection === 'some' || selection === 'empty'}
            // A package without skills has nothing to pick, unless an edited
            // agent carries it and it can still be cleared.
            isDisabled={isPackage && allSkills.length === 0 && !pick}
            onChange={onChange}
          />
        </div>
        <div className={classes.details}>
          {allSkills.length > 0 ? (
            <Accordion
              id={pluginId(plugin)}
              isExpanded={isExpanded}
              onExpandedChange={onExpandedChange}
            >
              <AccordionTrigger level={5}>{header}</AccordionTrigger>
              {details}
              <AccordionPanel className={classes.panel}>
                {/* Mounted only while open: a folded package of dozens of
                    skills costs nothing. */}
                {isExpanded && skills.length > 0 && (
                  <ShowMore items={skills} noun="skill">
                    {visible =>
                      isPackage ? (
                        <SelectableCardGrid
                          role="group"
                          ariaLabel={`Skills of plugin ${plugin.name}`}
                          minWidth={240}
                        >
                          {visible.map(skill => (
                            <PackageSkillCard
                              key={skill.name}
                              skill={skill}
                              selected={
                                selection === 'whole' || listed.has(skill.name)
                              }
                              disabled={selection === 'whole'}
                              onSelect={() =>
                                onTogglePluginSkill(plugin, skill.name)
                              }
                            />
                          ))}
                        </SelectableCardGrid>
                      ) : (
                        <SelectableCardGrid
                          role="list"
                          ariaLabel={`Skills of plugin ${plugin.name}`}
                          minWidth={240}
                        >
                          {visible.map(skill => (
                            <BundledSkillCard key={skill.name} skill={skill} />
                          ))}
                        </SelectableCardGrid>
                      )
                    }
                  </ShowMore>
                )}
              </AccordionPanel>
            </Accordion>
          ) : (
            <div className={classes.plain}>
              {header}
              {details}
            </div>
          )}
        </div>
      </Flex>
    </div>
  );
}

/** A group of plugin rows of one format, with what that format means. */
function PluginGroup({
  title,
  children,
  description,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="2">
      <div>
        <Text as="h4" weight="bold" variant="body-medium">
          {title}
        </Text>
        <Text as="p" variant="body-small" color="secondary">
          {description}
        </Text>
      </div>
      <div role="list" aria-label={title} className={classes.rows}>
        {children}
      </div>
    </Flex>
  );
}

/**
 * The plugins found in the configured skill repositories, Claude Code plugins
 * and Agent Plugins packages apart, since they are picked differently. Each is
 * pinned to the commit its row shows, like a skill. A search runs over the
 * plugins' names and their skills' names and descriptions, and opens every
 * plugin with a matching skill.
 */
export function PluginCards({
  plugins,
  catalog,
  selected,
  onTogglePlugin,
  onSelectAllPluginSkills,
  onTogglePluginSkill,
}: {
  plugins: DiscoveredPlugin[];
  /** The skill catalogue, which a Claude Code plugin's skills are read from. */
  catalog: DiscoveredSkill[];
  selected: SelectedPlugin[];
  onTogglePlugin: (plugin: DiscoveredPlugin) => void;
  onSelectAllPluginSkills: (plugin: DiscoveredPlugin) => void;
  onTogglePluginSkill: (plugin: DiscoveredPlugin, skill: string) => void;
}) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  // The rows opened by hand without a search, and those of the current search
  // (seeded with the plugins it found skills in), apart: a search opens its
  // matches without closing what the person opened, which shows again once
  // the search is cleared.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [searched, setSearched] = useState<{
    query: string;
    ids: ReadonlySet<string>;
  }>({ query: '', ids: new Set() });
  const rows = useMemo(() => {
    const byRepo = skillsByRepo(catalog);
    return plugins.map(plugin => ({
      plugin,
      skills: pluginSkillsOf(
        plugin,
        byRepo.get(canonicalRepoUrl(plugin.repoUrl)) ?? [],
      ),
    }));
  }, [plugins, catalog]);
  const allSkills = useMemo(
    () => new Map(rows.map(row => [pluginId(row.plugin), row.skills])),
    [rows],
  );
  const matches = useMemo(() => searchPlugins(rows, trimmed), [rows, trimmed]);
  if (plugins.length === 0) {
    return null;
  }
  const byId = new Map(selected.map(pick => [pluginId(pick.plugin), pick]));
  // Plugins and their skills are what is searched, so both count.
  const entries = rows.reduce((sum, row) => sum + 1 + row.skills.length, 0);

  let expanded = opened;
  if (trimmed) {
    expanded =
      searched.query === trimmed
        ? searched.ids
        : new Set(
            matches
              .filter(match => match.hasSkillMatch)
              .map(match => pluginId(match.plugin)),
          );
  }
  const setExpanded = (id: string, isExpanded: boolean) => {
    const next = new Set(expanded);
    if (isExpanded) {
      next.add(id);
    } else {
      next.delete(id);
    }
    if (trimmed) {
      setSearched({ query: trimmed, ids: next });
    } else {
      setOpened(next);
    }
  };

  const rowsOf = (format: DiscoveredPlugin['format']) =>
    matches
      .filter(match => match.plugin.format === format)
      .map(match => {
        const id = pluginId(match.plugin);
        return (
          <PluginRow
            key={id}
            plugin={match.plugin}
            skills={match.skills}
            allSkills={allSkills.get(id) ?? match.skills}
            pick={byId.get(id)}
            isExpanded={expanded.has(id)}
            onExpandedChange={isExpanded => setExpanded(id, isExpanded)}
            onTogglePlugin={onTogglePlugin}
            onSelectAllPluginSkills={onSelectAllPluginSkills}
            onTogglePluginSkill={onTogglePluginSkill}
          />
        );
      });
  const claudeRows = rowsOf('claude-code');
  const packageRows = rowsOf('agent-plugins');

  return (
    <Flex direction="column" gap="3">
      <Text as="h3" weight="bold">
        Plugins
      </Text>
      {isSearchableList(entries, trimmed !== '') && (
        <SearchField
          aria-label="Search plugins"
          placeholder="Search plugins and their skills…"
          value={query}
          onChange={setQuery}
        />
      )}
      {claudeRows.length > 0 && (
        <PluginGroup
          title="Claude Code plugins"
          description="Each loads whole, with its commands, hooks, subagents and skills, and runs on the Claude Code runtime only."
        >
          {claudeRows}
        </PluginGroup>
      )}
      {packageRows.length > 0 && (
        <PluginGroup
          title="Agent Plugins packages"
          description="Each gives the agent the skills you pick, on every runtime. A plugin that also has a Claude Code manifest is listed here, because every runtime loads it this way, without its commands, hooks and subagents."
        >
          {packageRows}
        </PluginGroup>
      )}
      {matches.length === 0 && (
        <CatalogNoMatch plural="plugins or skills" search={trimmed} />
      )}
    </Flex>
  );
}

/**
 * Editing only: the agent's plugins no configured repository lists, each kept
 * exactly as pinned unless removed.
 */
export function KeptPlugins({
  plugins,
  onRemove,
}: {
  plugins: AgentPluginEntry[];
  onRemove: (plugin: AgentPluginEntry) => void;
}) {
  const classes = useSelectableCardStyles();
  const styles = useStyles();
  if (plugins.length === 0) {
    return null;
  }
  return (
    <div>
      <Text
        as="h4"
        weight="bold"
        variant="body-small"
        className={styles.heading}
      >
        Plugins also on this agent
      </Text>
      <SelectableCardGrid
        role="list"
        ariaLabel="Plugins from elsewhere"
        minWidth={240}
      >
        {plugins.map(plugin => {
          const name = pluginEntryName(plugin);
          return (
            <StaticCard key={pluginEntryKey(plugin)}>
              <Text weight="bold">{name}</Text>
              <Text variant="body-x-small" color="secondary">
                {plugin.git ? (
                  <ExternalLink href={plugin.git.url}>
                    {repoSlug(plugin.git.url)}
                  </ExternalLink>
                ) : (
                  <span className={classes.code}>{plugin.oci}</span>
                )}
                {plugin.path && (
                  <>
                    {' · '}
                    <span className={classes.code}>{plugin.path}</span>
                  </>
                )}
              </Text>
              <Text variant="body-x-small" color="secondary">
                pinned at{' '}
                <CommitSha
                  value={plugin.git?.commit ?? plugin.oci ?? ''}
                  copy={false}
                  className={classes.code}
                />
                {plugin.skills && plugin.skills.length > 0 && (
                  <> · skills {plugin.skills.join(', ')}</>
                )}
              </Text>
              <div className={styles.actions}>
                <Button
                  variant="tertiary"
                  size="small"
                  aria-label={`Remove plugin ${name}`}
                  onPress={() => onRemove(plugin)}
                >
                  Remove
                </Button>
              </div>
            </StaticCard>
          );
        })}
      </SelectableCardGrid>
    </div>
  );
}
