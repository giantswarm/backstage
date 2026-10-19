/** Where the error ratio turns amber. */
const ERROR_RATIO_WARNING_PERCENT = 5;

/**
 * The error ratio as a stat shows it: a whole percentage, amber above 5%, and
 * "—" with no tone where nothing was called.
 */
export function errorRatioFigure(ratio: number | null): {
  value: string;
  tone?: 'ok' | 'warning';
} {
  if (ratio === null) {
    return { value: '—' };
  }
  const percent = Math.round(ratio * 100);
  return {
    value: `${percent}%`,
    tone: percent <= ERROR_RATIO_WARNING_PERCENT ? 'ok' : 'warning',
  };
}
