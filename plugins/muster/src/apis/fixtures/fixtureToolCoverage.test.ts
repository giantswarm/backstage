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
 * muster's own tools the pages call that fixture mode does not answer, each
 * with the reason. None today: list one here rather than leave it unchecked.
 */
const NOT_SERVED = new Set<string>([
  // The connector Tools tab's *Allowed for* reads agent-manager's grants:
  // agent-manager is the agent-platform plugin's fixture server, whose drift
  // guard covers these.
  'x_agent-manager_get_info',
  'x_agent-manager_list_approval_grants',
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
  // A connector's edit runs core_mcpserver_connect and core_mcpserver_update
  // (lib/connectorWrites.ts), both answered.
  'components/shared/hooks/connectorEdit.ts: write.tool',
  // The JSON edit saves through that edit (`useConnectorEditWrite`).
  `components/shared/hooks/connectorEdit.ts: useCallback(
    (args: Record<string, unknown>) =>
      writeConnectorEdit(queryClient, musterApi, args, installation),
    [queryClient, musterApi, installation],
  )`,
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
