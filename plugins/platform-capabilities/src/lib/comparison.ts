import {
  PlanFile,
  VerifyDifference,
  VerifyDimension,
  VerifyFeature,
  VerifyMark,
  VerifyResult,
} from '../apis';

/** The manager's reason for a live check it could not run as the manager itself. */
export const SESSION_REASON = 'needs your session on the installation';

/** A mark that is a difference to apply: the file is off its definition, or off the inputs. */
export function differs(mark: VerifyMark): boolean {
  return mark === 'drifted' || mark === 'differs by input';
}

/** The dimensions of a feature that differ or carry a planned change. */
export function differingDimensions(feature: VerifyFeature): VerifyDimension[] {
  return (feature.dimensions ?? []).filter(
    d => differs(d.mark) || d.mark === 'planned',
  );
}

/** The dimensions of a feature that were checked at all. */
export function checkedDimensions(feature: VerifyFeature): VerifyDimension[] {
  return (feature.dimensions ?? []).filter(d => d.mark !== 'not checked');
}

/** The files a commit would create or update. */
export function filesToChange(result: VerifyResult): number {
  return (result.diff?.create ?? 0) + (result.diff?.update ?? 0);
}

export interface Counts {
  differences: number;
  planned: number;
}

/**
 * What the comparison found, counted apart: the differences to apply now
 * (`drifted`, `differs by input`) and the changes a migration plans. Where
 * the manager marked neither, the files a commit would still create or
 * update count as differences.
 */
export function countsOf(result: VerifyResult): Counts {
  const differences =
    (result.summary?.drifted ?? 0) +
    (result.summary?.['differs by input'] ?? 0);
  const planned = result.summary?.planned ?? 0;
  if (differences === 0 && planned === 0) {
    return { differences: filesToChange(result), planned: 0 };
  }
  return { differences, planned };
}

/** Whether the comparison ran: the definition did not refuse, and at least one dimension was checked. */
export function compared(result: VerifyResult): boolean {
  return (
    !result.refused &&
    (result.features ?? []).some(f => checkedDimensions(f).length > 0)
  );
}

/** The comparison ran and found nothing to apply and nothing planned. */
export function upToDate(result: VerifyResult): boolean {
  const { differences, planned } = countsOf(result);
  return compared(result) && differences === 0 && planned === 0;
}

/**
 * The manager's reason where an endpoint it probes did not answer:
 * `unreachable from the manager: Get "https://…": context deadline
 * exceeded`, the request's error after the colon.
 */
export function unreachable(reason: string): boolean {
  return /^unreachable\b/.test(reason);
}

/** The checks that did not run for one reason, in the manager's words. */
export type NotRun = [reason: string, dimensions: VerifyDimension[]];

/**
 * The checks that did not run, by name: those needing the person's session
 * on the installation; those whose endpoint did not answer, one entry per
 * endpoint; and the rest grouped by the manager's reason, in the order the
 * features name them.
 */
export function notChecked(features: VerifyFeature[]): {
  session: VerifyDimension[];
  unreachable: NotRun[];
  other: NotRun[];
} {
  const session: VerifyDimension[] = [];
  const endpoints = new Map<string, VerifyDimension[]>();
  const other = new Map<string, VerifyDimension[]>();
  for (const feature of features) {
    for (const dimension of feature.dimensions ?? []) {
      if (dimension.mark !== 'not checked') {
        continue;
      }
      if (dimension.reason === SESSION_REASON) {
        session.push(dimension);
        continue;
      }
      const reason = dimension.reason ?? 'no reason given';
      const group = unreachable(reason) ? endpoints : other;
      group.set(reason, [...(group.get(reason) ?? []), dimension]);
    }
  }
  return {
    session,
    unreachable: [...endpoints.entries()],
    other: [...other.entries()],
  };
}

/** The marks in the order a feature rolls up from its dimensions. */
const SEVERITY: VerifyMark[] = [
  'drifted',
  'differs by input',
  'planned',
  'as defined',
];

/** A feature's mark from its dimensions': the worst one checked, else not checked. */
function rollUp(dimensions: VerifyDimension[]): VerifyMark {
  const seen = new Set(dimensions.map(d => d.mark));
  return SEVERITY.find(mark => seen.has(mark)) ?? 'not checked';
}

/**
 * The repository comparison (`verify_capability`) and the live one
 * (`verify_installation`) as the one result a person reads, the way the
 * manager's own `Merge` joins them: per dimension the one that checked it,
 * the live result's word on a live dimension; the marks and the summary
 * counted again; drifted and waiting for the customer from either side;
 * the live caller named.
 */
export function mergeLive(
  repo: VerifyResult,
  live: VerifyResult,
): VerifyResult {
  const byId = new Map<string, VerifyDimension>();
  for (const feature of live.features ?? []) {
    for (const dimension of feature.dimensions ?? []) {
      byId.set(dimension.id, dimension);
    }
  }
  const summary: Partial<Record<VerifyMark, number>> = {};
  const features = (repo.features ?? []).map(feature => {
    const dimensions = (feature.dimensions ?? []).map(dimension => {
      const checked = byId.get(dimension.id);
      const takeLive =
        checked &&
        dimension.mark === 'not checked' &&
        (checked.mark !== 'not checked' || dimension.kind === 'live');
      return takeLive ? checked : dimension;
    });
    const marks: Partial<Record<VerifyMark, number>> = {};
    for (const dimension of dimensions) {
      marks[dimension.mark] = (marks[dimension.mark] ?? 0) + 1;
      summary[dimension.mark] = (summary[dimension.mark] ?? 0) + 1;
    }
    return { ...feature, dimensions, marks, mark: rollUp(dimensions) };
  });
  let state = repo.state;
  if (live.state === 'drifted') {
    state = 'drifted';
  } else if (live.state === 'waiting for the customer' && state !== 'drifted') {
    state = live.state;
  }
  return {
    ...repo,
    features,
    summary,
    state,
    liveCaller: live.caller,
    refused: repo.refused ?? live.refused,
  };
}

