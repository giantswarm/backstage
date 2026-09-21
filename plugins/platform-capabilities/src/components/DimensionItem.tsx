import { VerifyDimension } from '../apis';
import { MarkedDifference, markOf, wordsOf } from '../lib/comparison';
import { MarkTag } from './StateTag';

export const LIST_STYLE = { margin: 0, paddingLeft: 16 };

/**
 * One difference without its file, which the header above carries: the
 * path (or the object), rendered against current where the change is not
 * planned, and the reason in the mark's colour.
 */
export function DifferenceLine({
  difference,
}: {
  difference: MarkedDifference;
}) {
  const { difference: d } = difference;
  const where = d.path ?? d.object;
  return (
    <li>
      {where ? <code>{where}</code> : null}
      {d.planned
        ? ''
        : `: rendered ${JSON.stringify(d.rendered)}, current ${JSON.stringify(d.current)}`}
      {' — '}
      <MarkTag mark={difference.mark} words={wordsOf(difference)} />
    </li>
  );
}

/**
 * The facts of a dimension the file groups do not carry: its mark and
 * reason, its differences without a file (objects), and its probe's
 * requests. The differences on files are shown on the files' diffs.
 */
export function DimensionItem({ dimension }: { dimension: VerifyDimension }) {
  const objects = (dimension.differences ?? []).filter(d => !d.file);
  return (
    <li data-testid={`dimension-${dimension.id}`} data-mark={dimension.mark}>
      <code>{dimension.id}</code> — <MarkTag mark={dimension.mark} />
      {dimension.reason ? `: ${dimension.reason}` : ''}
      {objects.length > 0 && (
        <ul style={LIST_STYLE}>
          {objects.map((d, i) => (
            <DifferenceLine
              key={`${d.object}-${d.path}-${i}`}
              difference={{ difference: d, mark: markOf(d, dimension) }}
            />
          ))}
        </ul>
      )}
      {!!dimension.probe?.requests?.length && (
        <ul style={LIST_STYLE}>
          {dimension.probe.requests.map(r => (
            <li key={r.url}>
              <code>{r.url}</code> — {r.status ?? r.error ?? '—'}
              {r.ok ? '' : ' (unexpected)'}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
