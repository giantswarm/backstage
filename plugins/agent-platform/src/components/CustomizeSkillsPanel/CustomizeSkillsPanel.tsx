import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, ButtonLink, Card, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import {
  CatalogNoMatch,
  EmptyStateCard,
  LoadingIndicator,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

import {
  agentsBySkill,
  rankSkills,
  searchSkills,
  skillSource,
  uniqueSkills,
  usedByLabel,
} from '../../lib/customize';
import {
  canonicalRepoUrl,
  canonicalSkillId,
  canProposeSkillTo,
  repoSlug,
  skillDetailPath,
} from '../../lib/skills';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import { newSkillRouteRef, skillsRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { useCustomizeData } from '../CustomizeDataProvider';
import { ShowMore } from '../ShowMore';
import { SkillsFilterBar, useSkillFilters } from '../SkillsFilterBar';

export type CustomizeSkillsPanelProps = {
  search: string;
};

/**
 * How many skill cards the grid shows before *Show more*, and how many each
 * press adds (T39): eight full rows of the three-across grid. A catalog runs
 * to hundreds of skills, and a grid of all of them is a page nobody scrolls —
 * searching is how a specific skill is found.
 */
export const SKILL_CARDS_SHOWN = 24;

const useStyles = makeStyles({
  // The prototype's tinted note above the catalog.
  banner: {
    padding: 'var(--bui-space-3) var(--bui-space-4)',
    borderRadius: 12,
    background: 'var(--agent-shell-rail-bg, #f0f7f9)',
  },
  // Three across at the page's width, stacking to one at phone width.
  grid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
    gap: 'var(--bui-space-4)',
  },
  card: {
    height: '100%',
    boxSizing: 'border-box',
    gap: 'var(--bui-space-2)',
    padding: 'var(--bui-space-4)',
    border: '1px solid var(--bui-border-1)',
    borderRadius: 12,
    '&[data-interactive]:hover': {
      borderColor: 'var(--bui-border-2)',
    },
  },
  // A long kebab- or snake-case name breaks inside the card rather than
  // running past it at phone width (T22 P3).
  name: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  description: {
    flex: '1 1 auto',
    overflowWrap: 'anywhere',
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--bui-space-1) var(--bui-space-3)',
  },
});

type Row = {
  id: string;
  name: string;
  description?: string;
  source: string;
  usedBy?: string;
  /** The skill's detail page (read-only for a skill outside github.com). */
  href?: string;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "71 skills from 3 sources in total." */
export function skillsTotalLine(
  skills: SkillCatalog['skills'],
): string | undefined {
  const unique = uniqueSkills(skills);
  if (unique.length === 0) {
    return undefined;
  }
  const sources = new Set(unique.map(skill => canonicalRepoUrl(skill.repoUrl)))
    .size;
  return `${plural(unique.length, 'skill')} from ${plural(
    sources,
    'source',
  )} in total.`;
}

/** The one alert for the repositories that could not be read. */
function UnreadRepositoriesAlert({
  catalog,
  anyListed,
}: {
  catalog: SkillCatalog;
  anyListed: boolean;
}) {
  const failures = catalog.failedRepositories;
  const reasons = [
    ...new Set(
      failures
        .map(repoUrl => catalog.failureMessages?.[repoUrl])
        .filter((reason): reason is string => Boolean(reason)),
    ),
  ];
  const missing = anyListed
    ? `The skills of ${failures.map(repoSlug).join(', ')} are missing below.`
    : 'No skill could be listed.';
  return (
    <Alert
      status="warning"
      title={
        failures.length === 1
          ? `Could not read ${repoSlug(failures[0])}`
          : `Could not read ${failures.length} skill repositories`
      }
      description={[...reasons, missing].join(' ')}
    />
  );
}

/**
 * One skill as the prototype's catalog card: its name, what it does in its
 * own words, where it comes from and how many agents use it — the whole card
 * opening the skill's page when it has one (with the route unbound, or a
 * repository URL that is not http(s), it has none and stays a plain card).
 */
function SkillCard({ card }: { card: Row }) {
  const classes = useStyles();
  const content = (
    <>
      <Text
        as="h2"
        variant="body-medium"
        weight="bold"
        className={classes.name}
      >
        {card.name}
      </Text>
      {card.description && (
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.description}
          title={card.description}
        >
          {card.description}
        </Text>
      )}
      <div className={classes.footer}>
        <Text variant="body-x-small" color="secondary">
          {card.source}
        </Text>
        {card.usedBy && (
          <Text variant="body-x-small" color="secondary">
            {card.usedBy}
          </Text>
        )}
      </div>
    </>
  );
  return card.href ? (
    <Card href={card.href} label={card.name} className={classes.card}>
      {content}
    </Card>
  ) : (
    <Card className={classes.card}>{content}</Card>
  );
}

