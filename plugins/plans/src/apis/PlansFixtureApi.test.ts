import { setFixtureScenarioForTests } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { HIVE_HISTORY_WINDOW, magazineFile } from '../lib/magazine';
import type { History, Now } from '../lib/magazine';
import { LONG_LOGIN, LONG_SEGMENT, LONG_TITLE } from '../lib/scenarioFixtures';
import { plansFixtureApi } from './PlansFixtureApi';
import type { MagazineConfigResponse, PlansApi } from './types';

async function magazine(api: PlansApi) {
  const config = (await api.getMagazine()) as Extract<
    MagazineConfigResponse,
    { configured: true }
  >;
  const read = async <T>(path: string): Promise<T> =>
    JSON.parse(
      (await api.getContent(path, config.ref, config.repository)).content,
    );
  const knowledge = await api.getTree(config.knowledgeRef, config.repository);
  return {
    now: await read<Now>(magazineFile('now')),
    history: await read<History>(magazineFile(HIVE_HISTORY_WINDOW)),
    knowledge: knowledge.tree,
  };
}

describe('the fixture PlansApi in each scenario', () => {
  afterEach(() => setFixtureScenarioForTests(undefined));

  it('serves the base plans and magazine in base', async () => {
    setFixtureScenarioForTests('base');
    const api = plansFixtureApi();

    expect((await api.listPulls()).pulls).toHaveLength(3);
    expect((await api.getTree()).tree).toHaveLength(2);
    const { now, knowledge } = await magazine(api);
    expect(now.lanes.flatMap(lane => lane.cards).length).toBeGreaterThan(0);
    expect(knowledge.length).toBeGreaterThan(0);
  });

  it('serves a plans repository with nothing in it in empty', async () => {
    setFixtureScenarioForTests('empty');
    const api = plansFixtureApi();

    expect((await api.listRepos()).repositories).toHaveLength(1);
    expect((await api.listPulls()).pulls).toEqual([]);
    expect((await api.getTree()).tree).toEqual([]);
    expect(await api.listEpics()).toEqual({ merged: [], pulls: [] });
    const { now, history, knowledge } = await magazine(api);
    expect(now.lanes.flatMap(lane => lane.cards)).toEqual([]);
    expect(now.reviews).toEqual([]);
    expect(now.upcoming).toEqual([]);
    expect(history.groups).toEqual([]);
    expect(knowledge).toEqual([]);
  });

  it('serves hundreds of items in every list in many', async () => {
    setFixtureScenarioForTests('many');
    const api = plansFixtureApi();

    expect((await api.listRepos()).repositories.length).toBeGreaterThan(1);
    const { pulls } = await api.listPulls();
    expect(pulls.length).toBeGreaterThanOrEqual(200);
    expect((await api.getTree()).tree.length).toBeGreaterThanOrEqual(200);
    // Every plan has its comments, and its review comments on its own files.
    for (const pull of [pulls[0].number, pulls[pulls.length - 1].number]) {
      expect(
        (await api.listPullComments(pull)).comments.length,
      ).toBeGreaterThanOrEqual(100);
      const files = (await api.listPullFiles(pull)).files.map(f => f.filename);
      await expect(api.getContent(files[0])).resolves.toBeDefined();
      const { comments } = await api.listReviewComments(pull);
      expect(comments.length).toBeGreaterThanOrEqual(100);
      for (const comment of comments) {
        expect(files).toContain(comment.path);
      }
    }

    const { now, history, knowledge } = await magazine(api);
    for (const lane of now.lanes) {
      expect(lane.total).toBe(lane.cards.length);
    }
    expect(now.lanes.flatMap(lane => lane.cards).length).toBeGreaterThan(200);
    expect(now.reviews.length).toBeGreaterThanOrEqual(100);
    expect(history.groups.length).toBeGreaterThanOrEqual(100);
    expect(knowledge.length).toBeGreaterThanOrEqual(200);
    expect(
      new Set(now.lanes.flatMap(lane => lane.cards.map(card => card.key))).size,
    ).toBe(now.lanes.flatMap(lane => lane.cards).length);
  });

  it('serves every title and name as long as the real data allows in long-names', async () => {
    setFixtureScenarioForTests('long-names');
    const api = plansFixtureApi();

    const { pulls } = await api.listPulls();
    for (const pull of pulls) {
      expect(pull.title.length).toBeLessThanOrEqual(LONG_TITLE);
      expect(pull.title.length).toBeGreaterThan(LONG_TITLE - 12);
      expect(pull.title).not.toMatch(/\s$/);
      expect(pull.author).toHaveLength(LONG_LOGIN);
    }
    const { merged } = await api.listEpics();
    for (const plan of merged) {
      expect(plan.folder).toHaveLength(LONG_SEGMENT);
      await expect(api.getContent(plan.path)).resolves.toBeDefined();
    }
    const [file] = (await api.listPullFiles(pulls[0].number)).files;
    await expect(api.getContent(file.filename)).resolves.toBeDefined();

    const { now, knowledge } = await magazine(api);
    for (const card of now.lanes.flatMap(lane => lane.cards)) {
      expect(card.title.length).toBeGreaterThan(LONG_TITLE - 12);
      expect(card.title.length).toBeLessThanOrEqual(LONG_TITLE);
    }
    for (const { path } of knowledge) {
      expect(path!.split('/').pop()).toHaveLength(LONG_SEGMENT);
    }
  });

  it('keeps a new comment on its own plan', async () => {
    setFixtureScenarioForTests('base');
    const api = plansFixtureApi();

    await api.createPullComment(41, 'Looks good');
    expect((await api.listPullComments(41)).comments).toHaveLength(2);
    expect((await api.listPullComments(39)).comments).toHaveLength(1);
  });

  it('never answers in loading', async () => {
    setFixtureScenarioForTests('loading');
    const settled = jest.fn();
    plansFixtureApi().listRepos().then(settled, settled);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(settled).not.toHaveBeenCalled();
  });

  it('fails every call that reaches GitHub in error, as plans-backend does when muster does not answer', async () => {
    setFixtureScenarioForTests('error');
    const api = plansFixtureApi();

    await expect(api.listRepos()).resolves.toEqual({
      repositories: ['example/bumblebee-plans'],
    });
    await expect(api.getMagazine()).resolves.toMatchObject({
      configured: true,
    });
    for (const call of [
      () => api.getConnection(),
      () => api.listPulls(),
      () => api.getTree(),
      () => api.listEpics(),
      () => api.getContent('hive/README.md'),
      () => api.listPullComments(41),
      () => api.createPullComment(41, 'Looks good'),
    ]) {
      await expect(call()).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
        message: expect.stringMatching(/^meadow did not answer: /),
      });
    }
  });
});
