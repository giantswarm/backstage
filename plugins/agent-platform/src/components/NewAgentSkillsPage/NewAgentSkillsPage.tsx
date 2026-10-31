import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Button,
  Flex,
  SearchField,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  CatalogNoMatch,
  LoadingIndicator,
  isSearchableList,
  ShowMore,
  useProvidePageHeaderActions,
  WizardStepHeading,
  shortSha,
  CommitSha,
} from '@giantswarm/backstage-plugin-ui-react';

import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { agentsBySkill, searchSkills } from '../../lib/customize';
import { DiscoveredSkill, repoSlug, skillId } from '../../lib/skills';
import { groupSkillsByRepo, RepoSkillGroup } from '../../lib/skillGrouping';
import { AgentWizardFrame, useAgentWizardLinks } from '../AgentWizardFrame';
import { AgentsDataProvider, useAgents } from '../AgentsDataProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { SkillsFilterBar, useSkillFilters } from '../SkillsFilterBar';
import { KeptSkills } from './KeptSkills';
import { KeptPlugins, PluginCards } from './PluginCards';
import { repeatedSkillNames } from '../../lib/plugins';
import { AUTO_EXPAND_MAX } from '../ToolsetResolutionList';
import {
  SelectableCard,
  SelectableCardGrid,
  useClampedText,
  useSelectableCardStyles,
} from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  // bui gives an expanded panel 4px of padding, which leaves the first row of
  // cards crowding the repo it belongs to. A margin rather than more padding,
  // because the panel's own rule is the more specific one -- and scoped to the
  // expanded state the same way that rule is, because the panel element stays
  // in the layout while the section is collapsed.
  skillsPanel: {
    '[data-expanded="true"] > &': {
      marginTop: theme.spacing(1.5),
    },
  },
  // Sets a subfolder off from the cards above it. The panel already opens with
  // space of its own, so the first subfolder in a repository doesn't need it --
  // and when the repository has no loose skills, that heading is what the panel
  // opens with.
  subgroup: {
    '&:first-child $subgroupHeading': {
      marginTop: 0,
    },
  },
  subgroupHeading: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
}));

function SkillCard({
  skill,
  selected,
  pinned,
  onSelect,
}: {
  skill: DiscoveredSkill;
  selected: boolean;
  /** The commit an edited agent is pinned to, when its repo has moved on. */
  pinned?: string;
  onSelect: () => void;
}) {
  const classes = useSelectableCardStyles();
  // Show the source repo; append the path only when it adds information
  // (nested skill, or the directory differs from the displayed name) —
  // otherwise it just echoes the title.
  const showPath =
    skill.path !== '' &&
    (skill.path.includes('/') || skill.path !== skill.name);
  const description = useClampedText({
    text: skill.description,
    subject: skill.name,
  });

  return (
    <SelectableCard
      role="checkbox"
      selected={selected}
      ariaLabel={`Skill ${skill.name}`}
      onSelect={onSelect}
      hoverAction={description.toggle}
      describedById={description.describedById}
    >
      <Text weight="bold">{skill.name}</Text>
      {description.content}
      <Text variant="body-x-small" color="secondary">
        {repoSlug(skill.repoUrl)}
        {showPath && (
          <>
            {' · '}
            <span className={classes.code}>{skill.path}</span>
          </>
        )}
      </Text>
      {/* The commit the agent will be pinned to: the head of the branch when
          the skill was discovered. Skills never move on their own after the
          write (updating them is an explicit action on the agent's page), so
          the pin is shown where it is chosen. */}
      {pinned ? (
        <Text variant="body-x-small" color="secondary">
          pinned at{' '}
          <CommitSha value={pinned} copy={false} className={classes.code} />
          {' · '}
          {skill.ref} is at{' '}
          <CommitSha
            value={skill.commit}
            copy={false}
            className={classes.code}
          />
        </Text>
      ) : (
        <Text
          variant="body-x-small"
          color="secondary"
          aria-label={`Pinned to commit ${shortSha(skill.commit)} of ${skill.ref}`}
        >
          {skill.ref}{' '}
          <span className={classes.code}>
            @<CommitSha value={skill.commit} copy={false} />
          </span>
        </Text>
      )}
    </SelectableCard>
  );
}

