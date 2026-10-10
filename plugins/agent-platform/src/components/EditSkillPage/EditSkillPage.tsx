import { useMemo } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Alert } from '@backstage/ui';
import {
  EmptyStateCard,
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useSkillContent } from '../../hooks/useSkillContent';
import {
  canonicalSkillId,
  parseSkillDetailPath,
  skillDetailPath,
} from '../../lib/skills';
import { skillsRouteRef } from '../../routes';
import { AddSkillPage } from '../AddSkillPage';
import { SHELL_CUSTOMIZE_PATH } from '../ShellCustomizeRedirect';

/**
 * Edit a skill (`/agent-platform/skills/edit/<owner>/<repo>[/<skill dir>]`):
 * the add-skill flow, prefilled. The skill is found in the discovered catalog
 * (like its detail page), its SKILL.md read at the commit the catalog pinned
 * (`GET /agent-skills/content`), and then `AddSkillPage` takes over in edit
 * mode — submitting opens a pull request that rewrites the skill's SKILL.md,
 * as the signed-in person.
 */
export function EditSkillPage() {
  const splat = useParams()['*'] ?? '';
  const target = parseSkillDetailPath(splat);
  const catalog = useSkillCatalog();
  const skillsRoute = useRouteRef(skillsRouteRef);

  const skill = useMemo(() => {
    if (!target) {
      return undefined;
    }
    const wanted = canonicalSkillId(target);
    return catalog.skills.find(
      candidate => canonicalSkillId(candidate) === wanted,
    );
  }, [catalog.skills, target]);
  const { content, isLoading, error } = useSkillContent(skill);

  if (!target) {
    return <Navigate to={`${SHELL_CUSTOMIZE_PATH}/skills`} replace />;
  }

  const detailPath = skill ? skillDetailPath(skill) : undefined;
  const skillHref =
    skillsRoute && detailPath
      ? `${skillsRoute()}/${detailPath}`
      : `${SHELL_CUSTOMIZE_PATH}/skills`;

  if (skill && content) {
    return <AddSkillPage edit={{ skill, content, skillHref }} />;
  }

  let body;
  if (catalog.isLoading || isLoading) {
    body = <LoadingIndicator label="Reading the skill…" />;
  } else if (error) {
    body = (
      <Alert
        status="danger"
        title="Could not read the skill"
        description={error.message}
      />
    );
  } else if (catalog.error || catalog.failedRepositories.length > 0) {
    body = (
      <Alert
        status="warning"
        title="Could not read the skill repositories"
        description="The skill may exist, but its repository could not be read right now. Try again in a moment."
      />
    );
  } else {
    body = (
      <EmptyStateCard
        title="Skill not found"
        description="No skill at this address was discovered in the configured repositories. It may have been renamed or removed — the list has what exists now."
      />
    );
  }

  return (
    <WizardFrame
      title="Edit skill"
      context="Customize / Skills"
      closeHref={skillHref}
    >
      {body}
    </WizardFrame>
  );
}
