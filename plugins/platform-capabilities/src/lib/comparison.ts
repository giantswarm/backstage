import {
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

/** The checks that did not run: those needing the person's session on the installation, the rest by reason. */
export function notChecked(features: VerifyFeature[]): {
  session: number;
  other: [reason: string, count: number][];
} {
  let session = 0;
  const other = new Map<string, number>();
  for (const feature of features) {
    for (const dimension of feature.dimensions ?? []) {
      if (dimension.mark !== 'not checked') {
        continue;
      }
      if (dimension.reason === SESSION_REASON) {
        session++;
      } else {
        const reason = dimension.reason ?? 'no reason given';
        other.set(reason, (other.get(reason) ?? 0) + 1);
      }
    }
  }
  return { session, other: [...other.entries()] };
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

/** `2 differences`, `1 planned change`: the parts that are zero left out. */
export function foundWords(counts: Counts): string[] {
  const words: string[] = [];
  if (counts.differences > 0) {
    words.push(count(counts.differences, 'difference'));
  }
  if (counts.planned > 0) {
    words.push(count(counts.planned, 'planned change'));
  }
  return words;
}
