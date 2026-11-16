// eslint-disable-next-line no-restricted-imports
import path from 'path';

import { fixtureToolCoverage } from '../../__testUtils__';
import { fixtureToolNames } from './fixtureToolNames';

/**
 * The drift guard of fixture mode (docs/fixtures.md): every tool the muster
 * pages call through `callTool` has a fixture handler, so a new tool shows in
 * the pull request that calls it.
 */

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
    notServed: new Set(),
    unresolved: UNRESOLVED,
  });

  it('answer every tool the pages call', () => {
    expect(report.missing).toEqual([]);
  });

  it('know every tool name the pages call, or list the call', () => {
    expect(report.unresolved).toEqual([]);
  });

  it('list no call whose tool name is now known', () => {
    expect(report.staleUnresolved).toEqual([]);
  });
});
