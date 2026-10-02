import fs from 'node:fs';
import path from 'node:path';
import {
  isPortalEventShaped,
  portalEvents,
  toPortalEvent,
  type PortalEventName,
} from './events';
import { portalEventsMarkdown } from './portalEventsMarkdown';

const repoRoot = path.resolve(__dirname, '../../..');

/** A Markdown table's cells, so prettier's column padding does not count. */
function tableCells(markdown: string): string[][] {
  return markdown
    .split('\n')
    .filter(line => line.startsWith('|'))
    .map(line =>
      line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim().replace(/^-+$/, '---')),
    );
}

describe('toPortalEvent', () => {
  it('returns a listed event with allowed attribute values', () => {
    expect(
      toPortalEvent('AgentPlatform.agentCreated', { mode: 'commit' }),
    ).toEqual({
      name: 'AgentPlatform.agentCreated',
      attributes: { mode: 'commit' },
    });
  });

  it.each([
    ['an unlisted action', 'AgentPlatform.agentDeleted', { mode: 'deploy' }],
    ['a value outside the set', 'AgentPlatform.agentCreated', { mode: 'x' }],
    ['a missing attribute', 'AgentPlatform.agentCreated', {}],
    [
      'an extra attribute',
      'AgentPlatform.agentCreated',
      { mode: 'deploy', name: 'my-agent' },
    ],
    ['a non-string value', 'AgentPlatform.agentCreated', { mode: true }],
    ['an inherited property', 'toString', {}],
  ])('drops %s', (_, action, attributes) => {
    expect(toPortalEvent(action, attributes)).toBeUndefined();
  });
});

describe('isPortalEventShaped', () => {
  it.each(['AgentPlatform.agentCreated', 'Muster.Servers.mcpServerAdded'])(
    'recognises %s as ours',
    action => expect(isPortalEventShaped(action)).toBe(true),
  );

  it.each(['navigate', 'click', 'create', 'search', 'discover'])(
    "treats Backstage's built-in %s as foreign",
    action => expect(isPortalEventShaped(action)).toBe(false),
  );
});

describe('the event list', () => {
  it.each(Object.keys(portalEvents))('%s follows the naming guide', name =>
    expect(isPortalEventShaped(name)).toBe(true),
  );

  it('is what docs/telemetry.md lists', () => {
    const doc = fs.readFileSync(
      path.join(repoRoot, 'docs/telemetry.md'),
      'utf8',
    );
    const listed = doc.match(
      /<!-- portal-events:start -->([\s\S]*?)<!-- portal-events:end -->/,
    )?.[1];
    // On a failure, paste portalEventsMarkdown()'s output between the markers
    // and run prettier on the page.
    expect(tableCells(listed ?? '')).toEqual(
      tableCells(portalEventsMarkdown()),
    );
  });

  /**
   * Every event has a hook test that checks its hook reports it; a test file
   * in a plugin naming the event is the cheap proxy for that.
   */
  it.each(Object.keys(portalEvents) as PortalEventName[])(
    '%s is asserted by a plugin test',
    name => {
      const pluginsDir = path.join(repoRoot, 'plugins');
      const asserted = fs
        .globSync('*/src/**/*.test.{ts,tsx}', { cwd: pluginsDir })
        .filter(file => !file.startsWith('analytics-react/'))
        .some(file =>
          fs
            .readFileSync(path.join(pluginsDir, file), 'utf8')
            .includes(`'${name}'`),
        );
      expect(asserted).toBe(true);
    },
  );
});
