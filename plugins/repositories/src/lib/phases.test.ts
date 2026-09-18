import { InventoryRecord } from '../apis';
import {
  presentService,
  watchOf,
  watchReady,
  watchRedRelease,
} from '../fixtures/records';
import {
  alignmentPhases,
  failureTitle,
  formatDuration,
  phasesSettled,
  runDetail,
  watchPhases,
} from './phases';

const byName = (phases: ReturnType<typeof watchPhases>) =>
  Object.fromEntries(phases.map(phase => [phase.name, phase]));

describe('watchPhases', () => {
  it('renders the phases done with their time since the creation and the manager’s count since the phase before, the next one waiting, the rest ahead', () => {
    const phases = watchPhases(watchOf('declared'));
    expect(phases.map(phase => `${phase.name}:${phase.state}`)).toEqual([
      'created:done',
      'scaffolded:done',
      'declared:done',
      'merged:pending',
      'setUp:ahead',
      'released:ahead',
    ]);
    const { created, scaffolded, declared, merged } = byName(phases);
    expect(created).toMatchObject({
      label: 'Created',
      at: '2026-09-18T10:00:00Z',
      sinceStart: 0,
      seconds: 0,
      link: {
        href: 'https://github.com/giantswarm/shiny-service',
        text: 'repository',
      },
    });
    expect(scaffolded).toMatchObject({ sinceStart: 4, seconds: 4 });
    expect(scaffolded.link).toBeUndefined();
    expect(declared).toMatchObject({
      sinceStart: 13,
      seconds: 9,
      link: {
        href: 'https://github.com/giantswarm/github/pull/4242',
        text: 'pull request',
      },
    });
    // Nothing from the manager: what the phase waits for.
    expect(merged).toMatchObject({
      label: 'Merged',
      reason: 'the declaration pull request has not merged yet',
    });
    expect(merged.link).toBeUndefined();
    expect(phasesSettled(phases)).toBe(false);
  });

  it('shows the manager’s reason while a phase waits', () => {
    const reason =
      'the CircleCI statuses on v0.1.0: ci/circleci: build (pending) — waiting for the pending ones';
    const { released, setUp } = byName(
      watchPhases(watchOf('setUp', { pendingReason: reason })),
    );
    expect(setUp).toMatchObject({
      state: 'done',
      label: 'Set up',
      sinceStart: 149,
      seconds: 74,
    });
    expect(released).toMatchObject({ state: 'pending', reason });
  });

  it('ready: every phase done, the release linked by its tag, nothing pending', () => {
    const phases = watchPhases(watchReady);
    expect(phases.every(phase => phase.state === 'done')).toBe(true);
    expect(byName(phases).released).toMatchObject({
      sinceStart: 250,
      seconds: 101,
      link: {
        href: 'https://github.com/giantswarm/shiny-service/releases/tag/v0.1.0',
        text: 'v0.1.0',
      },
    });
    expect(phasesSettled(phases)).toBe(true);
  });

  it('a red first release: the phase failed with the manager’s reason naming the job, nothing pending', () => {
    const phases = watchPhases(watchRedRelease);
    expect(phases.map(phase => `${phase.name}:${phase.state}`)).toEqual([
      'created:done',
      'scaffolded:done',
      'declared:done',
      'merged:done',
      'setUp:done',
      'released:failed',
    ]);
    expect(byName(phases).released).toMatchObject({
      reason:
        'the CircleCI statuses on v0.1.0 are failure: ci/circleci: build (failure)',
      link: { text: 'v0.1.0' },
    });
    expect(phasesSettled(phases)).toBe(true);
    expect(failureTitle('released')).toBe('The first release failed');
    expect(failureTitle('setUp')).toBe('The set-up failed');
    expect(failureTitle('indexed')).toBe('indexed failed');
  });

  it('a phase the manager names that the page does not know is shown in its place', () => {
    const watch = watchOf('scaffolded');
    watch.phases.push({
      name: 'indexed',
      at: '2026-09-18T10:00:10Z',
      seconds: 6,
    });
    const phases = watchPhases(watch);
    expect(phases.map(phase => `${phase.name}:${phase.state}`)).toEqual([
      'created:done',
      'scaffolded:done',
      'indexed:done',
      'declared:pending',
      'merged:ahead',
      'setUp:ahead',
      'released:ahead',
    ]);
    expect(byName(phases).indexed).toMatchObject({
      label: 'indexed',
      sinceStart: 10,
    });
  });
});

describe('formatDuration', () => {
  it('reads at a glance', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(59)).toBe('59 s');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(75)).toBe('1 min 15 s');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3720)).toBe('1 h 2 min');
  });
});

