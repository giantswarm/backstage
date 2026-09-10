// Node builtins in a browser package: this file is a Node-only test, and its
// whole point is to read the app's real config file from disk.
// eslint-disable-next-line no-restricted-imports
import fs from 'fs';
// eslint-disable-next-line no-restricted-imports
import path from 'path';
import agentPlatformPlugin from '@giantswarm/backstage-plugin-agent-platform';
import musterPlugin from '@giantswarm/backstage-plugin-muster';

const AGENT_PLATFORM_PAGE = 'page:agent-platform';

/**
 * The ids listed under `app.extensions` in the real `app-config.yaml`, in order.
 *
 * Read as text rather than parsed: the file carries `$env`/`$include`
 * placeholders and a real config load belongs to the backend, while all this
 * needs is the order of a flat list. Entries carrying a value are skipped
 * (`- page:pagerduty: false`, the disables; `- app/routes: {config}`, the
 * redirects) — they are not tabs. They do still take part in the ordering, so
 * do not read this as "values are ignored by the app".
 */
function listedExtensionIds(): string[] {
  const lines = fs
    .readFileSync(path.resolve(__dirname, '../../../app-config.yaml'), 'utf8')
    .split('\n');

  const start = lines.findIndex(line => /^ {2}extensions:\s*$/.test(line));
  expect(start).toBeGreaterThan(-1);

  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // Blank lines and comments belong to the block; any key back at
    // `app:`-child indentation ends it.
    if (/^\s*(#|$)/.test(line)) {
      continue;
    }
    if (/^ {2}\S/.test(line)) {
      break;
    }
    const id = /^ {4}- ([\w-]+:[\w\-/]+)$/.exec(line)?.[1];
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

/** Every extension the two plugins declare, by id, with its attachment. */
function declaredExtensions(): Map<
  string,
  { attachTo: { id: string; input: string }; inputs: string[] }
> {
  // `extensions` is not on the public `FrontendPlugin` type — it is reached
  // here deliberately. The alternative is booting a whole app tree, which
  // needs `@backstage/plugin-app` as a dependency of this package and resolves
  // a second copy of the Backstage frontend subtree; that is a steep price for
  // a wiring assertion.
  const plugins = [agentPlatformPlugin, musterPlugin] as unknown as {
    extensions: {
      id: string;
      attachTo: { id: string; input: string };
      inputs?: object;
    }[];
  }[];

  return new Map(
    plugins.flatMap(plugin =>
      plugin.extensions.map(
        extension =>
          [
            extension.id,
            {
              attachTo: extension.attachTo,
              inputs: Object.keys(extension.inputs ?? {}),
            },
          ] as const,
      ),
    ),
  );
}

describe('Agent Platform tab order', () => {
  it('is pinned in app-config with Agents first and Dashboards last', () => {
    // The row is Agents · Sessions · Models · MCP Servers · Dashboards, and
    // this list is the only thing that makes it so: the app attaches
    // extensions named in `app.extensions` in the order given, ahead of every
    // unnamed one, which beats the feature-registration order App.tsx would
    // otherwise decide it by.
    //
    // Both ends are load-bearing, and neither holds on its own:
    //
    // * **Agents first** — `PageBlueprint` sends a tabbed page's index to
    //   `inputs.pages[0]`, so the first tab is also where a bare
    //   `/agent-platform` lands (and what telemetry reports as
    //   "Agents index").
    // * **Dashboards last** — it cannot get there by declaration order at all.
    //   muster's "MCP Servers" tab is attached from another plugin, so it lands
    //   after every tab agent-platform declares; registering muster first would
    //   only move MCP Servers to the front of the row.
    //
    // Delete these entries and the row silently becomes
    // Agents · Sessions · Models · Dashboards · MCP Servers — no type or lint
    // rule notices, which is why this reads the config file itself.
    const tabs = listedExtensionIds().filter(id => id.startsWith('sub-page:'));

    expect(tabs).toEqual([
      'sub-page:agent-platform/agents',
      'sub-page:agent-platform/sessions',
      'sub-page:agent-platform/models',
      'sub-page:muster/mcp-servers',
      'sub-page:agent-platform/dashboards',
    ]);
  });

  it('names ids that exist, and every tab of the page', () => {
    // Without this the list above is only a string. A config entry for an id
    // no plugin declares is *not* an error the app throws on — it is reported
    // to the error collector and otherwise ignored — so renaming a sub-page
    // (`name: 'dashboards'`) without editing the config would leave the entry
    // a silent no-op and revert the row, with the assertion above still
    // passing. And a *new* tab attached to this page that nobody adds to the
    // config would land after all five, quietly taking Dashboards' place at
    // the end.
    const declared = declaredExtensions();
    const attachedToPage = [...declared.entries()]
      .filter(([, extension]) => extension.attachTo?.id === AGENT_PLATFORM_PAGE)
      .map(([id]) => id);
    const listed = listedExtensionIds().filter(id =>
      id.startsWith('sub-page:'),
    );

    expect([...listed].sort()).toEqual([...attachedToPage].sort());
  });

  it('keeps both ends of the MCP dashboard attachment in agreement', () => {
    // A coupling by string across two plugins that fails silently: a mismatch
    // in either the node id or the input name makes the MCP tab vanish with no
    // error anywhere. Asserted here rather than in either plugin's own tests,
    // because neither can see the other end.
    const declared = declaredExtensions();

    const contribution = declared.get('agent-platform-dashboard:muster/mcp');
    const host = declared.get('sub-page:agent-platform/dashboards');

    expect(contribution?.attachTo).toEqual({
      id: 'sub-page:agent-platform/dashboards',
      input: 'mcpDashboard',
    });
    expect(host?.inputs).toContain('mcpDashboard');
  });
});