type SkillSelection = {
  /**
   * What narrows the list — the search term and the filter picks — as one
   * key: a new one starts every grid at its first page, and a non-empty one
   * opens every repository holding a match. Empty while nothing narrows it.
   */
  query: string;
  selectedIds: Map<string, DiscoveredSkill>;
  onToggle: (skill: DiscoveredSkill) => void;
};

/**
 * One grid of skill cards, a page at a time: a repository of hundreds of
 * skills is found by searching, not by scrolling past every card, so only the
 * first page mounts until more is asked for. At a handful there is no chrome.
 */
function SkillGrid({
  skills,
  ariaLabel,
  query,
  selectedIds,
  onToggle,
}: SkillSelection & {
  skills: DiscoveredSkill[];
  /** Names the group for assistive tech — the subgroup, or the repo when flush. */
  ariaLabel: string;
}) {
  return (
    <ShowMore key={query} items={skills} noun="skill">
      {visible => (
        <SelectableCardGrid role="group" ariaLabel={ariaLabel} minWidth={240}>
          {visible.map(skill => {
            const pin = selectedIds.get(skillId(skill))?.commit;
            return (
              <SkillCard
                key={skillId(skill)}
                skill={skill}
                selected={selectedIds.has(skillId(skill))}
                pinned={pin && pin !== skill.commit ? pin : undefined}
                onSelect={() => onToggle(skill)}
              />
            );
          })}
        </SelectableCardGrid>
      )}
    </ShowMore>
  );
}

/** One repository's skills: its loose skills, then each subfolder's. */
function RepoSkills({
  group,
  ...selection
}: SkillSelection & { group: RepoSkillGroup }) {
  const classes = useStyles();
  return (
    <Flex direction="column" gap="3">
      {group.ungrouped.length > 0 && (
        <SkillGrid
          skills={group.ungrouped}
          ariaLabel={`Skills in ${group.repoSlug}`}
          {...selection}
        />
      )}
      {group.subgroups.map(subgroup => (
        <div key={subgroup.key} className={classes.subgroup}>
          {/* A real heading, so the grouping is reachable by heading
              navigation and not just visible styling. */}
          <Text
            as="h4"
            weight="bold"
            variant="body-small"
            className={classes.subgroupHeading}
          >
            {subgroup.label}
          </Text>
          <SkillGrid
            skills={subgroup.skills}
            ariaLabel={`Skills in ${group.repoSlug} / ${subgroup.label}`}
            {...selection}
          />
        </div>
      ))}
    </Flex>
  );
}

