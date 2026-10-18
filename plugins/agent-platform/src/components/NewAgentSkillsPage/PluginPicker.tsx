import { Alert, Button, Checkbox, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentPluginEntry } from '../../lib/agentManager';
import {
  DiscoveredPlugin,
  pluginEntryKey,
  pluginLabel,
  pluginPin,
  pluginPlace,
} from '../../lib/plugins';
import { repoSlug, shortCommit } from '../../lib/skills';
import { shortPin } from '../AgentDetailPage/helpers';
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
  skills: {
    margin: theme.spacing(1, 0, 0, 1),
    padding: 0,
    border: 'none',
  },
  actions: {
    marginTop: theme.spacing(1),
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
  },
}));

/** What a plugin's format means for the agent, in one line. */
function formatNote(plugin: DiscoveredPlugin): string {
  if (plugin.format === 'claude') {
    return 'Claude Code plugin: loads whole, with its commands, hooks, subagents and skills.';
  }
  return plugin.skills.length > 0
    ? 'Agent Plugins package: enables only the skills you select.'
    : 'Agent Plugins package without skills to select.';
}

function PluginCard({
  plugin,
  entry,
  blocked,
  onToggle,
}: {
  plugin: DiscoveredPlugin;
  /** The agent's entry for this plugin, when it is selected. */
  entry: AgentPluginEntry | undefined;
  /** Why the plugin cannot load on the agent's Harness. */
  blocked: string | undefined;
  onToggle: () => void;
}) {
  const classes = useSelectableCardStyles();
  const description = useClampedText({
    text: plugin.description,
    subject: plugin.name,
  });
  const pin = entry ? pluginPin(entry) : undefined;
  const movedOn = pin !== undefined && pin !== plugin.commit;
  return (
    <SelectableCard
      role="checkbox"
      selected={Boolean(entry)}
      // A selected plugin stays removable, whatever the Harness.
      disabled={Boolean(blocked) && !entry}
      ariaLabel={`Plugin ${plugin.name}`}
      onSelect={onToggle}
      hoverAction={description.toggle}
      describedById={description.describedById}
    >
      <Text weight="bold">{plugin.name}</Text>
      {description.content}
      <Text variant="body-x-small" color="secondary">
        {formatNote(plugin)}
      </Text>
      {blocked && (
        <Text variant="body-x-small" color="danger">
          {blocked}
        </Text>
      )}
      <Text variant="body-x-small" color="secondary">
        {repoSlug(plugin.repoUrl)}
        {plugin.path && (
          <>
            {' · '}
            <span className={classes.code}>{plugin.path}</span>
          </>
        )}
      </Text>
      {movedOn ? (
        <Text variant="body-x-small" color="secondary">
          pinned at <span className={classes.code}>{shortPin(pin ?? '')}</span>
          {' · '}
          {plugin.ref} is at{' '}
          <span className={classes.code}>{shortCommit(plugin.commit)}</span>
        </Text>
      ) : (
        <Text
          variant="body-x-small"
          color="secondary"
          aria-label={`Pinned to commit ${shortCommit(plugin.commit)} of ${plugin.ref}`}
        >
          {plugin.ref}{' '}
          <span className={classes.code}>@{shortCommit(plugin.commit)}</span>
        </Text>
      )}
    </SelectableCard>
  );
}

/**
 * The skills of a selected Agent Plugins package, one checkbox each: the
 * runtime enables only the ones checked, by their directory name.
 */
function PluginSkills({
  plugin,
  entry,
  onToggleSkill,
}: {
  plugin: DiscoveredPlugin;
  entry: AgentPluginEntry;
  onToggleSkill: (skill: string) => void;
}) {
  const styles = useStyles();
  const enabled = new Set(entry.skills ?? []);
  // A selection the catalogue no longer lists (an older pin) stays visible
  // and can be unchecked.
  const names = [
    ...plugin.skills.map(skill => skill.name),
    ...[...enabled].filter(
      name => !plugin.skills.some(skill => skill.name === name),
    ),
  ];
  return (
    <fieldset className={styles.skills}>
      <legend>
        <Text variant="body-small" weight="bold">
          Skills of {plugin.name} to enable ({enabled.size} of {names.length})
        </Text>
      </legend>
      <Flex direction="column" gap="1">
        {names.map(name => (
          <Checkbox
            key={name}
            isSelected={enabled.has(name)}
            onChange={() => onToggleSkill(name)}
          >
            {name}
          </Checkbox>
        ))}
      </Flex>
    </fieldset>
  );
}