/**
 * The Skills tab of the shell's Customize screen, in the prototype's
 * presentation: the skills discovered in the configured repositories as a
 * grid of catalog cards, the ones the agents in scope use most first, each
 * card opening the skill's page. Filters by source repository and by whether
 * an agent uses the skill, each only when it would change the list (T49).
 * Must be mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeSkillsPanel({ search }: CustomizeSkillsPanelProps) {
  const classes = useStyles();
  const isPhone = usePhoneLayout();
  const { skillCatalog } = useCustomizeData();
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const skillsRoute = useRouteRef(skillsRouteRef);
  const newSkillRoute = useRouteRef(newSkillRouteRef);
  // The add form's target repositories: the github.com entries of the same
  // signed-in-config list the catalog is discovered from — skills are
  // proposed as GitHub pull requests, and the endpoint refuses any other
  // repository (T61).
  const { config } = useSignedInConfig();
  const repositories =
    config?.getOptionalStringArray('agentPlatform.skills.repositories') ?? [];
  const proposable = repositories.filter(canProposeSkillTo);
  const usage = useMemo(() => agentsBySkill(agents), [agents]);
  const unique = useMemo(
    () => uniqueSkills(skillCatalog.skills),
    [skillCatalog.skills],
  );
  const searched = useMemo(
    () => searchSkills(unique, search),
    [unique, search],
  );
  // Source and Usage (T49); the agent wizard's skill step shares them (T60).
  const filters = useSkillFilters({
    skills: unique,
    searched,
    usage: agentsLoading ? undefined : usage,
  });
  const ranked = useMemo(
    () => rankSkills(filters.filtered, usage),
    [filters.filtered, usage],
  );
  // "The skills your agents use most come first" is advice for a catalog too
  // long to take in at once; over three cards it is volume framing (T39). So
  // the note appears only when the catalog outgrows the grid's first page.
  const totalLine = useMemo(
    () =>
      unique.length > SKILL_CARDS_SHOWN
        ? skillsTotalLine(skillCatalog.skills)
        : undefined,
    [unique, skillCatalog.skills],
  );
  const cards = useMemo<Row[]>(
    () =>
      ranked.map(skill => {
        const id = canonicalSkillId(skill);
        const detailPath = skillDetailPath(skill);
        return {
          id,
          name: skill.name,
          ...(skill.description ? { description: skill.description } : {}),
          source: skillSource(skill),
          ...(agentsLoading ? {} : { usedBy: usedByLabel(usage.get(id) ?? 0) }),
          ...(skillsRoute && detailPath
            ? { href: `${skillsRoute()}/${detailPath}` }
            : {}),
        };
      }),
    [ranked, agentsLoading, usage, skillsRoute],
  );

  const anyListed = skillCatalog.skills.length > 0;
  const unread =
    skillCatalog.error !== null || skillCatalog.failedRepositories.length > 0;

  const notes = (
    <>
      {skillCatalog.error && (
        <Alert
          status="danger"
          title="Could not read the skill repositories"
          description={skillCatalog.error.message}
        />
      )}
      {!skillCatalog.error && skillCatalog.failedRepositories.length > 0 && (
        <UnreadRepositoriesAlert catalog={skillCatalog} anyListed={anyListed} />
      )}
      {skillCatalog.truncated && (
        <Text as="p" variant="body-small" color="secondary">
          A repository holds more skills than one read returns, so some are
          missing.
        </Text>
      )}
    </>
  );

  let body;
  if (skillCatalog.isLoading) {
    body = <LoadingIndicator label="Reading the skill repositories…" />;
  } else if (!skillCatalog.hasRepositories) {
    body = (
      <EmptyStateCard
        title="No skill repositories"
        description="A platform admin configures them."
      />
    );
  } else if (!anyListed) {
    body = unread ? null : (
      <EmptyStateCard
        title="No skills yet"
        description="The configured repositories hold no skill."
      />
    );
  } else if (ranked.length === 0) {
    body = (
      <CatalogNoMatch
        plural="skills"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    );
  } else {
    body = (
      <Flex direction="column" gap="4">
        {totalLine && (
          <div className={classes.banner}>
            <Text as="p" variant="body-medium">
              The skills your agents use most come first.{' '}
              <Text variant="body-medium" color="secondary">
                {totalLine}
              </Text>
            </Text>
          </div>
        )}
        {/* Keyed on the search and filters so a new query starts again from
            the first page rather than inheriting how far the last was paged. */}
        <ShowMore
          key={`${search}|${filters.key}`}
          items={cards}
          initial={SKILL_CARDS_SHOWN}
          noun="skill"
        >
          {visible => (
            <ul className={classes.grid} aria-label="Skills">
              {visible.map(card => (
                <li key={card.id}>
                  <SkillCard card={card} />
                </li>
              ))}
            </ul>
          )}
        </ShowMore>
      </Flex>
    );
  }

  const canAdd =
    !skillCatalog.isLoading && proposable.length > 0 && Boolean(newSkillRoute);
  // Repositories configured, none on github.com: nothing to propose a skill
  // to, and the reason is the configuration, not the person.
  const cannotAddHere =
    !skillCatalog.isLoading &&
    repositories.length > 0 &&
    proposable.length === 0;
  const hasFilters = filters.dimensions.length > 0;

  return (
    <Flex direction="column" gap="4">
      {/* The filters, then Add skill on the same line at the right: the tab's
          search sits above, on the page. Add skill = a pull request to a
          source repository, opened as the person (G16 B) — offered whenever a
          repository to target exists. A page of its own
          (`/agent-platform/skills/new`), in the same in-content wizard frame
          as the other create flows. */}
      {(hasFilters || canAdd) && (
        <Flex
          align="center"
          justify={hasFilters ? 'between' : 'end'}
          gap="4"
          style={{ flexWrap: 'wrap' }}
        >
          <SkillsFilterBar filters={filters} />
          {canAdd && newSkillRoute && (
            <ButtonLink
              href={newSkillRoute()}
              variant="primary"
              iconStart={<AddIcon />}
              // On a phone the filters take the row and the action its own
              // full-width line under them, as the page's create action does.
              style={isPhone ? { width: '100%' } : undefined}
            >
              Add skill
            </ButtonLink>
          )}
        </Flex>
      )}
      {cannotAddHere && (
        <Text as="p" variant="body-small" color="secondary">
          Adding skills here needs a github.com skill repository; add them in
          their own repository instead.
        </Text>
      )}
      {notes}
      {body}
    </Flex>
  );
}
