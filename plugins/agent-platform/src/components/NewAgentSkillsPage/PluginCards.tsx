import { ReactNode, useId, useMemo, useState } from 'react';
import {
  Button,
  ButtonIcon,
  Checkbox,
  Flex,
  SearchField,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import {
  CatalogNoMatch,
  countNoun,
  ExternalLink,
  isSearchableList,
  shortSha,
  ShowMore,
  CommitSha,
} from '@giantswarm/backstage-plugin-ui-react';

import type { AgentPluginEntry } from '../../lib/agentManager';
import {
  DiscoveredPlugin,
  PluginSelection,
  PluginSkill,
  pluginEntryKey,
  pluginEntryName,
  pluginId,
  pluginSelectionOf,
  pluginSkillsOf,
  searchPlugins,
  SelectedPlugin,
} from '../../lib/plugins';
import { DiscoveredSkill, repoSlug } from '../../lib/skills';
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
    padding: theme.spacing(1.5, 2, 1.5, 1),
    '& + &': {
      borderTop: '1px solid var(--bui-border-1)',
    },
  },
  // The caret and the checkbox share the first line; a row without skills
  // keeps the caret's place, so every checkbox lines up.
  caret: {
    flex: 'none',
    width: 32,
    height: 32,
  },
  caretIcon: {
    transition: 'transform 120ms',
  },
  caretOpen: {
    transform: 'rotate(90deg)',
  },
  checkbox: {
    flex: 'none',
    paddingTop: 6,
  },
  details: {
    minWidth: 0,
    flex: '1 1 auto',
  },
  // Indented to the plugin's name: past the caret (32px), the checkbox (16px)
  // and the two 4px gaps between them.
  panel: {
    marginTop: theme.spacing(1.5),
    marginLeft: 56,
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

/** What of a plugin the agent gets, as its row's metadata line says it. */
function selectionLine(
  plugin: DiscoveredPlugin,
  skills: PluginSkill[],
  selection: PluginSelection,
  picked: number,
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
  switch (selection) {
    case 'whole':
      return 'Agent Plugins · Whole plugin, as pinned';
    case 'all':
      return `Agent Plugins · All ${countNoun(total, 'skill')} at this commit`;
    case 'some':
      return `Agent Plugins · ${picked} of ${countNoun(total, 'skill')} selected`;
    default:
      return total > 0
        ? `Agent Plugins · ${countNoun(total, 'skill')}`
        : 'Agent Plugins · No skills in its skills directory';
  }
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

type PluginRowProps = {
  plugin: DiscoveredPlugin;
  /** The skills the row shows: every one, or a search's matches. */
  skills: PluginSkill[];
  /** Every skill the plugin brings, which its counts are of. */
  allSkills: PluginSkill[];
  pick: SelectedPlugin | undefined;
  /** Whether the row starts open: a search found one of its skills. */
  defaultOpen: boolean;
  onTogglePlugin: (plugin: DiscoveredPlugin) => void;
  onSelectAllPluginSkills: (plugin: DiscoveredPlugin) => void;
  onTogglePluginSkill: (plugin: DiscoveredPlugin, skill: string) => void;
};

/**
 * One plugin: a caret that folds its skills out, a checkbox for the plugin as
 * a whole, its name, what of it the agent gets and where it is pinned.
 *
 * A Claude Code plugin's checkbox is the plugin itself; its skills are shown
 * without checkboxes, since it loads whole. An Agent Plugins package's
 * checkbox picks every skill it lists at this commit (checked), some of them
 * (mixed) or none; its skills are picked one by one below it.
 */
function PluginRow({
  plugin,
  skills,
  allSkills,
  pick,
  defaultOpen,
  onTogglePlugin,
  onSelectAllPluginSkills,
  onTogglePluginSkill,
}: PluginRowProps) {
  const classes = useStyles();
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const isPackage = plugin.format === 'agent-plugins';
  // A Claude Code plugin is picked whole or not at all.
  let selection: PluginSelection = pick ? 'whole' : 'none';
  if (isPackage) {
    selection = pluginSelectionOf(plugin, pick);
  }
  const picked = new Set(pick?.skills ?? []);
  const pin = pick?.plugin.commit;
  const pinned = pin && pin !== plugin.commit ? pin : undefined;
  const isChecked = selection === 'whole' || selection === 'all';

  // Checked: the plugin goes. Unchecked or mixed: a Claude Code plugin is
  // added, a package gets every skill it lists.
  const onChange = () => {
    if (isChecked || !isPackage) {
      onTogglePlugin(plugin);
    } else {
      onSelectAllPluginSkills(plugin);
    }
  };

  return (
    <div role="listitem" className={classes.row}>
      <Flex align="start" gap="1">
        {allSkills.length > 0 ? (
          <ButtonIcon
            className={classes.caret}
            variant="tertiary"
            size="small"
            aria-label={`${open ? 'Hide' : 'Show'} skills of ${plugin.name}`}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            icon={
              <ChevronRightIcon
                fontSize="small"
                className={`${classes.caretIcon} ${open ? classes.caretOpen : ''}`}
              />
            }
            onPress={() => setOpen(value => !value)}
          />
        ) : (
          <span className={classes.caret} aria-hidden="true" />
        )}
        <div className={classes.checkbox}>
          <Checkbox
            aria-label={`Plugin ${plugin.name}`}
            isSelected={isChecked}
            isIndeterminate={selection === 'some'}
            // A package without skills has nothing to pick, unless an
            // edited agent carries it whole and it can still be cleared.
            isDisabled={isPackage && allSkills.length === 0 && !pick}
            onChange={onChange}
          />
        </div>
        <Flex direction="column" gap="1" className={classes.details}>
          <Text weight="bold">{plugin.name}</Text>
          <Text
            variant="body-small"
            color={selection === 'none' ? 'secondary' : 'primary'}
          >
            {selectionLine(plugin, allSkills, selection, picked.size)}
          </Text>
          {selection === 'all' && (
            // Until agent-manager stores a whole package
            // (giantswarm/giantswarm#39190), "all" is the list of names.
            <Text variant="body-small" color="secondary">
              Skills added to the plugin later are not included until you pick
              them.
            </Text>
          )}
          {isPackage && selection === 'whole' && (
            <Text variant="body-small" color="secondary">
              The agent loads it whole at its pinned commit. To pick skills
              instead, clear its checkbox and pick them at the latest commit.
            </Text>
          )}
          <PluginSource plugin={plugin} pinned={pinned} />
        </Flex>
      </Flex>
      {open && skills.length > 0 && (
        <div id={panelId} className={classes.panel}>
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
                      selected={selection === 'whole' || picked.has(skill.name)}
                      disabled={selection === 'whole'}
                      onSelect={() => onTogglePluginSkill(plugin, skill.name)}
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
        </div>
      )}
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
  const rows = useMemo(
    () =>
      plugins.map(plugin => ({
        plugin,
        skills: pluginSkillsOf(plugin, catalog),
      })),
    [plugins, catalog],
  );
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

  const rowsOf = (format: DiscoveredPlugin['format']) =>
    matches
      .filter(match => match.plugin.format === format)
      .map(match => {
        const id = pluginId(match.plugin);
        return (
          <PluginRow
            // A new search starts every row folded or opened afresh.
            key={`${id}|${trimmed}`}
            plugin={match.plugin}
            skills={match.skills}
            allSkills={allSkills.get(id) ?? match.skills}
            pick={byId.get(id)}
            defaultOpen={match.hasSkillMatch}
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
