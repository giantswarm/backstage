import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Accordion,
  AccordionGroup,
  AccordionPanel,
  AccordionTrigger,
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  SearchField,
  Text,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import {
  matchesQuery,
  useProvidePageHeaderActions,
} from '@giantswarm/backstage-plugin-ui-react';

import { newAgentRouteRef, newAgentReviewRouteRef } from '../../routes';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { DiscoveredSkill, repoSlug, skillId } from '../../lib/skills';
import { groupSkillsByRepo, RepoSkillGroup } from '../../lib/skillGrouping';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  stepLabel: {
    marginBottom: theme.spacing(0.5),
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  subgroupHeading: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  footerNote: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
}));

function SkillCard({
  skill,
  selected,
  onSelect,
}: {
  skill: DiscoveredSkill;
  selected: boolean;
  onSelect: () => void;
}) {
  const classes = useSelectableCardStyles();
  // Show the source repo; append the path only when it adds information
  // (nested skill, or the directory differs from the displayed name) —
  // otherwise it just echoes the title.
  const showPath =
    skill.path !== '' &&
    (skill.path.includes('/') || skill.path !== skill.name);

  return (
    <SelectableCard
      role="checkbox"
      selected={selected}
      ariaLabel={`Skill ${skill.name}`}
      onSelect={onSelect}
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
    </SelectableCard>
  );
}

function SkillGrid({
  skills,
  ariaLabel,
  selectedIds,
  onToggle,
}: {
  skills: DiscoveredSkill[];
  /** Names the group for assistive tech — the subgroup, or the repo when flush. */
  ariaLabel: string;
  selectedIds: Set<string>;
  onToggle: (skill: DiscoveredSkill) => void;
}) {
  return (
    <SelectableCardGrid role="group" ariaLabel={ariaLabel} minWidth={240}>
      {skills.map(skill => (
        <SkillCard
          key={skillId(skill)}
          skill={skill}
          selected={selectedIds.has(skillId(skill))}
          onSelect={() => onToggle(skill)}
        />
      ))}
    </SelectableCardGrid>
  );
}

function GroupedSkills({
  groups,
  query,
  selectedIds,
  onToggle,
}: {
  groups: RepoSkillGroup[];
  /** The active search term; drives when expansion is re-seeded. */
  query: string;
  selectedIds: Set<string>;
  onToggle: (skill: DiscoveredSkill) => void;
}) {
  const classes = useStyles();
  const repoKeys = groups.map(group => group.repoUrl);
  const repoSignature = repoKeys.join('|');

  // Expansion is controlled rather than seeded via `defaultExpandedKeys` (which
  // only applies on mount): a search must always reveal its matches, and a repo
  // the user had collapsed would otherwise keep its matches hidden behind a
  // trigger that advertises a non-zero count.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // Re-seed to "everything shown is open" whenever the query changes or the set
  // of matching repos changes (the latter also covers the initial load, where
  // skills arrive asynchronously while the query stays empty). Within a stable
  // query and repo set, a collapse the user performs sticks.
  useEffect(() => {
    setExpandedKeys(new Set(repoKeys));
    // repoSignature stands in for repoKeys (a new array each render); query is
    // read only to retrigger on search changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, repoSignature]);

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
        return (
          <Accordion id={group.repoUrl} key={group.repoUrl}>
            <AccordionTrigger>
              {group.repoSlug} ({total})
            </AccordionTrigger>
            <AccordionPanel>
              <Flex direction="column" gap="3">
                {group.ungrouped.length > 0 && (
                  <SkillGrid
                    skills={group.ungrouped}
                    ariaLabel={`Skills in ${group.repoSlug}`}
                    selectedIds={selectedIds}
                    onToggle={onToggle}
                  />
                )}
                {group.subgroups.map(subgroup => (
                  <div key={subgroup.key}>
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
                      selectedIds={selectedIds}
                      onToggle={onToggle}
                    />
                  </div>
                ))}
              </Flex>
            </AccordionPanel>
          </Accordion>
        );
      })}
    </AccordionGroup>
  );
}

