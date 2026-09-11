import { useMemo } from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { ExternalLink } from '@giantswarm/backstage-plugin-ui-react';

import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import type { AgentSkillEntry } from '../../lib/agentManager';
import { groupSkillsByRepo } from '../../lib/skillGrouping';
import { repoSlug, shortCommit, type DiscoveredSkill } from '../../lib/skills';
import { shortPin } from '../AgentDetailPage/helpers';
import {
  SelectableCard,
  SelectableCardGrid,
  StaticCard,
  useSelectableCardStyles,
} from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  repoHeading: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  keptActions: {
    marginTop: theme.spacing(1),
  },
}));

/** Where a skill lives — repository and path — as the identity of a selection. */
function placeOfEntry(skill: AgentSkillEntry): string {
  return 'git' in skill
    ? `git:${skill.git.url}#${skill.path ?? ''}`
    : `oci:${skill.oci}`;
}

function placeOfDiscovered(skill: DiscoveredSkill): string {
  return `git:${skill.repoUrl}#${skill.path}`;
}

/**
 * One catalog skill as a card: selected when the agent mounts it. A selected
 * card shows the commit the agent is pinned to; when the repository has moved
 * on it names the head too, so the person sees what "Update skills" would do
 * without opening it.
 */
function CatalogSkillCard({
  skill,
  mounted,
  onToggle,
}: {
  skill: DiscoveredSkill;
  /** The agent's entry for this skill, when it is mounted. */
  mounted?: AgentSkillEntry;
  onToggle: () => void;
}) {
  const classes = useSelectableCardStyles();
  const showPath =
    skill.path !== '' &&
    (skill.path.includes('/') || skill.path !== skill.name);
  const pinned = mounted && 'git' in mounted ? mounted.git.commit : undefined;

  return (
    <SelectableCard
      role="checkbox"
      selected={Boolean(mounted)}
      ariaLabel={`Skill ${skill.name}`}
      onSelect={onToggle}
    >
      <Text weight="bold">{skill.name}</Text>
      {skill.description && (
        <Text variant="body-small" color="secondary">
          {skill.description}
        </Text>
      )}
      <Text variant="body-x-small" color="secondary">
        {repoSlug(skill.repoUrl)}
        {showPath && (
          <>
            {' · '}
            <span className={classes.code}>{skill.path}</span>
          </>
        )}
      </Text>
      {pinned ? (
        <Text variant="body-x-small" color="secondary">
          pinned at <span className={classes.code}>{shortPin(pinned)}</span>
          {pinned !== skill.commit && (
            <>
              {' · '}
              {skill.ref} is at{' '}
              <span className={classes.code}>{shortCommit(skill.commit)}</span>
            </>
          )}
        </Text>
      ) : (
        <Text
          variant="body-x-small"
          color="secondary"
          aria-label={`Would be pinned to commit ${shortCommit(skill.commit)} of ${skill.ref}`}
        >
          {skill.ref}{' '}
          <span className={classes.code}>@{shortCommit(skill.commit)}</span>
        </Text>
      )}
    </SelectableCard>
  );
}

/**
 * A skill the agent mounts that no configured repository lists — pinned from
 * a repository this portal does not discover, or by OCI digest. Shown so the
 * skill list is complete, removable, otherwise left exactly as pinned.
 */
function KeptSkillCard({
  skill,
  onRemove,
}: {
  skill: AgentSkillEntry;
  onRemove: () => void;
}) {
  const classes = useSelectableCardStyles();
  const styles = useStyles();
  return (
    <StaticCard>
      <Text weight="bold">{skill.name}</Text>
      <Text variant="body-x-small" color="secondary">
        {'git' in skill ? (
          <>
            <ExternalLink href={skill.git.url}>
              {repoSlug(skill.git.url)}
            </ExternalLink>
            {skill.path && (
              <>
                {' · '}
                <span className={classes.code}>{skill.path}</span>
              </>
            )}
          </>
        ) : (
          <span className={classes.code}>{skill.oci}</span>
        )}
      </Text>
      <Text variant="body-x-small" color="secondary">
        at{' '}
        <span className={classes.code}>
          {shortPin('git' in skill ? skill.git.commit : skill.oci)}
        </span>
      </Text>
      <div className={styles.keptActions}>
        <Button variant="tertiary" size="small" onPress={onRemove}>
          Remove
        </Button>
      </div>
    </StaticCard>
  );
}

