import { useMemo } from 'react';

import type { AgentRow } from '../components/AgentsDataProvider';
import { connectorIcons } from '../components/AgentDetailPage/helpers';
import {
  type ConnectorMark,
  connectorMarks,
  namedPresets,
} from '../lib/connectorMarks';
import { reachedConnectors, reachNeedsCatalogue } from '../lib/toolsetReach';
import { useMusterServersByInstallation } from './useMusterServers';
import { useReachCataloguesByInstallation } from './useReachCatalogue';
import { useToolsetPresetIconsByInstallation } from './useToolsetPresets';

const NO_ICONS: ReadonlyMap<string, string> = new Map();
const NO_LABELS: ReadonlyMap<string, string> = new Map();
const NO_PRESET_ICONS: ReadonlyMap<string, string> = new Map();

/** Each installation once, in the order the rows first name it. */
function installationsOf(rows: readonly AgentRow[]): string[] {
  return [...new Set(rows.map(row => row.installation))];
}

/**
 * The list's connectors, by row id, as the agent page's Connectors section
 * shows them: read from the toolset and direct bindings each row carries. The
 * MCPServers (logos, display names) and, for a tool picked one by one, the
 * caller's catalogue are read and built once per installation — from the
 * agent page's cached queries — and only for an installation with a row whose
 * toolset names a connector; muster's preset icons likewise, only where a
 * row's toolset names a preset.
 */
export function useAgentListConnectors(
  rows: readonly AgentRow[],
): ReadonlyMap<string, ConnectorMark[]> {
  const serverKey = installationsOf(
    rows.filter(
      row =>
        reachNeedsCatalogue(row.toolset) ||
        reachedConnectors(row.toolset).length > 0,
    ),
  ).join('\n');
  const catalogueKey = installationsOf(
    rows.filter(row => reachNeedsCatalogue(row.toolset)),
  ).join('\n');
  const presetKey = installationsOf(
    rows.filter(row => namedPresets(row.toolset).length > 0),
  ).join('\n');
  // Stable while the set holds, however often the rows change.
  const serverInstallations = useMemo(
    () => (serverKey ? serverKey.split('\n') : []),
    [serverKey],
  );
  const catalogueInstallations = useMemo(
    () => (catalogueKey ? catalogueKey.split('\n') : []),
    [catalogueKey],
  );
  const presetInstallations = useMemo(
    () => (presetKey ? presetKey.split('\n') : []),
    [presetKey],
  );
  const muster = useMusterServersByInstallation(serverInstallations);
  const presetIcons = useToolsetPresetIconsByInstallation(presetInstallations);
  const catalogues = useReachCataloguesByInstallation(
    catalogueInstallations,
    muster,
  );
  const icons = useMemo(
    () =>
      new Map(
        [...muster].map(([installation, { servers }]) => [
          installation,
          connectorIcons(servers),
        ]),
      ),
    [muster],
  );

  return useMemo(
    () =>
      new Map(
        rows.map(row => [
          row.id,
          connectorMarks({
            toolset: row.toolset,
            groups: reachNeedsCatalogue(row.toolset)
              ? catalogues.get(row.installation)
              : undefined,
            icons: icons.get(row.installation) ?? NO_ICONS,
            labels: muster.get(row.installation)?.labels ?? NO_LABELS,
            presetIcons: presetIcons.get(row.installation) ?? NO_PRESET_ICONS,
            direct: row.directServers,
          }),
        ]),
      ),
    [rows, muster, catalogues, icons, presetIcons],
  );
}
