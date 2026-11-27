import { reviewQueuePlugin } from './plugin';

/**
 * The tab is internal to Giant Swarm: it follows Hive, which is off by
 * default, so it shows wherever Hive is on and nowhere else.
 */
describe('reviewQueuePlugin', () => {
  it('attaches the Reviews tab to Hive, on wherever Hive is on', () => {
    const tab = reviewQueuePlugin.getExtension('sub-page:review-queue/hive');
    expect(tab).toMatchObject({
      disabled: false,
      attachTo: { id: 'page:plans', input: 'pages' },
    });
  });

  it("contributes the github server's fixtures to muster's fixture API", () => {
    const fixtures = reviewQueuePlugin.getExtension(
      'muster-fixture-servers:review-queue',
    );
    expect(fixtures).toMatchObject({
      attachTo: { id: 'api:muster/muster', input: 'fixtureServers' },
    });
  });
});
