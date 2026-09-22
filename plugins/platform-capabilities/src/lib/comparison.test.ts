import { VerifyDimension, VerifyResult } from '../apis';
import { LIVE, VERIFIED } from '../fixtures/fakeApi';
import { mergeLive, notChecked, reviewWords } from './comparison';

const federationTargets = (result: VerifyResult) =>
  result.features
    .find(f => f.id === 'federation')!
    .dimensions!.find(d => d.id === 'federation-targets');
const liveDrift = (result: VerifyResult) =>
  result.features
    .find(f => f.id === 'runtime')!
    .dimensions!.find(d => d.id === 'live-drift');

describe('notChecked', () => {
  it('names the checks that did not run: those needing the session apart from the rest by reason', () => {
    const pending = notChecked(VERIFIED.features);
    expect(pending.session.map(d => d.id)).toEqual([
      'live-dex-auth-per-client',
      'live-drift',
    ]);
    expect(
      pending.other.map(([reason, dims]) => [reason, dims.map(d => d.id)]),
    ).toEqual([['renders no file of this kind', ['federation-targets']]]);
    expect(pending.unreachable).toEqual([]);
  });

  it('sets the checks whose endpoint did not answer apart, one entry per endpoint', () => {
    const dex =
      'unreachable from the manager: Get "https://dex.rowan.example.test/.well-known/openid-configuration": context deadline exceeded';
    const grafana =
      'unreachable from the manager: Get "https://grafana.rowan.example.test/api/health": dial tcp: i/o timeout';
    const probe = (id: string, reason: string): VerifyDimension => ({
      id,
      kind: 'probe',
      mark: 'not checked',
      reason,
    });
    const pending = notChecked([
      {
        id: 'identity',
        mark: 'not checked',
        dimensions: [probe('dex-openid', dex), probe('dex-auth', dex)],
      },
      {
        id: 'observability',
        mark: 'not checked',
        dimensions: [
          probe('grafana-health', grafana),
          probe('grafana-files', 'renders no file of this kind'),
        ],
      },
    ]);
    expect(
      pending.unreachable.map(([reason, dims]) => [
        reason,
        dims.map(d => d.id),
      ]),
    ).toEqual([
      [dex, ['dex-openid', 'dex-auth']],
      [grafana, ['grafana-health']],
    ]);
    expect(
      pending.other.map(([reason, dims]) => [reason, dims.map(d => d.id)]),
    ).toEqual([['renders no file of this kind', ['grafana-files']]]);
    expect(pending.session).toEqual([]);
  });
});

describe('reviewWords', () => {
  it('names what the review found and what the commit would open', () => {
    expect(reviewWords(VERIFIED)).toBe(
      `2 checks differ; ${VERIFIED.pullRequests!.length} pull request${VERIFIED.pullRequests!.length === 1 ? '' : 's'} to open`,
    );
    expect(reviewWords({ ...VERIFIED, pullRequests: [] })).toBe(
      '2 checks differ; nothing to open',
    );
    expect(
      reviewWords({
        ...VERIFIED,
        summary: { 'as defined': 4, planned: 2 },
        diff: {},
        pullRequests: [],
      }),
    ).toBe('2 checks planned; nothing to open');
    expect(
      reviewWords({
        ...VERIFIED,
        summary: { 'as defined': 4 },
        diff: {},
        pullRequests: [],
      }),
    ).toBe('up to date; nothing to open');
  });
});

describe('mergeLive', () => {
  it("takes the live half's word on the live dimensions and counts the marks again", () => {
    const merged = mergeLive(VERIFIED, LIVE);
    const runtime = merged.features.find(f => f.id === 'runtime')!;
    expect(runtime.mark).toBe('drifted');
    expect(runtime.marks).toEqual({ drifted: 2 });
    expect(runtime.dimensions?.find(d => d.id === 'live-drift')).toMatchObject({
      mark: 'drifted',
      live: { checks: [{ kind: 'Drift' }] },
    });
    const identity = merged.features.find(f => f.id === 'identity')!;
    expect(identity.mark).toBe('as defined');
    expect(
      identity.dimensions?.find(d => d.id === 'live-dex-auth-per-client')?.mark,
    ).toBe('as defined');
    // A dimension of the files keeps the repository half's word, checked or not.
    const federation = (result: VerifyResult) =>
      result.features.find(f => f.id === 'federation')?.dimensions?.[0];
    expect(federation(merged)).toEqual(federation(VERIFIED));
    expect(merged.summary).toEqual({
      'as defined': 5,
      'differs by input': 1,
      drifted: 2,
      'not checked': 1,
    });
    expect(merged.liveCaller).toBe('ada@example.test');
    expect(merged.state).toBe('drifted');
    expect(notChecked(merged.features).session).toEqual([]);
    // The plan's side of the comparison is untouched.
    expect(merged.files).toBe(VERIFIED.files);
  });

  it('keeps a live dimension the live half could not check, with its reason', () => {
    const reason = 'forbidden for ada@example.test: helmreleases is forbidden';
    const forbidden: VerifyResult = {
      ...LIVE,
      state: 'enabled',
      features: LIVE.features.map(f => ({
        ...f,
        dimensions: f.dimensions?.map(d =>
          d.id === 'live-drift'
            ? { id: d.id, kind: 'live', mark: 'not checked' as const, reason }
            : d,
        ),
      })),
    };
    const merged = mergeLive(VERIFIED, forbidden);
    expect(
      merged.features
        .find(f => f.id === 'runtime')
        ?.dimensions?.find(d => d.id === 'live-drift'),
    ).toMatchObject({ mark: 'not checked', reason });
    expect(notChecked(merged.features).other).toEqual([
      [reason, [liveDrift(merged)]],
      ['renders no file of this kind', [federationTargets(merged)]],
    ]);
    // The repository half's state stands where the live half found nothing.
    expect(merged.state).toBe('drifted');
  });
});
