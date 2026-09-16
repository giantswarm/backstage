import { Flex, Text } from '@backstage/ui';
import { StatusLabel } from '@giantswarm/backstage-plugin-ui-react';
import {
  SERVED_MODEL_READINESS,
  type ServedModelReadiness,
} from '../../lib/serving';
import { SERVED_READINESS_ICON } from './readinessIcon';

export type ServedReadinessLabelProps = {
  readiness: ServedModelReadiness;
  /**
   * The backend's short word for the state — `Unschedulable`,
   * `HTTPRoutesNotReady` — shown after the label, so a stuck model says what
   * is wrong before anyone hovers.
   */
  reason?: string;
  /** The explanation, on hover. */
  title?: string;
};

/**
 * The status label of a served model: the shared vocabulary's word, intent
 * and glyph (`lib/serving.ts`, `readinessIcon.ts`), with the backend's reason
 * as a secondary label — `Pending · Unschedulable`. The one component behind
 * the Serving table's status cell, the Model configs and Agents tables' model
 * column and the model detail card, so a model is never "Pending" in one view
 * and "Pending · Unschedulable" in another.
 */
export function ServedReadinessLabel({
  readiness,
  reason,
  title,
}: ServedReadinessLabelProps) {
  const { label, intent } = SERVED_MODEL_READINESS[readiness];

  return (
    <Flex align="center" gap="2" style={{ flexWrap: 'wrap' }}>
      <StatusLabel
        label={label}
        intent={intent}
        icon={SERVED_READINESS_ICON[readiness]}
        title={title}
      />
      {reason && (
        <Text
          as="span"
          variant="body-small"
          color="secondary"
          title={title}
          data-testid="served-readiness-reason"
        >
          · {reason}
        </Text>
      )}
    </Flex>
  );
}
