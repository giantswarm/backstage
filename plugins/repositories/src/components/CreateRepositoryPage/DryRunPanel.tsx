import { Alert, Flex, Text } from '@backstage/ui';
import { Validation } from '../../apis';
import { EntryBlock, Problems } from '../actions/PlanView';

/**
 * The dry run of a declaration as `validate_repository` returned it: every
 * entry rendered with the schema's defaults, the implied template and its
 * options, the GitHub name check, the refusals as data, and the guard
 * notices -- what review the pull request will get. The page adds nothing.
 */
export function DryRunPanel({ validation }: { validation: Validation }) {
  return (
    <Flex direction="column" gap="3" data-testid="dry-run">
      <Text variant="body-medium">
        {validation.team}
        {validation.authorLogin && ` — as ${validation.authorLogin}`}
        {' — '}
        {validation.accepted ? 'accepted' : 'refused'}
        {validation.accepted &&
          (validation.machineApproved
            ? '; the pull request is approved by the machine once opened'
            : '; a person reviews the pull request')}
      </Text>
      {validation.notices?.map(notice => (
        <Alert
          key={notice.kind}
          status="warning"
          title={notice.kind}
          description={notice.message}
          data-testid={`notice-${notice.kind}`}
        />
      ))}
      {validation.entries.map(entry => (
        <div key={entry.name} data-testid={`dry-run-${entry.name}`}>
          <Text variant="body-medium">
            {entry.name}: {entry.accepted ? 'accepted' : 'refused'}
            {' · name '}
            {entry.nameCheck.verdict}
            {entry.nameCheck.detail && ` (${entry.nameCheck.detail})`}
            {entry.template && ` · template ${entry.template}`}
          </Text>
          <Problems problems={entry.problems} />
          <EntryBlock title="Entry" yaml={entry.rendered} />
          {entry.options && entry.options.length > 0 && (
            <Text variant="body-small" color="secondary">
              Template options:{' '}
              {entry.options
                .map(
                  option =>
                    `${option.name}${option.default ? ` (default ${option.default})` : ''}`,
                )
                .join(', ')}
            </Text>
          )}
        </div>
      ))}
      {validation.findings && validation.findings.length > 0 && (
        <ul
          data-testid="dry-run-findings"
          style={{ margin: 0, paddingLeft: 16 }}
        >
          {validation.findings.map((finding, index) => (
            <li key={`${finding.kind}-${index}`}>
              [{finding.kind}] {finding.message}
              {finding.fix && ` — fix: ${finding.fix}`}
            </li>
          ))}
        </ul>
      )}
    </Flex>
  );
}
