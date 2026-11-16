// Reads the plugin's source to find its tool calls.
// eslint-disable-next-line no-restricted-imports
import fs from 'fs';
// eslint-disable-next-line no-restricted-imports
import path from 'path';

import { fixtureToolNames } from './MusterFixtureApi';

/**
 * The drift guard of fixture mode (docs/fixtures.md): every tool the muster
 * pages call through `callTool` has a fixture handler, or is listed below as
 * one fixture mode does not serve yet, so a new tool shows in the pull
 * request that calls it.
 */

const SRC = path.resolve(__dirname, '../..');

/**
 * The files that call `musterApi.callTool`, and how the names they call are
 * collected. A new call site goes here once its tool names are collected.
 */
const CALL_SITES: Record<string, string> = {
  // Every name is a `core_*` literal, collected by the source scan.
  'components/NewMcpServerPage/useTransportDetection.ts': 'core literals',
  'components/NewMcpServerReviewPage/useRegisterMcpServer.ts': 'core literals',
  'components/shared/DefinitionEditorDialog/DefinitionEditorDialog.tsx':
    'core literals, passed in by its callers (serverActions.tsx)',
  'components/ServerPage/useConnectorToolCall.ts':
    'core literals, passed in by serverActions.tsx',
  // Runs whichever tool of the catalogue a person opens: the data set's
  // connector tools, the workflows' `workflow_<name>` tools and muster's own
  // read tools are listed without a handler, and fail loudly when run.
  'components/ToolDetail/useToolRun.ts': 'any tool of the catalogue',
};

/**
 * muster's own tools the pages call that fixture mode does not answer: the
 * writes to an installation's connectors. Fixture mode keeps no connector
 * state that a write could change, so these fail with
 * `FixtureToolMissingError` and the page shows the error.
 */
const NOT_SERVED = new Set([
  // Saving the New connector flow or the definition editor.
  'core_mcpserver_create',
  'core_mcpserver_update',
  // A connector's actions menu: delete, activate, deactivate, reconnect.
  'core_mcpserver_delete',
  'core_service_start',
  'core_service_stop',
  'core_service_restart',
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return ['__fixtures__', 'fixtures'].includes(entry.name)
        ? []
        : sourceFiles(file);
    }
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|stories)\.tsx?$/.test(entry.name)
      ? [file]
      : [];
  });
}

const files = sourceFiles(SRC).map(file => ({
  file: path.relative(SRC, file),
  source: fs.readFileSync(file, 'utf8'),
}));

/** The `core_*` tools the pages name, called or passed to a call site. */
const called = new Set(
  files.flatMap(({ source }) =>
    [...source.matchAll(/['"](core_[a-z_]+)['"]/g)].map(match => match[1]),
  ),
);

/** `musterApi.callTool(…)`, not the `callTool()` of a comment. */
const CALL = /\.callTool(?:WithProgress)?\(\s*[^)\s]/;

describe('fixture mode’s tool handlers', () => {
  const handled = fixtureToolNames([]);

  it('know every file that calls a tool', () => {
    const callers = files
      .filter(
        ({ file, source }) => !file.startsWith('apis/') && CALL.test(source),
      )
      .map(({ file }) => file)
      .sort();

    expect(callers).toEqual(Object.keys(CALL_SITES).sort());
  });

  it('answer every muster tool the pages call, or list it as not served', () => {
    const missing = [...called].filter(
      tool => !handled.has(tool) && !NOT_SERVED.has(tool),
    );
    expect(missing).toEqual([]);
  });

  it('list nothing as not served that is no longer called or now answered', () => {
    expect(
      [...NOT_SERVED].filter(tool => !called.has(tool) || handled.has(tool)),
    ).toEqual([]);
  });
});