/** A plugin entry no configured repository lists, kept as pinned. */
function KeptPlugin({
  entry,
  onRemove,
}: {
  entry: AgentPluginEntry;
  onRemove: () => void;
}) {
  const classes = useSelectableCardStyles();
  const styles = useStyles();
  const label = pluginLabel(entry);
  return (
    <StaticCard>
      <Text weight="bold">{label}</Text>
      <Text variant="body-x-small" color="secondary">
        {entry.git ? (
          <>
            <ExternalLink href={entry.git.url}>
              {repoSlug(entry.git.url)}
            </ExternalLink>
            {entry.path && (
              <>
                {' · '}
                <span className={classes.code}>{entry.path}</span>
              </>
            )}
          </>
        ) : (
          <span className={classes.code}>{entry.oci}</span>
        )}
      </Text>
      <Text variant="body-x-small" color="secondary">
        pinned at{' '}
        <span className={classes.code}>{shortPin(pluginPin(entry))}</span>
        {entry.skills && entry.skills.length > 0
          ? ` · enables ${entry.skills.join(', ')}`
          : ''}
      </Text>
      <div className={styles.actions}>
        <Button
          variant="tertiary"
          size="small"
          aria-label={`Remove plugin ${label}`}
          onPress={onRemove}
        >
          Remove
        </Button>
      </div>
    </StaticCard>
  );
}

/**
 * The plugins half of the skills step: the configured repositories' plugins
 * as cards, a selected Agent Plugins package with its skills as checkboxes
 * below its card, and — while editing — the agent's plugins no repository
 * lists, kept as pinned unless removed.
 */
export function PluginPicker({
  catalog,
  entries,
  problems,
  claudeProblem,
  onToggle,
  onToggleSkill,
  onRemove,
}: {
  catalog: DiscoveredPlugin[];
  entries: AgentPluginEntry[];
  /** Why the selection cannot be written; shown above the cards. */
  problems: string[];
  /** Why a Claude Code plugin cannot load on the agent's Harness. */
  claudeProblem: string | undefined;
  onToggle: (plugin: DiscoveredPlugin) => void;
  onToggleSkill: (entry: AgentPluginEntry, skill: string) => void;
  onRemove: (entry: AgentPluginEntry) => void;
}) {
  const styles = useStyles();
  const byPlace = new Map(entries.map(entry => [pluginPlace(entry), entry]));
  const listed = new Set(catalog.map(pluginPlace));
  const kept = entries.filter(entry => !listed.has(pluginPlace(entry)));
  if (catalog.length === 0 && kept.length === 0) {
    return null;
  }
  return (
    <Flex direction="column" gap="2">
      <Text as="h3" weight="bold" className={styles.heading}>
        Plugins
      </Text>
      {problems.length > 0 && (
        <Alert
          status="danger"
          title="These plugins cannot be saved as selected"
          description={problems.join(' ')}
        />
      )}
      {catalog.length > 0 && (
        <SelectableCardGrid role="group" ariaLabel="Plugins" minWidth={260}>
          {catalog.map(plugin => {
            const entry = byPlace.get(pluginPlace(plugin));
            return (
              <div key={pluginPlace(plugin)} className={styles.item}>
                <PluginCard
                  plugin={plugin}
                  entry={entry}
                  blocked={
                    plugin.format === 'claude' ? claudeProblem : undefined
                  }
                  onToggle={() => onToggle(plugin)}
                />
                {entry &&
                  plugin.format === 'agent-plugins' &&
                  (plugin.skills.length > 0 || entry.skills) && (
                    <PluginSkills
                      plugin={plugin}
                      entry={entry}
                      onToggleSkill={skill => onToggleSkill(entry, skill)}
                    />
                  )}
              </div>
            );
          })}
        </SelectableCardGrid>
      )}
      {kept.length > 0 && (
        <SelectableCardGrid
          role="list"
          ariaLabel="Plugins from elsewhere"
          minWidth={240}
        >
          {kept.map(entry => (
            <KeptPlugin
              key={pluginEntryKey(entry)}
              entry={entry}
              onRemove={() => onRemove(entry)}
            />
          ))}
        </SelectableCardGrid>
      )}
    </Flex>
  );
}
