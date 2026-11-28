import type {
  GovernanceMode,
  McpServerListResponse,
  MusterServerInfoResponse,
} from '../apis/types';

/**
 * The installation's governance mode as the portal reads it, or `undefined`
 * when it is not known: muster does not report it (an older muster), it
 * reported something else, or muster could not be asked.
 *
 * muster reports its mode as `governance` on `core_mcpserver_list`
 * (`trusted` or `governed`), which muster-backend's `/servers` passes on
 * unchanged (`listServers`). `/server-info`'s `governance` is read after it,
 * for a backend that serves it there. The first source that names a mode
 * wins.
 *
 * Unknown is never read as `trusted`: the portal then pre-selects and sends
 * the stricter *Recommended* preset and says the mode could not be read
 * (`defaultPresetFor`), as muster itself treats an unreadable governance
 * configuration as governed.
 */
export function governanceModeOf(
  ...sources: ReadonlyArray<
    McpServerListResponse | MusterServerInfoResponse | undefined
  >
): GovernanceMode | undefined {
  for (const source of sources) {
    const reported: unknown = source?.governance;
    if (reported === 'trusted' || reported === 'governed') {
      return reported;
    }
  }
  return undefined;
}

/** The query key of muster-backend's `/server-info` for `installation`. */
export function musterServerInfoQueryKey(installation: string | undefined) {
  return ['muster', 'server-info', installation] as const;
}
