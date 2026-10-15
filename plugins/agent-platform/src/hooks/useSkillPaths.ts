import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';

import { type DiscoveredSkill, skillDetailPath } from '../lib/skills';
import { skillsRouteRef } from '../routes';

type SkillAddress = Pick<DiscoveredSkill, 'repoUrl' | 'path'>;

export type SkillPaths = {
  /** One skill's page, `<skills>/<detail path>`. */
  detail: (skill: SkillAddress) => string | undefined;
  /** Its edit form, `<skills>/edit/<detail path>`. */
  edit: (skill: SkillAddress) => string | undefined;
};

/**
 * The skill pages' hrefs, resolved through `skillsRouteRef` with the path
 * codec of `skillDetailPath`: a skill's address is a splat, so a route ref
 * cannot carry it as params. Each is `undefined` where the skills page is not
 * mounted, or for a repository `skillDetailPath` cannot address, so callers
 * render plain text rather than a link that goes nowhere.
 */
export function useSkillPaths(): SkillPaths {
  const skillsRoute = useRouteRef(skillsRouteRef);
  const skills = skillsRoute?.();
  return useMemo(() => {
    const under = (prefix: string, skill: SkillAddress) => {
      const detailPath = skillDetailPath(skill);
      return skills === undefined || detailPath === undefined
        ? undefined
        : `${skills}${prefix}/${detailPath}`;
    };
    return {
      detail: skill => under('', skill),
      edit: skill => under('/edit', skill),
    };
  }, [skills]);
}
