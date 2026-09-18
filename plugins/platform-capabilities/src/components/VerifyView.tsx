import { Alert, Flex, Text } from '@backstage/ui';
import { VerifyDimension, VerifyResult } from '../apis';
import { StateTag } from './StateTag';

const LIST_STYLE = { margin: 0, paddingLeft: 16 };

function Dimension({ dimension }: { dimension: VerifyDimension }) {
  return (
    <li>
      <code>{dimension.id}</code> — {dimension.mark}
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

/** `verify_capability`'s answer: the state, the inputs on record, the features with their marks. */
export function VerifyView({ result }: { result: VerifyResult }) {
  const summary = Object.entries(result.summary ?? {})
    .map(([mark, n]) => `${n} ${mark}`)
    .join(', ');
  return (
    <Flex direction="column" gap="2" data-testid="verify-result">
      <Flex gap="2" align="center">
        <Text variant="body-medium" weight="bold">
          Verified
        </Text>
        {result.state && (
          <StateTag state={result.state} testId="verify-state" />
        )}
      </Flex>
      <Text variant="body-small" color="secondary">
        Inputs on record: {result.inputs?.source ?? 'none'}
        {summary ? ` — ${summary}` : ''}
      </Text>
      {result.refused && (
        <Alert
          status="danger"
          title="Refused by the definition"
          description={result.refused}
        />
      )}
      <ul style={LIST_STYLE} data-testid="verify-features">
        {result.features.map(feature => (
          <li key={feature.id} data-testid={`feature-${feature.id}`}>
            <details>
              <summary>
                {feature.title ?? feature.id} — <strong>{feature.mark}</strong>
              </summary>
              <ul style={LIST_STYLE}>
                {feature.dimensions?.map(dimension => (
                  <Dimension key={dimension.id} dimension={dimension} />
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </Flex>
  );
}
