import {
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { Fragment } from 'react';
import { Flex, Text } from '@backstage/ui';
import { ConditionState } from '../../../../utils/gatewayTopology';

// Reasons are CamelCase without break points. They may wrap between their
// words (NotAllowed|By|Listeners), never inside one, and only a single word
// longer than the column wraps anywhere rather than being clipped.
const wrap = { overflowWrap: 'anywhere' } as const;

/** `NotAllowedByListeners` with a break opportunity before each word. */
export function camelBreaks(text: string) {
  return text.split(/(?=[A-Z][a-z])/).map((word, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {word}
    </Fragment>
  ));
}

/**
 * One status condition. A healthy condition reads "True"; only a failing one
 * shows its reason, which is what someone fixing it needs. `not-reported`
 * gets a warning, since nothing serving is the likely cause, and
 * `not-available` no status at all, so neither can be mistaken for healthy.
 * With a `name`, where no column header names the condition, the text does:
 * `Accepted: True`, `Accepted: False · RefNotPermitted`.
 */
export const ConditionStatus = ({
  condition,
  name,
}: {
  condition: ConditionState;
  name?: string;
}) => {
  const named = (text: string) => (name ? `${name}: ${text}` : text);
  switch (condition.status) {
    case 'true':
      return (
        <Flex align="center" gap="1">
          <StatusOK />
          <Text variant="body-medium">{named('True')}</Text>
        </Flex>
      );
    case 'false':
      return (
        <Flex align="center" gap="1">
          <StatusError />
          <Text variant="body-medium" style={wrap}>
            {name ? named('False') : null}
            {name && condition.reason ? ' · ' : null}
            {condition.reason ? camelBreaks(condition.reason) : null}
            {!name && !condition.reason ? 'False' : null}
          </Text>
        </Flex>
      );
    case 'not-reported':
      return (
        <Flex align="center" gap="1">
          <StatusWarning />
          <Text
            variant="body-medium"
            title="No controller has reported this condition yet."
          >
            {named('Not reported')}
          </Text>
        </Flex>
      );
    default:
      return (
        <Text variant="body-medium" color="secondary">
          {named('Not available')}
        </Text>
      );
  }
};