function GroupedSkills({
  groups,
  expandAll,
  ...selection
}: SkillSelection & {
  groups: RepoSkillGroup[];
  /**
   * The catalogue is short enough to read whole ({@link AUTO_EXPAND_MAX}), so
   * every repository opens; a longer one opens as its repositories and counts.
   */
  expandAll: boolean;
}) {
  const classes = useStyles();
  const { query, selectedIds } = selection;
  const repoKeys = groups.map(group => group.repoUrl);
  const repoSignature = repoKeys.join('|');
  const seed = () =>
    query !== '' || expandAll ? new Set(repoKeys) : new Set<string>();

  // Expansion is controlled rather than seeded via `defaultExpandedKeys` (which
  // only applies on mount): a search must always reveal its matches, and a repo
  // the user had collapsed would otherwise keep its matches hidden behind a
  // trigger that advertises a non-zero count.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(seed);

  // Re-seed whenever the query changes or the set of matching repos changes
  // (the latter also covers the initial load, where skills arrive
  // asynchronously while the query stays empty): a search opens every repo it
  // matched in, and no search opens all of a short catalogue and none of a
  // long one. Within a stable query and repo set, a toggle the user performs
  // sticks.
  useEffect(() => {
    setExpandedKeys(seed());
    // repoSignature stands in for repoKeys (a new array each render); query is
    // read only to retrigger on search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, repoSignature, expandAll]);

  // Per repository, so a collapsed one still says it holds part of the pick.
  const selectedPerRepo = useMemo(() => {
    const counts = new Map<string, number>();
    selectedIds.forEach(skill =>
      counts.set(skill.repoUrl, (counts.get(skill.repoUrl) ?? 0) + 1),
    );
    return counts;
  }, [selectedIds]);

  return (
    <AccordionGroup
      allowsMultiple
      expandedKeys={expandedKeys}
      onExpandedChange={keys => setExpandedKeys(new Set(keys as Set<string>))}
    >
      {groups.map(group => {
        const total =
          group.ungrouped.length +
          group.subgroups.reduce((sum, sub) => sum + sub.skills.length, 0);
        const selected = selectedPerRepo.get(group.repoUrl) ?? 0;
        return (
          <Accordion id={group.repoUrl} key={group.repoUrl}>
            <AccordionTrigger>
              {group.repoSlug} ({total}
              {selected > 0 ? ` · ${selected} selected` : ''})
            </AccordionTrigger>
            <AccordionPanel className={classes.skillsPanel}>
              {/* Mounted only while open: a collapsed repository of hundreds
                  of skills costs nothing. */}
              {expandedKeys.has(group.repoUrl) && (
                <RepoSkills group={group} {...selection} />
              )}
            </AccordionPanel>
          </Accordion>
        );
      })}
    </AccordionGroup>
  );
}

/**
 * The wizard's skills step. The agents are read for the Usage filter ("Used
 * by agents" / "Not used", the same facets as Customize → Skills, T60), so the
 * step mounts the agent list the way the Customize screen does; the shared
 * query client usually has it already (the step-1 assist reads it too).
 */
export function NewAgentSkillsPage() {
  return (
    <ModelConfigsProvider>
      <AgentsDataProvider>
        <NewAgentSkillsPageContent />
      </AgentsDataProvider>
    </ModelConfigsProvider>
  );
}

function NewAgentSkillsPageContent() {
  const navigate = useNavigate();
  const links = useAgentWizardLinks();
  const newAgentLink = links.details;
  const toolsLink = links.tools;
  const {
    state,
    edit,
    toggleSkill,
    removeKeptSkill,
    togglePlugin,
    togglePluginSkill,
    removeKeptPlugin,
    isComplete,
  } = useNewAgentForm();
  const {
    skills,
    plugins,
    isLoading,
    error,
    hasRepositories,
    failedRepositories,
    truncated,
  } = useSkillCatalog();

  const [query, setQuery] = useState('');
  // A handful of skills is read at a glance: no search field and no count of
  // the selection (every card shows its own state). The field comes with a
  // catalogue long enough to need it; should it shrink back under the
  // threshold, the query goes with the field, so nothing stays filtered by
  // text the author can no longer see or clear.
  const isSearchable = isSearchableList(skills.length);
  const trimmed = isSearchable ? query.trim() : '';
  useEffect(() => {
    if (!isSearchable) {
      setQuery('');
    }
  }, [isSearchable]);
  // A single repository needs no accordion around it, and a short catalogue
  // opens every repository it spans. Both read the whole catalogue, not the
  // matches, so the layout does not change shape on a keystroke.
  const isSingleRepo = useMemo(
    () => new Set(skills.map(skill => skill.repoUrl)).size === 1,
    [skills],
  );
  const isShort = skills.length <= AUTO_EXPAND_MAX;

  // By id, with the selected skill: an edited agent's carries its pin.
  const selectedIds = useMemo(
    () => new Map(state.selectedSkills.map(skill => [skillId(skill), skill])),
    [state.selectedSkills],
  );

  // Client-side only: the whole catalogue is already loaded (unlike muster's
  // tool search, which delegates ranking to a backend BM25 endpoint), and the
  // same token search as Customize › Skills, so one query finds the same
  // skills in both places.
  const visibleSkills = useMemo(
    () => searchSkills(skills, trimmed),
    [skills, trimmed],
  );

  // Source and Usage, as on Customize → Skills (T49): a multi-select
  // dropdown each, where it can narrow the list — skills from one repository
  // get no Source dropdown. Usage waits for the agents rather than calling
  // every skill unused.
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const usage = useMemo(() => agentsBySkill(agents), [agents]);
  const filters = useSkillFilters({
    skills,
    searched: visibleSkills,
    usage: agentsLoading ? undefined : usage,
  });
  // Under the same rule as the search, and kept while a pick is in force.
  const hasFilters =
    filters.dimensions.length > 0 &&
    isSearchableList(skills.length, filters.isFiltered);

  // Search and filters narrow within the grouping rather than replacing it
  // with a flat list: the repo/subfolder a match came from is part of what
  // identifies a skill, and keeping the structure means the page doesn't
  // relayout on the first keystroke. Empty repos and subgroups simply don't
  // appear.
  const groups = useMemo(
    () => groupSkillsByRepo(filters.filtered),
    [filters.filtered],
  );

  const narrowKey = filters.isFiltered ? `${trimmed}|${filters.key}` : trimmed;
  const selection = { query: narrowKey, selectedIds, onToggle: toggleSkill };
  const catalogue = isSingleRepo ? (
    groups[0] && <RepoSkills group={groups[0]} {...selection} />
  ) : (
    <GroupedSkills groups={groups} expandAll={isShort} {...selection} />
  );

  // The only place the step reports its own output: a search, a filter, a
  // collapsed repository or a grid's later pages can hide every selected
  // card, and the review summary lists them only inside the values YAML.
  // Shown beside the search; without one (a short catalogue), beside the
  // filters while a pick is in force — only then can cards be out of sight.
  const selectedCount = (
    <Text variant="body-small" color="secondary">
      {selectedIds.size} selected
    </Text>
  );

  // agent-manager refuses a skill name used twice (each is one directory of
  // the agent's skills); said where the pick is made, not only at review.
  const repeated = repeatedSkillNames(
    [
      ...state.selectedSkills.map(skill => skill.name),
      ...state.keptSkills.map(skill => skill.name),
    ],
    [...state.selectedPlugins, ...state.keptPlugins],
  );

  // The frame's footer carries Cancel and Back; only the primary lives here.
  const actions = useMemo(
    () => (
      <Button
        variant="primary"
        onPress={() => toolsLink && navigate(toolsLink())}
      >
        Continue
      </Button>
    ),
    [toolsLink, navigate],
  );

  const onBack = useCallback(() => {
    if (newAgentLink) {
      navigate(newAgentLink());
    }
  }, [newAgentLink, navigate]);

  const stepTitle =
    plugins.length > 0 || state.keptPlugins.length > 0
      ? 'Select skills and plugins'
      : 'Select skills';

  // Guarded like NewAgentReviewPage: when this render only produces a redirect,
  // pushing this step's actions into the shared section header would flash
  // controls for a page the user never sees.
  const isRedirecting = !isComplete || !hasRepositories;
  useProvidePageHeaderActions(isRedirecting ? null : actions);

  // A direct deep link with required step-1 fields missing can't be fixed on
  // this page -- send the user back to fill those in first.
  if (!isComplete) {
    return <Navigate to={newAgentLink ? newAgentLink() : '..'} replace />;
  }

  // Without configured repositories there is nothing to pick and no action the
  // agent's creator could take (the fix is admin-side app-config), so this step
  // doesn't exist: step 1 sends them straight to the Tools step, and a deep
  // link here follows. `hasRepositories` is pure config, so this needs no fetch.
  if (!hasRepositories) {
    return <Navigate to={toolsLink ? toolsLink() : '..'} replace />;
  }

  return (
    <AgentWizardFrame step="skills" onBack={onBack}>
      {edit ? (
        <WizardStepHeading title={stepTitle}>
          Packaged instructions the agent can reuse for specific kinds of tasks,
          discovered from the configured skill repositories. The agent's skills
          stay at the commit they are pinned to; a skill you add is pinned to
          the commit shown on its card. Update skills on the agent's page moves
          the pins, plugins' included.
        </WizardStepHeading>
      ) : (
        <WizardStepHeading title={stepTitle}>
          Packaged instructions the agent can reuse for specific kinds of tasks,
          discovered from the configured skill repositories. Each skill is
          pinned to the commit shown on its card — the head of its repository
          when it was discovered — and stays there until you update it. Plugins
          found in the same repositories are pinned the same way. Optional — you
          can continue without selecting any.
        </WizardStepHeading>
      )}

      <Flex direction="column" gap="3">
        <KeptSkills skills={state.keptSkills} onRemove={removeKeptSkill} />

        {isLoading && skills.length === 0 && (
          <LoadingIndicator label="Discovering skills…" />
        )}

        {error && skills.length === 0 && (
          <Alert
            status="warning"
            title="Could not discover skills"
            description="The skill repositories could not be read. You can still create the agent without skills."
          />
        )}

        {failedRepositories.length > 0 && (
          <Alert
            status="warning"
            title="Could not read some skill repositories"
            description={`Skipped: ${failedRepositories.join(', ')}.`}
          />
        )}

        {truncated && (
          <Alert
            status="warning"
            title="Skill list may be incomplete"
            description="A repository was too large to list fully (or a skill could not be read), so some skills may be missing."
          />
        )}

        {!isLoading &&
          !error &&
          skills.length === 0 &&
          plugins.length === 0 && (
            <Alert
              status="info"
              title="No skills found"
              description="No SKILL.md files were found in the configured repositories."
            />
          )}

        {skills.length > 0 && (
          <>
            {isSearchable && (
              <Flex
                align="center"
                justify="between"
                gap="2"
                style={{ flexWrap: 'wrap' }}
              >
                <Flex grow basis="240px" direction="column">
                  <SearchField
                    aria-label="Search skills"
                    placeholder="Search by name, description, or path…"
                    value={query}
                    onChange={setQuery}
                  />
                </Flex>
                {selectedCount}
              </Flex>
            )}

            {hasFilters && (
              <Flex
                align="center"
                justify="between"
                gap="4"
                style={{ flexWrap: 'wrap' }}
              >
                <SkillsFilterBar filters={filters} />
                {!isSearchable && filters.isFiltered && selectedCount}
              </Flex>
            )}

            {groups.length > 0 ? (
              catalogue
            ) : (
              <CatalogNoMatch
                plural="skills"
                search={trimmed}
                isFiltered={filters.isFiltered}
                onClearFilters={filters.clear}
              />
            )}
          </>
        )}

        <KeptPlugins plugins={state.keptPlugins} onRemove={removeKeptPlugin} />

        <PluginCards
          plugins={plugins}
          selected={state.selectedPlugins}
          onTogglePlugin={togglePlugin}
          onTogglePluginSkill={togglePluginSkill}
        />

        {repeated.length > 0 && (
          <Alert
            status="warning"
            title="A skill name is used twice"
            description={`Each skill name may appear once across the skills and the plugins' skills: ${repeated.join(
              ', ',
            )}. Deselect one of each.`}
          />
        )}
      </Flex>

      <Text as="p" color="secondary">
        The next step chooses the agent's tools — the toolset it can discover
        and call through the gateway.
      </Text>
    </AgentWizardFrame>
  );
}
