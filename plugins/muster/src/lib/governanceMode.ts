import type { GovernanceMode, MusterServerInfoResponse } from '../apis/types';

/**
 * The installation's governance mode as the portal reads it, or `undefined`
 * when it is not known: muster does not report it, it reported something
 * else, or muster could not be asked.
 *
 * This is the one place the mode's source plugs in. muster (branch
 * `tool-approval`) does not report its mode to clients yet: it appears only
 * inside approval records (`contract-muster-approval.md` §4), and
 * muster-backend's `/server-info` carries only muster's icon. When muster
 * reports the mode read-only, map it here (and pass it through muster-backend
 * `/server-info` as `governance`); nothing else in the portal changes.
 *
 * Unknown is never read as `trusted`: the portal then pre-selects and sends
 * the stricter *Recommended* preset and says the mode could not be read
 * (`defaultPresetFor`), as muster itself treats an unreadable governance
 * configuration as governed.
 */
export function governanceModeOf(
  serverInfo: MusterServerInfoResponse | undefined,
): GovernanceMode | undefined {
  const reported = serverInfo?.governance;
  return reported === 'trusted' || reported === 'governed'
    ? reported
    : undefined;
}

/** The query key of muster-backend's `/server-info` for `installation`. */
export function musterServerInfoQueryKey(installation: string | undefined) {
  return ['muster', 'server-info', installation] as const;
}