export function NewAgentSkillsPage() {
  const classes = useStyles();
  const navigate = useNavigate();
  const newAgentLink = useRouteRef(newAgentRouteRef);
  const reviewLink = useRouteRef(newAgentReviewRouteRef);
  const { state, toggleSkill, isComplete } = useNewAgentForm();
  const {
    skills,
    isLoading,
    error,
    hasRepositories,
    failedRepositories,
    truncated,
  } = useSkillCatalog();

  const [query, setQuery] = useState('');
  const trimmed = query.trim();

  const selectedIds = useMemo(
    () => new Set(state.selectedSkills.map(skillId)),
    [state.selectedSkills],
  );

  // Client-side only: the whole catalogue is already loaded (unlike muster's
  // tool search, which delegates ranking to a backend BM25 endpoint), so a
  // simple token-boundary filter is enough and needs no debounce.
  const visibleSkills = useMemo(() => {
    if (trimmed === '') {
      return skills;
    }
    return skills.filter(skill =>
      matchesQuery(
        trimmed,
        `${skill.name} ${skill.description} ${skill.path} ${repoSlug(
          skill.repoUrl,
        )}`,
      ),
    );
  }, [skills, trimmed]);

  // Search filters within the grouping rather than replacing it with a flat
  // list: the repo/subfolder a match came from is part of what identifies a
  // skill, and keeping the structure means the page doesn't relayout on the
  // first keystroke. Empty repos and subgroups simply don't appear.
  const groups = useMemo(
    () => groupSkillsByRepo(visibleSkills),
    [visibleSkills],
  );

  const actions = useMemo(
    () => (
      <Flex gap="2">
        <Button
          variant="tertiary"
          onPress={() => newAgentLink && navigate(newAgentLink())}
        >
          Back
        </Button>
        <Button
          variant="primary"
          onPress={() => reviewLink && navigate(reviewLink())}
        >
          Continue
        </Button>
      </Flex>
    ),
    [newAgentLink, reviewLink, navigate],
  );

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
  // doesn't exist: step 1 sends them straight to review, and a deep link here
  // follows. `hasRepositories` is pure config, so this needs no fetch.
  if (!hasRepositories) {
    return <Navigate to={reviewLink ? reviewLink() : '..'} replace />;
  }

  return (
    <Content>
      <div className={classes.column}>
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.stepLabel}
        >
          Step 2 of 3: Skills
        </Text>
        <Text
          as="h2"
          variant="title-large"
          weight="bold"
          className={classes.pageTitle}
        >
          Select skills
        </Text>
        <Text as="p" className={classes.intro}>
          Packaged instructions the agent can reuse for specific kinds of tasks,
          discovered from the configured skill repositories. Optional — you can
          continue without selecting any.
        </Text>

        <Flex direction="column" gap="4">
          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                {isLoading && skills.length === 0 && (
                  <Text color="secondary">Discovering skills…</Text>
                )}

                {error && skills.length === 0 && (
                  <Alert
                    status="warning"
                    title="Couldn't discover skills"
                    description="The skill repositories couldn't be read. You can still create the agent without skills."
                  />
                )}

                {failedRepositories.length > 0 && (
                  <Alert
                    status="warning"
                    title="Some skill repositories couldn't be read"
                    description={`Skipped: ${failedRepositories.join(', ')}.`}
                  />
                )}

                {truncated && (
                  <Alert
                    status="warning"
                    title="Skill list may be incomplete"
                    description="A repository was too large to list fully (or a skill couldn't be read), so some skills may be missing."
                  />
                )}

                {!isLoading && !error && skills.length === 0 && (
                  <Alert
                    status="info"
                    title="No skills found"
                    description="No SKILL.md files were found in the configured repositories."
                  />
                )}

                {skills.length > 0 && (
                  <>
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
                      {/* The only place the step reports its own output: a
                          search can hide every selected card, and the review
                          summary lists them only inside the values YAML. */}
                      <Text variant="body-small" color="secondary">
                        {selectedIds.size} selected
                      </Text>
                    </Flex>

                    {visibleSkills.length > 0 ? (
                      <GroupedSkills
                        groups={groups}
                        query={trimmed}
                        selectedIds={selectedIds}
                        onToggle={toggleSkill}
                      />
                    ) : (
                      <Text color="secondary">
                        No skills match &quot;{trimmed}&quot;.
                      </Text>
                    )}
                  </>
                )}
              </Flex>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <Flex direction="column" gap="3">
                <Text as="p" color="secondary" className={classes.footerNote}>
                  The next step composes the Helm values and manifests so you
                  can review them before the agent is deployed.
                </Text>
                {actions}
              </Flex>
            </CardBody>
          </Card>
        </Flex>
      </div>
    </Content>
  );
}
