import { Alert, Flex, Text } from '@backstage/ui';
import { CreationPlan, Problem, Validation } from '../../apis';
import { stepDetail } from '../../lib/setupStatus';
import {
  EntryBlock,
  PlannedPullRequestView,
  ProblemFix,
  Problems,
} from '../actions/PlanView';

/**
 * The creation as the person would run it, in the manager's order: each
 * repository's create and scaffold steps as the engine plans them, then the
 * pull request -- or the manager's refusal in place of the plan.
 */
function CreationPlanView({ plan }: { plan: CreationPlan }) {
  if (plan.refusal) {
    return (
      <Alert
        status="danger"
        title="The creation would not run"
        description={plan.refusal}
        data-testid="creation-refusal"
      />
    );
  }
  return (
    <div data-testid="creation-plan">
      <Text variant="body-small" color="secondary">
        As you, in this order
      </Text>
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        {plan.repositories?.map(repository => (
          <li key={repository.name}>
            <Text variant="body-small">
              {repository.name}
              {repository.repository && ' (exists: the creation resumes)'}:{' '}
              {repository.steps
                .map(
                  step => `${step.step} — ${stepDetail(step) || step.verdict}`,
                )
                .join('; ')}
            </Text>
          </li>
        ))}
        {plan.pullRequest && (
          <li>
            <PlannedPullRequestView pullRequest={plan.pullRequest}>
              then the pull request
            </PlannedPullRequestView>
          </li>
        )}
      </ol>
    </div>
  );
}

/**
 * The dry run of a declaration as `validate_repository` returned it: every
 * entry rendered with the schema's defaults, the implied template and its
 * options, the GitHub name check, the refusals as data -- with the fix the
 * form can apply as a button (`fixFor`) -- the guard notices (what review
 * the pull request will get) and the creation as the person would run it.
 * The page adds nothing.
 */
export function DryRunPanel({
  validation,
  fixFor,
}: {
  validation: Validation;
  fixFor?: (problem: Problem) => ProblemFix | undefined;
}) {
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
          <Problems problems={entry.problems} fixFor={fixFor} />
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
      {validation.creation && <CreationPlanView plan={validation.creation} />}
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
