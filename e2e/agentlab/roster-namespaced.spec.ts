import { expect, open, rosterLinkOf, searchRoster, test } from './fixtures';
import { lab } from './lab';

/**
 * The Agents roster lists the Agents of the namespaces a person may read. The
 * lab's developer reads kagent only through the chart's namespaced
 * `agent-platform:user` RoleBinding in `kagent`, so a cluster-wide list of
 * Agents, Harnesses and RemoteMCPServers is forbidden to them; the roster
 * reads the agent namespaces one by one instead and lists the worker's agent
 * with its toolset, with no "Could not read" notice.
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
  const row = rosterLinkOf(dev, labAgent.name);
  await expect(row, 'the roster lists the fixture agent').toBeVisible({
    timeout: rosterWait,
  });
  // The toolset resolves from the RemoteMCPServers read the same way: the
  // fixture agent carries no skills and no tools.
  await expect(row).toContainText('0 skills · 0 connectors');

  await expect(
    dev.getByText(/^Could not read \d+ environments?$/),
    'no environment reads as unreadable',
  ).toHaveCount(0);
});