/** The probe that went red: the first dimension with a request that was not ok. */
export function redProbeOf(result?: VerifyResult): string | undefined {
  for (const feature of result?.features ?? []) {
    for (const dimension of feature.dimensions ?? []) {
      if (dimension.probe?.requests?.some(r => !r.ok)) {
        return dimension.id;
      }
    }
  }
  return undefined;
}

/** `1 difference`, `3 differences`. */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * What a count counts: the manager's checks (one per dimension) on the
 * header, the feature lines and the planned line; the values of a file
 * (one per leaf that differs) on its group.
 */
export type Unit = 'check' | 'value';

/**
 * `1 check differs`, `3 checks differ · 16 checks planned`, `11 values
 * differ`: the parts that are zero left out, the unit named so a count of
 * checks is never read as one of values.
 */
export function foundWords(counts: Counts, unit: Unit): string[] {
  const words: string[] = [];
  if (counts.differences > 0) {
    const verb = counts.differences === 1 ? 'differs' : 'differ';
    words.push(`${count(counts.differences, unit)} ${verb}`);
  }
  if (counts.planned > 0) {
    words.push(`${count(counts.planned, unit)} planned`);
  }
  return words;
}

/**
 * What a review found, as one sentence: the checks that differ and the
 * changes planned, or that the installation is up to date (or was not
 * compared), and the pull requests the commit would open -- `2 checks
 * differ · 1 check planned; 1 pull request to open`.
 */
export function reviewWords(result: VerifyResult): string {
  const found = foundWords(countsOf(result), 'check');
  let outcome = 'not compared';
  if (found.length > 0) {
    outcome = found.join(' · ');
  } else if (compared(result)) {
    outcome = 'up to date';
  }
  const pullRequests = result.pullRequests?.length ?? 0;
  const toOpen =
    pullRequests > 0
      ? `${count(pullRequests, 'pull request')} to open`
      : 'nothing to open';
  return `${outcome}; ${toOpen}`;
}

/** A difference with its mark: `planned` where a migration plans it, `differs by input` where an input drives it, else its dimension's. */
export interface MarkedDifference {
  difference: VerifyDifference;
  mark: VerifyMark;
}

export function markOf(
  difference: VerifyDifference,
  dimension: VerifyDimension,
): VerifyMark {
  if (difference.planned) {
    return 'planned';
  }
  if (difference.input) {
    return 'differs by input';
  }
  return dimension.mark;
}

/** The words on a difference: the sentence of a planned change, the input it follows, or its mark. */
export function wordsOf({ difference, mark }: MarkedDifference): string {
  if (difference.planned) {
    return difference.planned;
  }
  if (difference.input) {
    return `differs by input: ${difference.input}`;
  }
  return mark;
}

/** The differences of one file, `<repository>:<path>`, with the plan's file where the answer carries it. */
export interface FileGroup {
  file: string;
  plan?: PlanFile;
  differences: MarkedDifference[];
  /** The hub the file is on, where that is another installation than the one compared. */
  hub?: string;
}

/**
 * The hub a file is on: the comparison's hub, where it is another
 * installation and a segment of the file's path names it (the manager
 * renders `management-clusters/<name>/…` and `installations/<name>/…`).
 * The portal of an installation lives on its hub, so the hub's files
 * appear in the installation's comparison.
 */
export function hubOf(file: string, result: VerifyResult): string | undefined {
  const { hub, installation } = result;
  if (!hub || hub === installation) {
    return undefined;
  }
  const path = file.slice(file.indexOf(':') + 1);
  return path.split('/').includes(hub) ? hub : undefined;
}

/**
 * The differences of the differing dimensions by file, in the order the
 * features name them, so each file is shown once with every reason on it.
 */
export function fileGroups(result: VerifyResult): FileGroup[] {
  const groups = new Map<string, FileGroup>();
  for (const feature of result.features ?? []) {
    for (const dimension of differingDimensions(feature)) {
      for (const difference of dimension.differences ?? []) {
        if (!difference.file) {
          continue;
        }
        const group = groups.get(difference.file) ?? {
          file: difference.file,
          plan: (result.files ?? []).find(
            f => `${f.repository}:${f.path}` === difference.file,
          ),
          differences: [],
          hub: hubOf(difference.file, result),
        };
        group.differences.push({
          difference,
          mark: markOf(difference, dimension),
        });
        groups.set(difference.file, group);
      }
    }
  }
  return [...groups.values()];
}

/** The differences to apply and the planned changes among a file's differences. */
export function countsOfDifferences(differences: MarkedDifference[]): Counts {
  const planned = differences.filter(d => d.mark === 'planned').length;
  return { differences: differences.length - planned, planned };
}

/** The file groups apart: those with a difference to apply, and those whose changes are all planned. */
export function splitGroups(groups: FileGroup[]): {
  toApply: FileGroup[];
  planned: FileGroup[];
} {
  const toApply = groups.filter(
    g => countsOfDifferences(g.differences).differences > 0,
  );
  return { toApply, planned: groups.filter(g => !toApply.includes(g)) };
}

/** Whether a differing dimension says something the file groups do not: a reason, a probe's requests, a live check, a difference without a file. */
export function hasOwnFacts(dimension: VerifyDimension): boolean {
  return (
    Boolean(dimension.reason) ||
    Boolean(dimension.probe?.requests?.length) ||
    Boolean(dimension.live?.checks?.length) ||
    (dimension.differences ?? []).some(d => !d.file)
  );
}
