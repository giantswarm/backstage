import { expect, open, rosterRowOf, searchRoster, test } from './fixtures';
import { lab } from './lab';

/**
 * The Agents roster lists the Agents of the namespaces a person may read. The
 * lab's developer reads kagent only through the chart's namespaced
 * `agent-platform:user` RoleBinding in `kagent`, so a cluster-wide list of
 * Agents, Harnesses and RemoteMCPServers is forbidden to them; the roster
 * reads the agent namespaces one by one instead and lists the worker's agent,
 * with no "Could not read" notice, and resolves its toolset from the
 * RemoteMCPServers read the same way.
 */
const rosterWait = 2 * 60_000;

test('a person with a namespaced kagent RoleBinding sees the agents of that namespace in the roster', async ({
  labAgent,
  signInAs,
}) => {
  test.setTimeout(rosterWait + 60_000);
  const dev = await signInAs(lab.users.dev);
  await open(dev, '/customize/agents', lab.users.dev);
  await searchRoster(dev, labAgent.name);
  const row = rosterRowOf(dev, labAgent.name);
  await expect(row, 'the roster lists the fixture agent').toBeVisible({
    timeout: rosterWait,
  });

  await expect(
    dev.getByText(/^Could not read \d+ environments?$/),
    'no environment reads as unreadable',
  ).toHaveCount(0);
});

test('a person with a namespaced kagent RoleBinding sees an agent’s toolset resolved', async ({
  labAgent,
  signInAs,
}) => {
  test.setTimeout(rosterWait + 60_000);
  const dev = await signInAs(lab.users.dev);
  // The composer's agent is an AgentRow id, `installation/namespace/name`.
  const id = labAgent.detailPath.replace(/^\/customize\/agents\//, '');
  await open(dev, `/?agent=${encodeURIComponent(id)}`, lab.users.dev);

  // The reach line renders only once the toolset resolved, through the
  // namespaced RemoteMCPServers read: the fixture agent has no tools.
  await expect(
    dev.getByText('Has no connectors.', { exact: true }),
    'the composer resolves the fixture agent’s toolset',
  ).toBeVisible({ timeout: rosterWait });
});