export type SkillPickerProps = {
  /** The configured repositories' skills, each at its head commit. */
  catalog: SkillCatalog;
  /** The agent's skills as pinned. */
  selected: AgentSkillEntry[];
  /**
   * Add a catalog skill (pinned to the commit its card shows) or remove the
   * agent's entry for it.
   */
  onToggle: (skill: DiscoveredSkill) => void;
  /** Remove a mounted skill the catalog does not list. */
  onRemove: (skill: AgentSkillEntry) => void;
};

/**
 * The agent's skills as a picker: the catalog's skills as selectable cards,
 * mounted ones selected, plus the mounted skills no repository lists. Adding a
 * skill pins it to the head commit the card shows — the same pin the create
 * flow writes — and only "Update skills" ever moves a pin afterwards.
 */
export function SkillPicker({
  catalog,
  selected,
  onToggle,
  onRemove,
}: SkillPickerProps) {
  const styles = useStyles();
  const groups = useMemo(
    () => groupSkillsByRepo(catalog.skills),
    [catalog.skills],
  );
  const mountedByPlace = useMemo(
    () => new Map(selected.map(skill => [placeOfEntry(skill), skill])),
    [selected],
  );
  const listed = useMemo(
    () => new Set(catalog.skills.map(placeOfDiscovered)),
    [catalog.skills],
  );
  const kept = selected.filter(skill => !listed.has(placeOfEntry(skill)));

  return (
    <Flex direction="column" gap="3">
      {kept.length > 0 && (
        <div>
          <Text
            as="h4"
            weight="bold"
            variant="body-small"
            className={styles.repoHeading}
          >
            Mounted from elsewhere
          </Text>
          <SelectableCardGrid
            role="list"
            ariaLabel="Mounted skills not in the catalog"
            minWidth={240}
          >
            {kept.map((skill, index) => (
              <KeptSkillCard
                key={`${placeOfEntry(skill)}#${index}`}
                skill={skill}
                onRemove={() => onRemove(skill)}
              />
            ))}
          </SelectableCardGrid>
        </div>
      )}

      {!catalog.hasRepositories && (
        <Text variant="body-small" color="secondary">
          No skill repositories are configured for this portal, so skills can be
          removed here but not added.
        </Text>
      )}
      {catalog.isLoading && catalog.skills.length === 0 && (
        <Text color="secondary">Discovering skills…</Text>
      )}
      {catalog.failedRepositories.length > 0 && (
        <Alert
          status="warning"
          title="Some repositories could not be read"
          description={`Skills from ${catalog.failedRepositories.join(
            ', ',
          )} are not listed.`}
        />
      )}
      {catalog.truncated && (
        <Alert
          status="info"
          title="Listing capped"
          description="GitHub capped the listing of at least one repository; some skills may be missing."
        />
      )}

      {groups.map(group => {
        const skills = [
          ...group.ungrouped,
          ...group.subgroups.flatMap(subgroup => subgroup.skills),
        ];
        return (
          <div key={group.repoUrl}>
            <Text
              as="h4"
              weight="bold"
              variant="body-small"
              className={styles.repoHeading}
            >
              {group.repoSlug} ({skills.length})
            </Text>
            <SelectableCardGrid
              role="group"
              ariaLabel={`Skills in ${group.repoSlug}`}
              minWidth={240}
            >
              {skills.map(skill => (
                <CatalogSkillCard
                  key={placeOfDiscovered(skill)}
                  skill={skill}
                  mounted={mountedByPlace.get(placeOfDiscovered(skill))}
                  onToggle={() => onToggle(skill)}
                />
              ))}
            </SelectableCardGrid>
          </div>
        );
      })}
    </Flex>
  );
}

/** Whether the agent mounts this catalog skill (same repository and path). */
export function isMounted(
  selected: AgentSkillEntry[],
  skill: DiscoveredSkill,
): boolean {
  const place = placeOfDiscovered(skill);
  return selected.some(entry => placeOfEntry(entry) === place);
}
