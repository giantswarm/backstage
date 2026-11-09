import { connectorIconOf } from '@giantswarm/backstage-plugin-muster';

import {
  type CatalogueGroup,
  type DeclaredToolset,
  presetLabel,
  presetNameOf,
} from './toolset';
import { reachedConnectors } from './toolsetReach';

/**
 * The portal's own mark for a preset muster sends no icon for (an older
 * muster, an installation's preset without one): the generic preset artwork,
 * as a base64 `data:` URI so it passes `connectorIconOf` like any other icon.
 */
export const GENERIC_PRESET_ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiM1RjVFNUEiLz48ZyBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMTYgOWw3IDMuNS03IDMuNS03LTMuNXoiLz48cGF0aCBkPSJNOSAxNmw3IDMuNSA3LTMuNSIvPjxwYXRoIGQ9Ik05IDE5LjVsNyAzLjUgNy0zLjUiLz48L2c+PC9zdmc+';

/** The presets a declared toolset names (`preset:<name>`), each once, in order. */
export function namedPresets(toolset: DeclaredToolset | undefined): string[] {
  if (toolset?.state !== 'declared') {
    return [];
  }
  const names = toolset.selectors.flatMap(selector => {
    const name = presetNameOf(selector);
    return name === undefined ? [] : [name];
  });
  return [...new Set(names)];
}

/** One connector's logo, as the agent page and the Agents list show it. */
export type ConnectorMark = {
  key: string;
  name: string;
  icon?: string;
  detail?: string;
  /** The binding pauses for the person's approval before every call. */
  approval?: boolean;
};

/**
 * A server the agent binds directly rather than through the gateway, named
 * by `directServerName`.
 */
export type DirectServer = ConnectorMark;

/**
 * An agent's connectors as logos: first the presets its toolset names, each
 * by its label and muster's icon for it (`presetIcons`, by preset name) when
 * usable, else {@link GENERIC_PRESET_ICON}; then the connectors it names
 * (`reachedConnectors`; none for full or implicit access, which the reach
 * sentence says), each by its display name and icon; then the servers it
 * binds directly.
 */
export function connectorMarks({
  toolset,
  groups,
  icons,
  labels,
  presetIcons,
  direct = [],
}: {
  toolset: DeclaredToolset | undefined;
  groups?: readonly CatalogueGroup[];
  icons: ReadonlyMap<string, string>;
  labels: ReadonlyMap<string, string>;
  presetIcons?: ReadonlyMap<string, string>;
  direct?: readonly DirectServer[];
}): ConnectorMark[] {
  return [
    ...namedPresets(toolset).map(name => ({
      key: `preset:${name}`,
      name: presetLabel(name),
      icon: connectorIconOf(presetIcons?.get(name)) ?? GENERIC_PRESET_ICON,
    })),
    ...reachedConnectors(toolset, groups).map(name => ({
      key: `server:${name}`,
      name: labels.get(name) ?? name,
      icon: icons.get(name),
    })),
    ...direct,
  ];
}
