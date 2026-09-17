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
 * What the engine reported for each PR of one run, in the engine's words:
 * the state it filed the PR under and the evidence line that says why. A
 * refusal is one of these rows -- `Skipped`, `Held`, a `Failed` with the
 * guard's reason in the detail -- and nothing here offers a way around it,
 * because the engine has none.
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
    <Flex direction="column" gap="2">
      {rows.length === 0 ? (
        <Text variant="body-small" color="secondary">
          The engine reported no PR for this run.
        </Text>
      ) : null}
      {rows.map(row => (
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
              <StatusLabel
                label={row.status}
                intent={statusIntentOf(row.group)}
                title={row.label}
              />
            </Flex>
            <Text
              variant="body-small"
              color="secondary"
              truncate
              title={row.title}
            >
              {row.title}
            </Text>
            {row.detail ? <Text variant="body-small">{row.detail}</Text> : null}
          </Flex>
        </Flex>
      ))}
      {(result.repositories_failed ?? []).map(failure => (
        <Text key={failure.repo} variant="body-small" color="danger">
          {failure.repo}: {failure.error}
        </Text>
      ))}
      {(result.unhandled ?? []).map(unhandled => (
        <Text key={unhandled.signature} variant="body-small" color="secondary">
          No rule matches {unhandled.prs.join(', ')}: {unhandled.signature}
          {unhandled.checks.length > 0
            ? ` (${unhandled.checks.join(', ')})`
            : ''}
          . Nothing was written.
        </Text>
      ))}
      {result.rules?.error ? (
        <Text variant="body-small" color="danger">
          No rule catalogue could be read, so every remedy is refused:{' '}
          {result.rules.error}
        </Text>
      ) : null}
    </Flex>
  );
}
