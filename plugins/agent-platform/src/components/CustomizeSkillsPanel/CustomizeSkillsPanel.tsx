import { useMemo, useState } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert, Button, Card, CardBody, Flex, Grid, Text } from '@backstage/ui';
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
import { skillsRouteRef } from '../../routes';
import { AddSkillDialog } from '../AddSkillDialog';
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
  const skillsRoute = useRouteRef(skillsRouteRef);
  // The dialog's target repositories: the same signed-in-config list the
  // catalog is discovered from.
  const { config } = useSignedInConfig();
  const repositories =
    config?.getOptionalStringArray('agentPlatform.skills.repositories') ?? [];
  const [isAddOpen, setAddOpen] = useState(false);
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
            const detailPath = skillDetailPath(skill);
            const cardBody = (
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
            );
            // Each card opens the skill's page; a skill outside github.com (or
            // with the route unbound) has no page and stays a plain card.
            return (
              <Grid.Item key={id}>
                {skillsRoute && detailPath ? (
                  <Card
                    href={`${skillsRoute()}/${detailPath}`}
                    label={skill.name}
                    style={{ height: '100%' }}
                  >
                    {cardBody}
                  </Card>
                ) : (
                  <Card style={{ height: '100%' }}>{cardBody}</Card>
                )}
              </Grid.Item>
            );
          })}
        </Grid.Root>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {/* Add skill = a pull request to a source repository, opened as the
          person (G16 B) — offered whenever a repository to target exists. */}
      {!skillCatalog.isLoading && repositories.length > 0 && (
        <Flex justify="end">
          <Button
            variant="primary"
            iconStart={<AddIcon />}
            onPress={() => setAddOpen(true)}
          >
            Add skill
          </Button>
        </Flex>
      )}
      {notes}
      {body}
      <AddSkillDialog
        repositories={repositories}
        isOpen={isAddOpen}
        onOpenChange={setAddOpen}
      />
    </Flex>
  );
}
