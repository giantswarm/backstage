import { Button, Checkbox, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  ExternalLink,
  shortSha,
  CommitSha,
} from '@giantswarm/backstage-plugin-ui-react';

import type { AgentPluginEntry } from '../../lib/agentManager';
import {
  DiscoveredPlugin,
  pluginEntryKey,
  pluginEntryName,
  pluginId,
  SelectedPlugin,
} from '../../lib/plugins';
import { repoSlug } from '../../lib/skills';
import {
  SelectableCard,
  SelectableCardGrid,
  StaticCard,
  useSelectableCardStyles,
} from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  heading: {
    marginBottom: theme.spacing(1),
  },
  skills: {
    marginTop: theme.spacing(1),
  },
  actions: {
    marginTop: theme.spacing(1),
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

/**
 * A Claude Code plugin: one choice, since it loads whole — its commands,
 * hooks, subagents and skills.
 */
function ClaudePluginCard({
  plugin,
  selected,
  pinned,
  onToggle,
}: {
  plugin: DiscoveredPlugin;
  selected: boolean;
  pinned?: string;
  onToggle: () => void;
}) {
  return (
    <SelectableCard
      role="checkbox"
      selected={selected}
      ariaLabel={`Plugin ${plugin.name}`}
      onSelect={onToggle}
    >
      <Text weight="bold">{plugin.name}</Text>
      <Text variant="body-small" color="secondary">
        Claude Code plugin: loads whole, with its commands, hooks, subagents and
        skills.
      </Text>
      <PluginSource plugin={plugin} pinned={pinned} />
    </SelectableCard>
  );
}

/**
 * An Agent Plugins package: only the skills enabled here load, so each is a
 * checkbox; the package is on the agent while one of them is enabled.
 */
function AgentPluginsCard({
  plugin,
  enabled,
  pinned,
  onToggleSkill,
}: {
  plugin: DiscoveredPlugin;
  enabled: string[];
  pinned?: string;
  onToggleSkill: (skill: string) => void;
}) {
  const styles = useStyles();
  return (
    <StaticCard>
      <Text weight="bold">{plugin.name}</Text>
      <Text variant="body-small" color="secondary">
        Agent Plugins package: loads the skills you enable.
      </Text>
      <PluginSource plugin={plugin} pinned={pinned} />
      {plugin.skills.length === 0 ? (
        <Text variant="body-small" color="secondary" className={styles.skills}>
          No skills found in its skills directory.
        </Text>
      ) : (
        <Flex
          direction="column"
          gap="1"
          className={styles.skills}
          role="group"
          aria-label={`Skills of plugin ${plugin.name}`}
        >
          {plugin.skills.map(skill => (
            <Checkbox
              key={skill.name}
              isSelected={enabled.includes(skill.name)}
              onChange={() => onToggleSkill(skill.name)}
            >
              {skill.description ? (
                <>
                  <strong>{skill.name}</strong> — {skill.description}
                </>
              ) : (
                skill.name
              )}
            </Checkbox>
          ))}
        </Flex>
      )}
    </StaticCard>
  );
}

/**
 * The plugins found in the configured skill repositories. Each is pinned to the
 * commit its card shows, like a skill.
 */
export function PluginCards({
  plugins,
  selected,
  onTogglePlugin,
  onTogglePluginSkill,
}: {
  plugins: DiscoveredPlugin[];
  selected: SelectedPlugin[];
  onTogglePlugin: (plugin: DiscoveredPlugin) => void;
  onTogglePluginSkill: (plugin: DiscoveredPlugin, skill: string) => void;
}) {
  const styles = useStyles();
  if (plugins.length === 0) {
    return null;
  }
  const byId = new Map(selected.map(pick => [pluginId(pick.plugin), pick]));
  return (
    <div>
      <Text as="h3" weight="bold" className={styles.heading}>
        Plugins
      </Text>
      <SelectableCardGrid role="group" ariaLabel="Plugins" minWidth={280}>
        {plugins.map(plugin => {
          const pick = byId.get(pluginId(plugin));
          const pin = pick?.plugin.commit;
          const pinned = pin && pin !== plugin.commit ? pin : undefined;
          return plugin.format === 'claude-code' ? (
            <ClaudePluginCard
              key={pluginId(plugin)}
              plugin={plugin}
              selected={Boolean(pick)}
              pinned={pinned}
              onToggle={() => onTogglePlugin(plugin)}
            />
          ) : (
            <AgentPluginsCard
              key={pluginId(plugin)}
              plugin={plugin}
              enabled={pick?.skills ?? []}
              pinned={pinned}
              onToggleSkill={skill => onTogglePluginSkill(plugin, skill)}
            />
          );
        })}
      </SelectableCardGrid>
    </div>
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
