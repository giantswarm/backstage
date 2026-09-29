import { newService, presentService } from '../fixtures/records';
import {
  resultFindings,
  stepDetail,
  stepsNotOk,
  verdictIntent,
} from './setupStatus';

/**
 * `devctl repo status` prints `setup.checks` as a STEP / VERDICT / DETAIL
 * table and a Findings list (devctl's reconcile.Result.WriteTable).
 * The page shows the same record through these helpers; pinning their output
 * to the CLI's text for the fixture keeps the two equal field by field.
 */
describe('set-up status, as devctl repo status prints it', () => {
  const checks = presentService.setup.checks!;

  it('renders each step line as STEP, VERDICT, DETAIL', () => {
    const lines = checks.steps.map(
      step => `${step.step}\t${step.verdict}\t${stepDetail(step)}`,
    );
    expect(lines).toEqual([
      'settings\tok\tsettings match',
      'permissions\tok\t',
      'protection\tok\tmain protected',
      'circleci\tok\tfollowed',
      'renovate\tok\t',
      'codeowners\tok\t',
      'metadata\treported\tdefault icon | 1 finding',
      'lifecycle\tskipped\tno lifecycle set',
      'catalog\tok\t',
      'release\tok\tv1.0.0 green',
    ]);
  });

  it('joins changes with "; " and counts several findings, like the CLI', () => {
    expect(
      stepDetail({
        step: 'circleci',
        verdict: 'drift',
        summary: 'not followed',
        changes: ['follow project', 'enable setup workflows'],
        findings: [
          { kind: 'a', message: 'x' },
          { kind: 'b', message: 'y' },
        ],
      }),
    ).toBe(
      'not followed | follow project; enable setup workflows | 2 findings',
    );
  });

  it('lists the findings as "[kind] message / fix: fix"', () => {
    expect(
      resultFindings(checks).map(
        f => `- [${f.kind}] ${f.message}\n  fix: ${f.fix}`,
      ),
    ).toEqual([
      '- [default-icon] the repository uses the default icon\n  fix: upload an icon in the repository settings',
    ]);
  });

  it('gives every verdict a status intent, unknown ones a neutral one', () => {
    expect(
      ['ok', 'repaired', 'drift', 'reported', 'skipped', 'failed'].map(
        verdictIntent,
      ),
    ).toEqual([
      'positive',
      'positive',
      'warning',
      'info',
      'neutral',
      'negative',
    ]);
    expect(verdictIntent('pending')).toBe('neutral');
  });

  it('names the steps still pending in a set-up that has not converged', () => {
    expect(stepsNotOk(newService.setup.checks!).map(s => s.step)).toEqual([
      'scaffold',
      'settings',
      'circleci',
      'renovate',
    ]);
  });
});
