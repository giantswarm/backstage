import {
  createAgentInWizard,
  deleteAgentInPortal,
  expect,
  open,
  startSessionOnReadyAgent,
  test,
} from './fixtures';

/**
 * Portal actions reach TelemetryDeck as their own signal type, with only their
 * fixed-value attributes (docs/telemetry.md). The spec answers TelemetryDeck's
 * ingest itself and reads what the portal sent, so nothing leaves the machine.
 * It needs a lab whose Backstage config names an `app.telemetrydeck.appID`
 * (any value): without one the connector sends nothing at all, page views
 * included, and the spec skips. Creating an agent and starting a session on it are the
 * actions a lab performs without a model key — the session's turn may fail,
 * the session is started all the same. `Muster.mcpServerAdded` is asserted by
 * its hook's test.
 */

const ingest = 'https://nom.telemetrydeck.com/**';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(4, 12);
const agentName = `E2E Telemetry ${stamp}`;
const agentSlug = `e2e-telemetry-${stamp}`;
const prompt = 'Say hello in one word, telemetry probe.';

test('creating an agent and starting a session send their signals, with no free text', async ({
  admin,
}) => {
  test.setTimeout(12 * 60_000);

  const sent: string[] = [];
  await admin.route(ingest, async route => {
    sent.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, body: '' });
  });
  const signal = async (type: string) => {
    const sentType = () => sent.find(body => body.includes(`"${type}"`));
    await expect
      .poll(() => sentType() !== undefined, { timeout: 30_000 })
      .toBe(true)
      .catch(() => {
        throw new Error(
          `the portal never sent ${type}; it sent: ${sent.join('\n') || 'nothing'}`,
        );
      });
    return sentType()!;
  };

  try {
    await open(admin, '/agent-platform/agents');
    await expect
      .poll(() => sent.some(body => body.includes('"pageview"')), {
        timeout: 10_000,
      })
      .toBe(true)
      .catch(() =>
        test.skip(
          true,
          'no page view reached TelemetryDeck: the lab configures no app.telemetrydeck.appID',
        ),
      );

    const detailPath = await createAgentInWizard(admin, agentName, agentSlug);
    let failure: unknown;
    try {
      expect(
        await signal('AgentPlatform.agentCreated'),
        'Deploy reports the live mode',
      ).toContain('deploy');

      await startSessionOnReadyAgent(admin, prompt);
      expect(
        await signal('AgentPlatform.sessionStarted'),
        'the agent page reports itself as the entry point',
      ).toContain('agentDetail');

      const everything = sent.join('\n');
      expect(everything, 'the prompt never leaves the portal').not.toContain(
        prompt,
      );
      expect(
        everything,
        'the agent’s display name never leaves the portal',
      ).not.toContain(agentName);
    } catch (error) {
      failure = error;
    }
    await deleteAgentInPortal(admin, detailPath, agentSlug);
    if (failure !== undefined) {
      throw failure;
    }
  } finally {
    await admin.unroute(ingest);
  }
});
