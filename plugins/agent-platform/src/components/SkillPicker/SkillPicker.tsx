import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';

import { useNewAgentForm } from '../NewAgentFormProvider';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { repoSlug, skillId } from '../../lib/skills';
import {
  SelectableCard,
  SelectableCardGrid,
  useSelectableCardStyles,
} from '../SelectableCard';

export function SkillPicker() {
  const classes = useSelectableCardStyles();
  const { state, toggleSkill } = useNewAgentForm();
  const {
    skills,
    isLoading,
    error,
    hasRepositories,
    failedRepositories,
    truncated,
  } = useSkillCatalog();

  const label = (
    <FieldLabel
      label="Skills"
      secondaryLabel="optional"
      description="Packaged instructions an agent can reuse for specific kinds of tasks. Discovered from the configured skill repositories."
    />
  );

  if (!hasRepositories) {
    return (
      <Flex direction="column" gap="2">
        {label}
        <Alert
          status="info"
          title="No skill repositories configured"
          description="Set agentPlatform.skills.repositories in app-config to let users pick skills. New agents start without any."
        />
      </Flex>
    );
  }

  const selectedIds = new Set(state.selectedSkills.map(skillId));

  return (
    <Flex direction="column" gap="2">
      {label}

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
        <SelectableCardGrid role="group" ariaLabel="Skills" minWidth={240}>
          {skills.map(skill => {
            const id = skillId(skill);
            const isSelected = selectedIds.has(id);
            // Show the source repo; append the path only when it adds
            // information (nested skill, or the directory differs from the
            // displayed name) — otherwise it just echoes the title.
            const showPath =
              skill.path !== '' &&
              (skill.path.includes('/') || skill.path !== skill.name);

            return (
              <SelectableCard
                key={id}
                role="checkbox"
                selected={isSelected}
                ariaLabel={`Skill ${skill.name}`}
                onSelect={() => toggleSkill(skill)}
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
          })}
        </SelectableCardGrid>
      )}
    </Flex>
  );
}
