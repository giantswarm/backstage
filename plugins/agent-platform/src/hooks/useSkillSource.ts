import { useMemo } from 'react';
import { useHomeInstallation } from '@giantswarm/backstage-plugin-gs';

import { SkillManagerClient } from '../apis/SkillManagerClient';
import { SKILL_MANAGER_SERVER } from '../lib/skillManager';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useMusterServerAvailability } from './useMusterServerAvailability';

/**
 * Where the portal reads an installation's skills from:
 *
 * - `skill-manager`: the installation's muster lists skill-manager and reaches
 *   it as the person. Its sources are the only skill list.
 * - `portal`: it does not (an installation on an agent-platform release
 *   without skill-manager). gs-backend's own discovery of
 *   `agentPlatform.skills.repositories` answers, deprecated.
 * - `pending`: not known yet.
 */
export type SkillSource =
  | { kind: 'pending' }
  | { kind: 'portal' }
  | {
      kind: 'skill-manager';
      installation: string;
      client: SkillManagerClient;
    };

/**
 * The skill source of `installation`, else of the portal's home
 * installation: an agent's skills come from the installation it runs on.
 */
export function useSkillSource(installation?: string): SkillSource {
  const musterApi = useMusterPluginApi();
  const { home, isLoading: isHomeLoading } = useHomeInstallation();
  const target = installation || home?.name;
  const availability = useMusterServerAvailability(
    SKILL_MANAGER_SERVER,
    target ? [target] : [],
  );
  const presence = target ? availability.presenceOf(target) : undefined;
  const pending =
    (!target && isHomeLoading) ||
    (presence === 'unknown' && availability.isLoading);

  return useMemo((): SkillSource => {
    if (pending) {
      return { kind: 'pending' };
    }
    if (target && musterApi && presence === 'available') {
      return {
        kind: 'skill-manager',
        installation: target,
        client: new SkillManagerClient(musterApi, target),
      };
    }
    return { kind: 'portal' };
  }, [pending, target, musterApi, presence]);
}
