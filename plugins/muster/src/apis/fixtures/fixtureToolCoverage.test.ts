// eslint-disable-next-line no-restricted-imports
import path from 'path';

import { fixtureToolCoverage } from '../../__testUtils__';
import { fixtureToolNames } from './fixtureToolNames';

/**
 * The drift guard of fixture mode (docs/fixtures.md): every tool the muster
 * pages call through `callTool` has a fixture handler, or is listed below
 * with the reason, so a new tool shows in the pull request that calls it.
 */

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

/**
 * The calls whose tool name is only known at runtime. Fixture mode lists the
 * data set's connector tools and the workflows' `workflow_<name>` tools
 * without a handler, so running one fails loudly.
 */
const UNRESOLVED = new Set([
  // A tool's page runs the tool its URL names.
  'components/ToolPage/ToolPage.tsx: tool',
  // A workflow's Run tab runs the workflow's `workflow_<name>` tool.
  'components/WorkflowPage/WorkflowPage.tsx: workflow.getName()',
]);

describe('fixture mode’s tool handlers', () => {
  const report = fixtureToolCoverage({
    srcDir: path.resolve(__dirname, '../..'),
    handled: fixtureToolNames([]),
    notServed: NOT_SERVED,
    unresolved: UNRESOLVED,
  });

  it('answer every tool the pages call, or list it as not served', () => {
    expect(report.missing).toEqual([]);
  });

  it('list nothing as not served that is answered or no longer called', () => {
    expect(report.staleNotServed).toEqual([]);
  });

  it('know every tool name the pages call, or list the call', () => {
    expect(report.unresolved).toEqual([]);
  });

  it('list no call whose tool name is now known', () => {
    expect(report.staleUnresolved).toEqual([]);
  });
});
