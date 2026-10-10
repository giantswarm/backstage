import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, ButtonLink, Card, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import {
  EmptyStateCard,
  LoadingIndicator,
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
  repoSlug,
  skillDetailPath,
} from '../../lib/skills';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import { newSkillRouteRef, skillsRouteRef } from '../../routes';
import { useAgents } from '../AgentsDataProvider';
import { useCustomizeData } from '../CustomizeDataProvider';

export type CustomizeSkillsPanelProps = {
  search: string;
};

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
  description: {
    flex: '1 1 auto',
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
  /** The skill's detail page; a skill outside github.com has none. */
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
 * opening the skill's page when it has one (a skill outside github.com, or
 * with the route unbound, has none and stays a plain card).
 */
function SkillCard({ card }: { card: Row }) {
  const classes = useStyles();
  const content = (
    <>
      <Text as="h2" variant="body-medium" weight="bold">
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
 * card opening the skill's page. Must be mounted inside a
 * `CustomizeDataProvider`.
 */
export function CustomizeSkillsPanel({ search }: CustomizeSkillsPanelProps) {
  const classes = useStyles();
  const { skillCatalog } = useCustomizeData();
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const skillsRoute = useRouteRef(skillsRouteRef);
  const newSkillRoute = useRouteRef(newSkillRouteRef);
  // The add form's target repositories: the same signed-in-config list the
  // catalog is discovered from.
  const { config } = useSignedInConfig();
  const repositories =
    config?.getOptionalStringArray('agentPlatform.skills.repositories') ?? [];
  const usage = useMemo(() => agentsBySkill(agents), [agents]);
  const ranked = useMemo(
    () => rankSkills(searchSkills(skillCatalog.skills, search), usage),
    [skillCatalog.skills, search, usage],
  );
  const totalLine = useMemo(
    () => skillsTotalLine(skillCatalog.skills),
    [skillCatalog.skills],
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
        description="Skills are read from the repositories a platform admin configures, and none is configured."
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
      <Text as="p" variant="body-medium" color="secondary">
        No skills match “{search.trim()}”.
      </Text>
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
        <ul className={classes.grid} aria-label="Skills">
          {cards.map(card => (
            <li key={card.id}>
              <SkillCard card={card} />
            </li>
          ))}
        </ul>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {/* Add skill = a pull request to a source repository, opened as the
          person (G16 B) — offered whenever a repository to target exists.
          A page of its own (`/agent-platform/skills/new`), in the same
          in-content wizard frame as the other create flows. */}
      {!skillCatalog.isLoading && repositories.length > 0 && newSkillRoute && (
        <Flex justify="end">
          <ButtonLink
            href={newSkillRoute()}
            variant="primary"
            iconStart={<AddIcon />}
          >
            Add skill
          </ButtonLink>
        </Flex>
      )}
      {notes}
      {body}
    </Flex>
  );
}
