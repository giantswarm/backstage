import { Flex, Link, Text } from '@backstage/ui';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import { rowsOf, statusIntentOf, type MargeResult } from '../../lib/marge';

export type OutcomeListProps = {
  result: MargeResult;
};

/**
 * A dry run leaves a PR in its class and says what the run would do in the
 * evidence line, after a `dry-run:` prefix. That line is the outcome a
 * preview is for, so it leads the row; the class the engine filed the PR
 * under follows it. Without the prefix the line is the classification's own
 * evidence, a refusal included.
 */
export function splitDryRun(detail: string | undefined): {
  would?: string;
  evidence?: string;
} {
  if (!detail) {
    return {};
  }
  const parts = detail.split(/;\s*dry-run:\s*|^dry-run:\s*/).filter(Boolean);
  if (parts.length === 1 && !/^dry-run:/.test(detail)) {
    return { evidence: detail };
  }
  if (/^dry-run:/.test(detail)) {
    return { would: parts[0] };
  }
  return { evidence: parts[0], would: parts.slice(1).join('; ') };
}

/** `would approve, merge (squash)` as a sentence: `Would approve, merge (squash)`. */
function sentence(would: string): string {
  const text = would.replace(
    /^rule (\S+) would apply (\S+)$/,
    'rule $1 applies $2',
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What the engine reported for each PR of one run, in the engine's words: on
 * a dry run the step it would take, then the state it filed the PR under and
 * the evidence line that says why. A refusal is one of these rows -- `Held`
 * or `Failed` with the guard's reason -- and nothing here offers a way around
 * it, because the engine has none. The failures no rule recognises come last,
 * under one heading.
 *
 * The engine answers in its own class order, which reads as no order at all
 * past a screen, so the rows are grouped by repository and ordered by PR
 * number inside it.
 */
export function OutcomeList({ result }: OutcomeListProps) {
  const rows = rowsOf(result);
  const repositories = [...new Set(rows.map(row => row.repository))].sort();

  return (
    <Flex direction="column" gap="3">
      {rows.length === 0 ? (
        <Text variant="body-small" color="secondary">
          The engine reported no PR for this run.
        </Text>
      ) : null}
      {repositories.map(repository => (
        <Flex key={repository} direction="column" gap="2">
          {repositories.length > 1 ? (
            <Text variant="body-small" weight="bold">
              {repository}
            </Text>
          ) : null}
          {rows
            .filter(row => row.repository === repository)
            .sort((a, b) => a.number - b.number)
            .map(row => {
              const { would, evidence } = splitDryRun(row.detail);
              return (
                <Flex
                  key={row.ref}
                  direction="column"
                  gap="1"
                  style={{ minWidth: 0 }}
                >
                  <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
                    <Link
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {row.ref}
                    </Link>
                    <Text variant="body-small" color="secondary" truncate>
                      {row.title}
                    </Text>
                  </Flex>
                  {would ? (
                    <Text variant="body-medium" weight="bold">
                      {sentence(would)}
                    </Text>
                  ) : null}
                  <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
                    <StatusLabel
                      label={row.status}
                      intent={statusIntentOf(row.group)}
                      title={row.label}
                    />
                    {evidence ? (
                      <Text variant="body-small" color="secondary">
                        {evidence}
                      </Text>
                    ) : null}
                  </Flex>
                </Flex>
              );
            })}
        </Flex>
      ))}
      {(result.repositories_failed ?? []).map(failure => (
        <Text key={failure.repo} variant="body-small" color="danger">
          {failure.repo}: {failure.error}
        </Text>
      ))}
      {(result.unhandled ?? []).length > 0 ? (
        <Flex direction="column" gap="1">
          <Text variant="body-small" weight="bold">
            No rule of the catalogue matches these failures. Nothing is written
            for them; each signature is what `marge rules draft` takes.
          </Text>
          {(result.unhandled ?? []).map(unhandled => (
            <Text
              key={unhandled.signature}
              variant="body-small"
              color="secondary"
            >
              {unhandled.prs.join(', ')}: {unhandled.checks.join(', ')} (
              {unhandled.signature})
            </Text>
          ))}
        </Flex>
      ) : null}
      {result.rules?.error ? (
        <Text variant="body-small" color="danger">
          No rule catalogue could be read, so every remedy is refused:{' '}
          {result.rules.error}
        </Text>
      ) : null}
    </Flex>
  );
}
