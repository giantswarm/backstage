import { connectorIconOf } from '@giantswarm/backstage-plugin-muster';
import {
  connectorMarks,
  GENERIC_PRESET_ICON,
  namedPresets,
} from './connectorMarks';

const GENERIC_PRESET_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#5F5E5A"/><g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 9l7 3.5-7 3.5-7-3.5z"/><path d="M9 16l7 3.5 7-3.5"/><path d="M9 19.5l7 3.5 7-3.5"/></g></svg>';

describe('connectorMarks', () => {
  const icons = new Map([['jira', 'data:image/png;base64,AA==']]);
  const labels = new Map([['jira', 'Jira']]);

  it("names a composed toolset's connectors, then the direct servers", () => {
    expect(
      connectorMarks({
        toolset: {
          state: 'declared',
          carrier: 'c',
          selectors: ['server:jira'],
        },
        icons,
        labels,
        direct: [{ key: 'weather#0', name: 'Weather', detail: 'All' }],
      }),
    ).toEqual([
      { key: 'server:jira', name: 'Jira', icon: 'data:image/png;base64,AA==' },
      { key: 'weather#0', name: 'Weather', detail: 'All' },
    ]);
  });

  it('names none for implicit access', () => {
    expect(
      connectorMarks({
        toolset: { state: 'implicit-full', carrier: 'c' },
        icons,
        labels,
      }),
    ).toEqual([]);
  });

  it("names the toolset's presets first, by label and muster's icon, then its connectors", () => {
    const presetIcons = new Map([['read-only', 'data:image/png;base64,BB==']]);
    expect(
      connectorMarks({
        toolset: {
          state: 'declared',
          carrier: 'c',
          selectors: ['server:jira', 'preset:read-only'],
        },
        icons,
        labels,
        presetIcons,
        direct: [{ key: 'weather#0', name: 'Weather' }],
      }),
    ).toEqual([
      {
        key: 'preset:read-only',
        name: 'Read-only tools',
        icon: 'data:image/png;base64,BB==',
      },
      { key: 'server:jira', name: 'Jira', icon: 'data:image/png;base64,AA==' },
      { key: 'weather#0', name: 'Weather' },
    ]);
  });

  it('names the full preset, though no connector', () => {
    expect(
      connectorMarks({
        toolset: {
          state: 'declared',
          carrier: 'c',
          selectors: ['preset:full'],
        },
        icons,
        labels,
        presetIcons: new Map([['full', 'data:image/svg+xml;base64,CC==']]),
      }),
    ).toEqual([
      {
        key: 'preset:full',
        name: 'Full gateway',
        icon: 'data:image/svg+xml;base64,CC==',
      },
    ]);
  });

  it('falls back to the generic preset icon when muster sends none or an unusable one', () => {
    const marks = connectorMarks({
      toolset: {
        state: 'declared',
        carrier: 'c',
        selectors: [
          'preset:ops',
          'preset:infrastructure',
          'preset:agent-platform',
        ],
      },
      icons,
      labels,
      presetIcons: new Map([
        ['infrastructure', 'https://example.com/infrastructure.svg'],
        ['agent-platform', 'data:text/html;base64,PGI+'],
      ]),
    });
    expect(marks).toEqual([
      { key: 'preset:ops', name: 'ops', icon: GENERIC_PRESET_ICON },
      {
        key: 'preset:infrastructure',
        name: 'Infrastructure',
        icon: GENERIC_PRESET_ICON,
      },
      {
        key: 'preset:agent-platform',
        name: 'Agent Platform',
        icon: GENERIC_PRESET_ICON,
      },
    ]);
    // Without muster's answer at all.
    expect(
      connectorMarks({
        toolset: {
          state: 'declared',
          carrier: 'c',
          selectors: ['preset:full'],
        },
        icons,
        labels,
      })[0].icon,
    ).toBe(GENERIC_PRESET_ICON);
  });

  it('ships the generic preset artwork as a usable icon', () => {
    expect(connectorIconOf(GENERIC_PRESET_ICON)).toBe(GENERIC_PRESET_ICON);
    expect(
      Buffer.from(
        GENERIC_PRESET_ICON.slice('data:image/svg+xml;base64,'.length),
        'base64',
      ).toString('utf8'),
    ).toBe(GENERIC_PRESET_SVG);
  });
});

describe('namedPresets', () => {
  it('lists each preset a declared toolset names once, in order', () => {
    expect(
      namedPresets({
        state: 'declared',
        carrier: 'c',
        selectors: [
          'preset:read-only',
          'server:jira',
          'preset:ops',
          'preset:read-only',
        ],
      }),
    ).toEqual(['read-only', 'ops']);
    expect(namedPresets({ state: 'implicit-full', carrier: 'c' })).toEqual([]);
    expect(namedPresets(undefined)).toEqual([]);
  });
});
