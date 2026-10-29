import { Alert, Button } from '@backstage/ui';

import type { ModelProblem } from '../../../lib/modelProblem';

/**
 * Why agents cannot use the model yet, at the top of Overview, in plain
 * words (`modelProblem`): what is wrong and what to do. A model kagent
 * rejected is a danger alert; one it has not checked yet an info alert.
 * "Show conditions" opens the Technical details at the foot of the tab,
 * where the conditions say it in kagent's own terms.
 */
export function ModelReadinessAlert({
  problem,
  onShowConditions,
}: {
  problem: ModelProblem;
  /** Reveal the Technical details below, open and in view. */
  onShowConditions: () => void;
}) {
  return (
    <Alert
      status={problem.status}
      icon
      title={problem.title}
      description={problem.description}
      customActions={
        <Button size="small" variant="secondary" onPress={onShowConditions}>
          Show conditions
        </Button>
      }
    />
  );
}
