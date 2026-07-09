import { Alert, FieldLabel, Flex, Text } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckBoxIcon from '@material-ui/icons/CheckBox';
import CheckBoxOutlineBlankIcon from '@material-ui/icons/CheckBoxOutlineBlank';

import { useNewAgentForm } from '../NewAgentFormProvider';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { repoSlug, skillId } from '../../lib/skills';

const useStyles = makeStyles(theme => ({
  grid: {
    display: 'grid',
    gap: theme.spacing(1.5),
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  },
  // A full-area button so the whole card is the toggle target (bui's Card
  // button variant renders a collapsed trigger in this version).
  card: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    font: 'inherit',
    '&:hover': {
      borderColor: theme.palette.text.secondary,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 1,
    },
  },
  selected: {
    borderColor: theme.palette.primary.main,
    outline: `1px solid ${theme.palette.primary.main}`,
  },
  code: {
    fontFamily: 'monospace',
  },
  indicator: {
    flexShrink: 0,
  },
  indicatorUnselected: {
    color: theme.palette.text.secondary,
    opacity: 0.5,
  },
  indicatorSelected: {
    color: theme.palette.primary.main,
  },
}));

export function SkillPicker() {
  const classes = useStyles();
  const { state, toggleSkill } = useNewAgentForm();
  const { skills, isLoading, error, hasRepositories, failedRepositories } =
    useSkillCatalog();

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

      {!isLoading && !error && skills.length === 0 && (
        <Alert
          status="info"
          title="No skills found"
          description="No SKILL.md files were found in the configured repositories."
        />
      )}

      {skills.length > 0 && (
        <div className={classes.grid} role="group" aria-label="Skills">
          {skills.map(skill => {
            const id = skillId(skill);
            const isSelected = selectedIds.has(id);
            const Indicator = isSelected
              ? CheckBoxIcon
              : CheckBoxOutlineBlankIcon;
            // Show the source repo; append the path only when it adds
            // information (nested skill, or the directory differs from the
            // displayed name) — otherwise it just echoes the title.
            const showPath =
              skill.path !== '' &&
              (skill.path.includes('/') || skill.path !== skill.name);

            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                aria-label={`Skill ${skill.name}`}
                onClick={() => toggleSkill(skill)}
                className={`${classes.card} ${
                  isSelected ? classes.selected : ''
                }`}
              >
                <Flex align="start" justify="between" gap="2">
                  <Flex direction="column" gap="1">
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
                  </Flex>
                  <Indicator
                    fontSize="small"
                    aria-hidden
                    className={`${classes.indicator} ${
                      isSelected
                        ? classes.indicatorSelected
                        : classes.indicatorUnselected
                    }`}
                  />
                </Flex>
              </button>
            );
          })}
        </div>
      )}
    </Flex>
  );
}
