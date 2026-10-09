import { useMemo } from 'react';
import { Alert, Card, CardBody, Flex, Grid, Text } from '@backstage/ui';
import {
  EmptyStateCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  agentsBySkill,
  rankSkills,
  searchSkills,
  skillSource,
  uniqueSkills,
  usedByLabel,
} from '../../lib/customize';
import { canonicalRepoUrl, canonicalSkillId, repoSlug } from '../../lib/skills';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import { useAgents } from '../AgentsDataProvider';
import { useCustomizeData } from '../CustomizeDataProvider';

export type CustomizeSkillsPanelProps = {
  search: string;
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
 * The Skills tab of the shell's Customize screen: the skills discovered in
 * the configured repositories, the ones the agents in scope use most first.
 * Must be mounted inside a `CustomizeDataProvider`.
 */
export function CustomizeSkillsPanel({ search }: CustomizeSkillsPanelProps) {
  const { skillCatalog } = useCustomizeData();
  const { rows: agents, isLoading: agentsLoading } = useAgents();
  const usage = useMemo(() => agentsBySkill(agents), [agents]);
  const ranked = useMemo(
    () => rankSkills(searchSkills(skillCatalog.skills, search), usage),
    [skillCatalog.skills, search, usage],
  );
  const totalLine = useMemo(
    () => skillsTotalLine(skillCatalog.skills),
    [skillCatalog.skills],
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
      <Flex direction="column" gap="3">
        {totalLine && (
          <Text as="p" variant="body-medium">
            The skills your agents use most come first.{' '}
            <Text variant="body-medium" color="secondary">
              {totalLine}
            </Text>
          </Text>
        )}
        <Grid.Root columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
          {ranked.map(skill => {
            const id = canonicalSkillId(skill);
            return (
              <Grid.Item key={id}>
                <Card style={{ height: '100%' }}>
                  <CardBody>
                    <Flex direction="column" gap="3">
                      <Text as="h3" variant="body-large" weight="bold">
                        {skill.name}
                      </Text>
                      {skill.description && (
                        <Text as="p" variant="body-medium" color="secondary">
                          {skill.description}
                        </Text>
                      )}
                      <Flex justify="between" gap="2">
                        <Text variant="body-small" color="secondary">
                          {skillSource(skill)}
                        </Text>
                        {!agentsLoading && (
                          <Text variant="body-small" color="secondary">
                            {usedByLabel(usage.get(id) ?? 0)}
                          </Text>
                        )}
                      </Flex>
                    </Flex>
                  </CardBody>
                </Card>
              </Grid.Item>
            );
          })}
        </Grid.Root>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {notes}
      {body}
    </Flex>
  );
}
