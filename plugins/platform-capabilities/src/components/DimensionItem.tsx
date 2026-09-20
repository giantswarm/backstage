import { VerifyDimension } from '../apis';
import { StateTag } from './StateTag';

export const LIST_STYLE = { margin: 0, paddingLeft: 16 };

/**
 * One dimension of a feature as `verify_capability` marked it: its mark and
 * reason, the differences (file, path, the input driving it, rendered against
 * current) and the probe's requests.
 */
export function DimensionItem({ dimension }: { dimension: VerifyDimension }) {
  return (
    <li data-testid={`dimension-${dimension.id}`} data-mark={dimension.mark}>
      <code>{dimension.id}</code> — <StateTag state={dimension.mark} />
      {dimension.reason ? `: ${dimension.reason}` : ''}
      {!!dimension.differences?.length && (
        <ul style={LIST_STYLE}>
          {dimension.differences.map((d, i) => (
            <li key={`${d.file}-${d.path}-${i}`}>
              <code>
                {d.file}
                {d.path ? ` ${d.path}` : ''}
              </code>
              {d.input ? ` (input ${d.input})` : ''}: rendered{' '}
              {JSON.stringify(d.rendered)}, current {JSON.stringify(d.current)}
            </li>
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
