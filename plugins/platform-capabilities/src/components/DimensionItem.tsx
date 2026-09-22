import { Text } from '@backstage/ui';
import { LiveCheck, VerifyDimension } from '../apis';
import { MarkedDifference, markOf, wordsOf } from '../lib/comparison';
import { MarkTag } from './StateTag';

/** A nested list: one indent step per depth, leading 1.5 for the lines a mark's glyph sits in. */
export const LIST_STYLE = {
  margin: 0,
  paddingLeft: 'var(--bui-space-4)',
  lineHeight: 1.5,
};

/** What a live check looked at: its URL, or the object by resource, namespace and name. */
function target(check: LiveCheck): string {
  if (check.url) {
    return check.url;
  }
  const object = [check.resource, check.name].filter(Boolean).join(' ');
  return check.namespace
    ? `${check.resource} ${check.namespace}/${check.name}`
    : object;
}

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
 * reason, its differences without a file (objects), its probe's requests
 * and its live checks. The differences on files are shown on the files'
 * diffs.
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
              <Text as="span" variant="body-small">
                <code>{r.url}</code> — {r.status ?? r.error ?? '—'}
                {r.ok ? '' : ' (unexpected)'}
              </Text>
            </li>
          ))}
        </ul>
      )}
      {!!dimension.live?.checks?.length && (
        <ul style={LIST_STYLE} data-testid={`checks-${dimension.id}`}>
          {dimension.live.checks.map((check, i) => (
            <li key={`${target(check)}-${i}`}>
              <code>{target(check)}</code> —{' '}
              <MarkTag
                mark={check.mark}
                words={
                  check.message ? `${check.mark}: ${check.message}` : check.mark
                }
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
