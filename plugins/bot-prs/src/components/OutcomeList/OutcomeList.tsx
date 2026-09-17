import { Checkbox, Flex, Link, Text } from '@backstage/ui';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';

import {
  rowsOf,
  statusIntentOf,
  type BotPrRow,
  type MargeResult,
} from '../../lib/marge';

export type OutcomeListProps = {
  result: MargeResult;
  /**
   * When set, every row carries a checkbox and the list reports the ticked
   * refs: the per-PR confirmation the team's policy asks for on a whole-team
   * Apply. Absent, the rows are read-only.
   */
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
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
 */
export function OutcomeList({
  result,
  selected,
  onSelectedChange,
}: OutcomeListProps) {
  const rows = rowsOf(result);
  const selectable = selected !== undefined && onSelectedChange !== undefined;

  const toggle = (row: BotPrRow, checked: boolean) => {
    if (!selectable) {
      return;
    }
    const next = new Set(selected);
    if (checked) {
      next.add(row.ref);
    } else {
      next.delete(row.ref);
    }
    onSelectedChange(next);
  };

  return (
    <Flex direction="column" gap="3">
      {rows.length === 0 ? (
        <Text variant="body-small" color="secondary">
          The engine reported no PR for this run.
        </Text>
      ) : null}
      {rows.map(row => {
        const { would, evidence } = splitDryRun(row.detail);
        return (
          <Flex key={row.ref} gap="2" align="start">
            {selectable ? (
              <Checkbox
                aria-label={`Apply to ${row.ref}`}
                isSelected={selected.has(row.ref)}
                onChange={checked => toggle(row, checked)}
              />
            ) : null}
            <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
              <Flex gap="2" align="center" style={{ flexWrap: 'wrap' }}>
                <Link href={row.url} target="_blank" rel="noopener noreferrer">
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
          </Flex>
        );
      })}
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
