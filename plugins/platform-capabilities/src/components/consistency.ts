import { VerifyDimension, VerifyFeature, VerifyMark } from '../apis';

/**
 * Whether the portal reads an installation as the signed-in person -- what
 * the Installations page already knows from its per-installation inventory
 * probe. `unknown` (the default) leaves the manager's marks as they are.
 */
export type InstallationReadability =
  | { state: 'readable' | 'unknown' }
  | { state: 'not readable'; reason?: string };

/** A mark as a cell of the Consistency view shows it. */
export type CellMark = VerifyMark | 'not readable';

export const CELL_MARKS: readonly CellMark[] = [
  'as defined',
  'differs by input',
  'drifted',
  'not checked',
  'not readable',
];

/** The dimensions that read the installation itself: the probes and the live comparison. */
export const LIVE_KINDS: ReadonlySet<string> = new Set(['probe', 'live']);

export const NOT_READABLE_REASON =
  'the installation cannot be read as you; what its probes answered is not shown as drift';

export interface CellDimension extends Omit<VerifyDimension, 'mark'> {
  mark: CellMark;
}

export interface Cell {
  mark: CellMark;
  dimensions: CellDimension[];
}

const RANK: Record<VerifyMark, number> = {
  'not checked': 0,
  'as defined': 1,
  'differs by input': 2,
  drifted: 3,
};

/**
 * The manager's roll-up, applied to a subset of a feature's dimensions:
 * drifted > differs by input > as defined; *not checked* never taints a
 * feature with a checked dimension; all not checked is not checked.
 */
export function rollUp(marks: VerifyMark[]): VerifyMark {
  return marks.reduce<VerifyMark>(
    (worst, mark) => (RANK[mark] > RANK[worst] ? mark : worst),
    'not checked',
  );
}

/**
 * What a cell shows for a feature. A readable installation shows the
 * manager's mark and dimensions as they are. For an installation the person
 * may not read, the dimensions that read it live are *not readable* -- not
 * the mark the manager's own probe produced -- and the feature's mark is
 * rolled up from the file dimensions alone: no drift is shown that the
 * person could not see for themselves. A feature with nothing but live
 * dimensions is *not readable* as a whole.
 */
export function cellOf(feature: VerifyFeature, readable: boolean): Cell {
  const dimensions = feature.dimensions ?? [];
  if (readable || !dimensions.some(d => LIVE_KINDS.has(d.kind ?? ''))) {
    return { mark: feature.mark, dimensions };
  }
  const shown: CellDimension[] = dimensions.map(d =>
    LIVE_KINDS.has(d.kind ?? '')
      ? { ...d, mark: 'not readable', reason: NOT_READABLE_REASON }
      : d,
  );
  const files = dimensions.filter(d => !LIVE_KINDS.has(d.kind ?? ''));
  const checked = files.some(d => d.mark !== 'not checked');
  return {
    mark: checked ? rollUp(files.map(d => d.mark)) : 'not readable',
    dimensions: shown,
  };
}

/** How many cells of the given marks a result has, for the row's summary line. */
export function countMarks(cells: Cell[]): Partial<Record<CellMark, number>> {
  const counts: Partial<Record<CellMark, number>> = {};
  for (const cell of cells) {
    counts[cell.mark] = (counts[cell.mark] ?? 0) + 1;
  }
  return counts;
}

/**
 * The inputs as a list of dotted leaves (`installation.baseDomain`,
 * `federation.targets`): the definition's own names, one line each.
 */
export function flattenInputs(
  values: Record<string, unknown> | undefined,
  prefix = '',
): [string, string][] {
  const leaves: [string, string][] = [];
  for (const [key, value] of Object.entries(values ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      leaves.push(...flattenInputs(value as Record<string, unknown>, path));
    } else {
      leaves.push([
        path,
        Array.isArray(value) ? value.join(', ') : String(value),
      ]);
    }
  }
  return leaves;
}
