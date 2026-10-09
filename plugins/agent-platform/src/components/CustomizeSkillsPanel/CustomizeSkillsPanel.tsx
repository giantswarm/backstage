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
  usedByLabel,
} from '../../lib/customize';
import { repoSlug, skillId } from '../../lib/skills';
import { useAgents } from '../AgentsDataProvider';
import { useCustomizeData } from '../CustomizeDataProvider';

export type CustomizeSkillsPanelProps = {
  search: string;
};

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

  const failures = skillCatalog.failedRepositories;
  const notes = (
    <>
      {skillCatalog.error && (
        <Alert
          status="danger"
          title="Could not read the skill repositories"
          description={skillCatalog.error.message}
        />
      )}
      {failures.length > 0 && (
        <Alert
          status="warning"
          title={
            failures.length === 1
              ? `Could not read ${repoSlug(failures[0])}`
              : `Could not read ${failures.length} skill repositories`
          }
          description={`The skills of ${failures
            .map(repoSlug)
            .join(', ')} are missing below.`}
        />
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
  } else if (skillCatalog.skills.length === 0) {
    body = skillCatalog.error ? null : (
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
      <Grid.Root columns={{ initial: '1', sm: '2', lg: '3' }} gap="4">
        {ranked.map(skill => {
          const id = skillId(skill);
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
                        {repoSlug(skill.repoUrl)}
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
    );
  }

  return (
    <Flex direction="column" gap="4">
      {notes}
      {body}
    </Flex>
  );
}
