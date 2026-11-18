import { setFixtureScenarioForTests } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { roadmapFixtureApi } from './RoadmapFixtureApi';

const BUMBLEBEE = 'Bumblebee🐝';

describe('roadmapFixtureApi in the fixture scenarios', () => {
  afterEach(() => {
    setFixtureScenarioForTests(undefined);
  });

  it('serves the hand-made board in base', async () => {
    setFixtureScenarioForTests('base');
    const api = roadmapFixtureApi();

    const { items } = await api.listItems({ team: BUMBLEBEE });
    expect(items.map(item => item.title)).toContain(
      'Backstage UI for cluster creation',
    );
    const { item } = await api.getItem('fixture-3519');
    expect(item.assignees).toEqual(['Lukas Brandt']);
    const { subIssues } = await api.listSubIssues(
      'giantswarm',
      'roadmap',
      3519,
    );
    expect(subIssues).toHaveLength(3 + (3519 % 3));
  });

  it('serves a board without items in empty', async () => {
    setFixtureScenarioForTests('empty');
    const api = roadmapFixtureApi();

    const schema = await api.getSchema();
    expect(schema.defaultTeams).toEqual([BUMBLEBEE]);
    await expect(api.listItems()).resolves.toEqual({ items: [] });
    await expect(api.listItems({ team: BUMBLEBEE })).resolves.toEqual({
      items: [],
    });
    await expect(api.getOverview(BUMBLEBEE)).resolves.toEqual({
      total: 0,
      byStatus: {},
      byRepo: {},
    });
    await expect(api.getItem('fixture-3519')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });

  it('serves hundreds of items in each list in many', async () => {
    setFixtureScenarioForTests('many');
    const api = roadmapFixtureApi();

    const schema = await api.getSchema();
    const statuses =
      schema.fields.find(field => field.name === 'Status')?.options ?? [];
    for (const status of statuses) {
      const { items } = await api.listItems({ team: BUMBLEBEE, status });
      expect([status, items.length]).toEqual([status, 100]);
    }
    const { items: withoutStatus } = await api.listItems({
      team: BUMBLEBEE,
      empty: 'status',
    });
    expect(withoutStatus.length).toBeGreaterThan(0);

    const { items: recent } = await api.listItems({
      team: BUMBLEBEE,
      updated: '>@today-7d',
    });
    expect(recent.length).toBeGreaterThanOrEqual(100);
    expect(recent.length).toBeLessThan(statuses.length * 100);

    const [first] = withoutStatus;
    const { item } = await api.getItem(first.id);
    expect(item.comments.length).toBeGreaterThanOrEqual(100);
    const { subIssues } = await api.listSubIssues(
      'giantswarm',
      'roadmap',
      first.number!,
    );
    expect(subIssues).toHaveLength(100);
  });

  it('serves the same many board on every load', async () => {
    setFixtureScenarioForTests('many');
    const first = await roadmapFixtureApi().listItems();
    setFixtureScenarioForTests('many');
    const second = await roadmapFixtureApi().listItems();
    const titles = (response: typeof first) =>
      response.items.map(item => item.title);
    expect(titles(second)).toEqual(titles(first));
  });

  it('serves every name as long as GitHub allows in long-names', async () => {
    setFixtureScenarioForTests('long-names');
    const api = roadmapFixtureApi();

    const schema = await api.getSchema();
    const statuses =
      schema.fields.find(field => field.name === 'Status')?.options ?? [];
    // The team activity finds the active columns by their first words.
    expect(statuses.some(status => status.startsWith('In Progress'))).toBe(
      true,
    );
    // Hive's header names the teams: they keep their names.
    expect(schema.defaultTeams).toEqual([BUMBLEBEE]);
    const kinds =
      schema.fields.find(field => field.name === 'Kind')?.options ?? [];
    expect(kinds.every(kind => kind.length > 55)).toBe(true);

    const { items } = await api.listItems({ team: BUMBLEBEE });
    expect(items.length).toBeGreaterThan(20);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(240);
      expect(item.title.length).toBeLessThanOrEqual(256);
      expect(item.title).not.toMatch(/\s$/);
      for (const login of item.assignees ?? []) {
        expect(login.length).toBeGreaterThan(35);
        expect(login.length).toBeLessThanOrEqual(39);
      }
    }
    const [owner, repo] = items[0].repo!.split('/');
    expect(repo.length).toBeGreaterThan(95);
    expect(repo.length).toBeLessThanOrEqual(100);

    const { item } = await api.getItem(items[0].id);
    for (const label of item.labels) {
      expect(label.length).toBeLessThanOrEqual(50);
    }
    const { subIssues } = await api.listSubIssues(
      owner,
      repo,
      items[0].number!,
    );
    expect(subIssues[0].title.length).toBeGreaterThan(240);
  });

  it('fails every call in error as roadmap-backend does without muster', async () => {
    setFixtureScenarioForTests('error');
    const api = roadmapFixtureApi();

    for (const call of [
      api.getConnection(),
      api.getSchema(),
      api.listItems(),
      api.getItem('fixture-3519'),
      api.getOverview(),
      api.listSubIssues('giantswarm', 'roadmap', 3519),
      api.updateItemField('fixture-3519', 'Status', 'Done ✅'),
    ]) {
      await expect(call).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
        message: 'meadow did not answer: the connection failed',
      });
    }
  });

  it('answers no call in loading', async () => {
    setFixtureScenarioForTests('loading');
    const api = roadmapFixtureApi();

    const answered = jest.fn();
    api.listItems().then(answered, answered);
    api.getSchema().then(answered, answered);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(answered).not.toHaveBeenCalled();
  });
});
