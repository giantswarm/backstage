// Node builtins in a browser package: this file is a Node-only test, and its
// whole point is to read the app's real config file from disk.
// eslint-disable-next-line no-restricted-imports
import fs from 'fs';
// eslint-disable-next-line no-restricted-imports
import path from 'path';

/**
 * The ids listed under `app.extensions` in the real `app-config.yaml`, in order.
 *
 * Read as text rather than parsed: the file carries `$env`/`$include`
 * placeholders and a real config load belongs to the backend, while all this
 * needs is the order of a flat list of strings. Entries carrying a value
 * (`- page:pagerduty: false`, the disables) are deliberately skipped — they say
 * nothing about order.
 */
function listedExtensionIds(): string[] {
  const lines = fs
    .readFileSync(path.resolve(__dirname, '../../../app-config.yaml'), 'utf8')
    .split('\n');

  const start = lines.findIndex(line => line === '  extensions:');
  expect(start).toBeGreaterThan(-1);

  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    // Any key back at `app:`-child indentation ends the list.
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
    // Agents · Sessions · Models · Dashboards · MCP Servers — no test, type or
    // lint rule notices, which is why this one reads the config file itself.
    const tabs = listedExtensionIds().filter(id => id.startsWith('sub-page:'));

    expect(tabs).toEqual([
      'sub-page:agent-platform/agents',
      'sub-page:agent-platform/sessions',
      'sub-page:agent-platform/models',
      'sub-page:muster/mcp-servers',
      'sub-page:agent-platform/dashboards',
    ]);
  });
});
