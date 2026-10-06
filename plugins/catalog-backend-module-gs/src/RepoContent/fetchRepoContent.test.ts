import { fetchRepoContentBatch } from './fetchRepoContent';

function graphqlFetch(body: unknown) {
  return jest.fn().mockResolvedValue(new Response(JSON.stringify(body)));
}

const slugs = [
  { owner: 'giantswarm', repo: 'alpha' },
  { owner: 'giantswarm', repo: 'beta' },
];

describe('fetchRepoContentBatch', () => {
  it('asks for every repository as an alias with its own variables', async () => {
    const fetchImpl = graphqlFetch({
      data: {
        r0: {
          defaultBranchRef: { name: 'main' },
          readme: { __typename: 'Blob' },
        },
        r1: { defaultBranchRef: { name: 'master' }, readme: null },
      },
    });

    const result = await fetchRepoContentBatch({
      slugs,
      token: 't',
      fetchImpl,
    });

    const { query, variables } = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(query).toContain('r0: repository(owner: $o0, name: $n0)');
    expect(query).toContain('r1: repository(owner: $o1, name: $n1)');
    expect(variables).toEqual({
      o0: 'giantswarm',
      n0: 'alpha',
      o1: 'giantswarm',
      n1: 'beta',
    });
    expect(result.content).toEqual(
      new Map([
        ['giantswarm/alpha', { defaultBranch: 'main', hasReadme: true }],
        ['giantswarm/beta', { defaultBranch: 'master', hasReadme: false }],
      ]),
    );
    expect(result.unreadable).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('records an empty repository without a default branch', async () => {
    const result = await fetchRepoContentBatch({
      slugs: [slugs[0]],
      token: 't',
      fetchImpl: graphqlFetch({
        data: { r0: { defaultBranchRef: null, readme: null } },
      }),
    });

    expect(result.content.get('giantswarm/alpha')).toEqual({
      hasReadme: false,
    });
  });

  it('sorts per-repository errors into unreadable and failed', async () => {
    const result = await fetchRepoContentBatch({
      slugs,
      token: 't',
      fetchImpl: graphqlFetch({
        data: { r0: null, r1: null },
        errors: [
          { message: 'Could not resolve', type: 'NOT_FOUND', path: ['r0'] },
          { message: 'Something went wrong', path: ['r1', 'readme'] },
        ],
      }),
    });

    expect(result.content.size).toBe(0);
    expect(result.unreadable).toEqual(['giantswarm/alpha']);
    expect(result.failed).toEqual(['giantswarm/beta']);
  });

  it('throws when the query as a whole fails', async () => {
    await expect(
      fetchRepoContentBatch({
        slugs,
        token: 't',
        fetchImpl: graphqlFetch({ errors: [{ message: 'Bad credentials' }] }),
      }),
    ).rejects.toThrow('Bad credentials');
  });
});
