import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Alert } from '@backstage/ui';
import {
  EmptyStateCard,
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useSkillContent } from '../../hooks/useSkillContent';
import { useSkillPaths } from '../../hooks/useSkillPaths';
import {
  canonicalSkillId,
  canProposeSkillTo,
  isSkillContentReadable,
  parseSkillDetailPath,
} from '../../lib/skills';
import { AddSkillPage } from '../AddSkillPage';
import { ShellCustomizeRedirect } from '../ShellCustomizeRedirect';

/**
 * Edit a skill (`/agent-platform/skills/edit/<owner>/<repo>[/<skill dir>]`):
 * the add-skill flow, prefilled. The skill is found in the discovered catalog
 * (like its detail page), its SKILL.md read at the commit the catalog pinned
 * (`GET /agent-skills/content`), and then `AddSkillPage` takes over in edit
 * mode — submitting opens a pull request that rewrites the skill's SKILL.md,
 * as the signed-in person. A skill whose SKILL.md the portal could not read
 * (`contentReadable: false` in the catalog) is not read again here: the page
 * says the portal cannot read its source, and there is no form. Neither is
 * there one for a skill outside github.com, whose repository the pull-request
 * endpoint refuses.
 */
export function EditSkillPage() {
  const splat = useParams()['*'] ?? '';
  const target = parseSkillDetailPath(splat);
  const catalog = useSkillCatalog();
  const skillPaths = useSkillPaths();
  const { skills: customizeSkills } = useCustomizePaths();

  const skill = useMemo(() => {
    if (!target) {
      return undefined;
    }
    const wanted = canonicalSkillId(target);
    return catalog.skills.find(
      candidate => canonicalSkillId(candidate) === wanted,
    );
  }, [catalog.skills, target]);
  const readable = skill ? isSkillContentReadable(skill) : false;
  // Pull requests are github.com only (the skill-PR endpoint refuses any
  // other repository), so a skill elsewhere is not read for a form it could
  // never submit.
  const proposable = skill ? canProposeSkillTo(skill.repoUrl) : false;
  const { content, isLoading, error } = useSkillContent(
    readable && proposable ? skill : undefined,
  );

  if (!target) {
    return <ShellCustomizeRedirect tab="skills" keepSearch={false} />;
  }

  const skillHref =
    (skill && skillPaths.detail(skill)) ?? customizeSkills ?? '/';

  if (skill && content && proposable) {
    return <AddSkillPage edit={{ skill, content, skillHref }} />;
  }

  let body;
  if (skill && !proposable) {
    body = (
      <Alert
        status="info"
        title="Read-only in the portal"
        description="This skill's repository is not on github.com, and the portal proposes changes as GitHub pull requests. Change the skill in its repository."
      />
    );
  } else if (skill && !readable) {
    body = (
      <Alert
        status="info"
        title="The portal cannot read this skill's source"
        description="Its SKILL.md could not be read, so the skill cannot be edited here. Change it in its repository."
      />
    );
  } else if (catalog.isLoading || isLoading) {
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
        description="No skill with this address exists in the configured repositories. It may have been renamed or removed."
      />
    );
  }

  return (
    <WizardFrame
      title="Edit skill"
      documentTitle={[skill ? `Edit ${skill.name}` : 'Edit skill', 'Skills']}
      context="Customize / Skills"
      closeHref={skillHref}
    >
      {body}
    </WizardFrame>
  );
}
