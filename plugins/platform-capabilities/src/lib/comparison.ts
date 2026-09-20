import {
  VerifyDimension,
  VerifyFeature,
  VerifyMark,
  VerifyResult,
} from '../apis';

/** The manager's reason for a live check it could not run as the manager itself. */
export const SESSION_REASON = 'needs your session on the installation';

/** A mark that is a difference: the file is off its definition, or off the inputs. */
export function differs(mark: VerifyMark): boolean {
  return mark === 'drifted' || mark === 'differs by input';
}

/** The dimensions of a feature that differ. */
export function differingDimensions(feature: VerifyFeature): VerifyDimension[] {
  return (feature.dimensions ?? []).filter(d => differs(d.mark));
}

/** The files a commit would create or update. */
export function filesToChange(result: VerifyResult): number {
  return (result.diff?.create ?? 0) + (result.diff?.update ?? 0);
}

/**
 * How many differences the comparison found: the manager's `drifted` and
 * `differs by input` counts; where it marked none, the files a commit would
 * still create or update.
 */
export function differencesOf(result: VerifyResult): number {
  const marked =
    (result.summary?.drifted ?? 0) +
    (result.summary?.['differs by input'] ?? 0);
  return marked || filesToChange(result);
}

export function upToDate(result: VerifyResult): boolean {
  return differencesOf(result) === 0;
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