describe('runDetail', () => {
  it('names the steps that are not ok', () => {
    expect(runDetail(presentService.setup.checks!.steps, true)).toBe(
      'converged',
    );
    expect(
      runDetail(
        [
          { step: 'settings', verdict: 'ok' },
          { step: 'protection', verdict: 'drift' },
          { step: 'lifecycle', verdict: 'skipped' },
          { step: 'metadata', verdict: 'reported' },
        ],
        false,
      ),
    ).toBe('not converged: protection drift, metadata reported');
  });
});

describe('alignmentPhases', () => {
  const since = '2026-09-18T12:00:00Z';
  const withSetup = (setup: InventoryRecord['setup']): InventoryRecord => ({
    ...presentService,
    setup: { ...presentService.setup, ...setup },
  });

  it('before the record answers: dispatched now, the report waited for', () => {
    const phases = alignmentPhases(undefined, since);
    expect(phases).toEqual([
      expect.objectContaining({
        name: 'dispatched',
        state: 'done',
        at: since,
        sinceStart: 0,
      }),
      expect.objectContaining({
        name: 'reported',
        state: 'pending',
        reason: 'the run has not reported yet',
      }),
    ]);
    expect(phasesSettled(phases)).toBe(false);
  });

  it('the record’s pending run is the dispatch: its time and who, the report waited for; an older last run is not the report', () => {
    const phases = alignmentPhases(
      withSetup({
        pendingRun: {
          dispatchedAt: '2026-09-18T11:59:58Z',
          by: 'alice',
          kind: 'dispatched',
        },
      }),
      since,
    );
    expect(phases[0]).toMatchObject({
      state: 'done',
      at: '2026-09-18T11:59:58Z',
      detail: 'by alice',
    });
    expect(phases[1]).toMatchObject({
      state: 'pending',
      reason:
        'the run has not reported yet; the record expects it since 2026-09-18T11:59:58Z',
    });
  });

  it('a pending run of a pull request is not this dispatch', () => {
    const phases = alignmentPhases(
      withSetup({
        pendingRun: {
          dispatchedAt: '2026-09-18T11:00:00Z',
          by: 'bob',
          kind: 'archived',
          pullRequest: {
            number: 9,
            url: 'https://github.com/giantswarm/github/pull/9',
          },
        },
      }),
      since,
    );
    expect(phases[0]).toMatchObject({ at: since });
    expect(phases[0].detail).toBeUndefined();
  });

  it('the run that followed the dispatch reported: done with the verdict and the run linked', () => {
    const phases = alignmentPhases(
      withSetup({
        lastRun: {
          ...presentService.setup.lastRun!,
          timestamp: '2026-09-18T12:01:30Z',
          change: { kind: 'dispatched', by: 'alice' },
        },
      }),
      since,
    );
    expect(phases[1]).toMatchObject({
      state: 'done',
      at: '2026-09-18T12:01:30Z',
      sinceStart: 90,
      detail: 'converged',
      link: {
        href: 'https://github.com/giantswarm/github/actions/runs/123',
        text: 'run',
      },
    });
    expect(phasesSettled(phases)).toBe(true);
  });

  it('a run whose steps failed fails the report with the manager’s wording', () => {
    const phases = alignmentPhases(
      withSetup({
        lastRun: {
          ...presentService.setup.lastRun!,
          timestamp: '2026-09-18T12:01:30Z',
          result: {
            ...presentService.setup.lastRun!.result,
            steps: [
              { step: 'settings', verdict: 'repaired' },
              {
                step: 'protection',
                verdict: 'failed',
                summary: 'PUT branch protection: 403',
              },
            ],
            converged: false,
          },
        },
      }),
      since,
    );
    expect(phases[1]).toMatchObject({
      state: 'failed',
      reason: 'the protection step failed: PUT branch protection: 403',
      link: { text: 'run' },
    });
    expect(phasesSettled(phases)).toBe(true);
  });

  it('a run that never reported: the record’s missing run fails the report with the inventory’s finding', () => {
    const message =
      'the reconciler run dispatched at 2026-09-18T12:00:00Z by alice did not report within 15 minutes';
    const phases = alignmentPhases(
      {
        ...withSetup({
          missingRun: {
            dispatchedAt: since,
            by: 'alice',
            kind: 'dispatched',
            noticedAt: '2026-09-18T12:15:00Z',
            runsUrl:
              'https://github.com/giantswarm/github/actions/workflows/reconcile-repositories.yaml',
          },
        }),
        findings: [
          { kind: 'reconcile-run-missing', message, source: 'inventory' },
        ],
      },
      since,
    );
    expect(phases[1]).toMatchObject({
      state: 'failed',
      reason: message,
      link: { text: 'workflow runs' },
    });
  });
});
