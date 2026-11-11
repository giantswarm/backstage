import { useMemo } from 'react';
import { useHomeInstallation } from '@giantswarm/backstage-plugin-gs';

import { SkillManagerClient } from '../apis/SkillManagerClient';
import { SKILL_MANAGER_SERVER } from '../lib/skillManager';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useMusterServerAvailability } from '@giantswarm/backstage-plugin-muster';

/**
 * Where the portal reads an installation's skills from:
 *
 * - `skill-manager`: the installation's muster lists skill-manager and reaches
 *   it as the person. Its sources are the only skill list.
 * - `portal`: it does not (an installation on an agent-platform release
 *   without skill-manager). gs-backend's own discovery of
 *   `agentPlatform.skills.repositories` answers, deprecated.
 * - `pending`: muster has not answered yet.
 * - `unreachable`: muster's server list could not be read, so whether
 *   skill-manager is there is unknown. Neither catalog answers: the portal's
 *   own would be a second, different list.
 */
export type SkillSource =
  | { kind: 'pending' }
  | { kind: 'portal' }
  | { kind: 'unreachable'; installation: string }
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
  // The portal's own discovery answers only once muster has said that it
  // lists no skill-manager (or runs under its shared identity), or there is
  // no muster to ask.
  const unknown = Boolean(musterApi) && presence === 'unknown';
  // An unknown presence that is not loading also occurs between two reads,
  // so only a failed read makes muster unreachable.
  const unreachable =
    unknown && Boolean(target) && availability.failedOf(target!);
  const pending =
    Boolean(musterApi) &&
    ((!target && isHomeLoading) || (unknown && !unreachable));

  return useMemo((): SkillSource => {
    if (pending) {
      return { kind: 'pending' };
    }
    if (target && unreachable) {
      return { kind: 'unreachable', installation: target };
    }
    if (target && musterApi && presence === 'available') {
      return {
        kind: 'skill-manager',
        installation: target,
        client: new SkillManagerClient(musterApi, target),
      };
    }
    return { kind: 'portal' };
  }, [pending, unreachable, target, musterApi, presence]);
}
