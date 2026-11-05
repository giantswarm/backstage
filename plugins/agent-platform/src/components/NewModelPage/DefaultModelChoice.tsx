import { Card, CardBody, Checkbox, Flex, Text } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';

import { DEFAULT_MODEL_VALUES_KEY, listed } from '../../lib/defaultModel';

/**
 * Whether a new model becomes its namespace's default. Without a default
 * there, it does, and this says so; otherwise the person decides, and a
 * default a tool manages can only be moved where the tool is configured.
 */
export function DefaultModelChoice({
  where,
  marks,
  markOwner,
  isLoading,
  isSelected,
  onChange,
}: {
  /** The owner inside a sentence (`tenantInSentence`). */
  where: string;
  /** The display names of the models marked as the default there. */
  marks: readonly string[];
  /** The tool that manages a marked model, if one does. */
  markOwner: string | undefined;
  isLoading: boolean;
  isSelected: boolean;
  onChange: (selected: boolean) => void;
}) {
  let body;
  if (isLoading) {
    body = (
      <Text variant="body-small" color="secondary">
        Checking which model is the default…
      </Text>
    );
  } else if (marks.length === 0) {
    body = (
      <Text variant="body-medium">
        {where.charAt(0).toUpperCase() + where.slice(1)} has no default model
        yet, so this one becomes it.
      </Text>
    );
  } else {
    let description: string;
    if (markOwner === 'Helm') {
      description = `The default, ${listed(marks)}, is set in Helm values. Move it there (${DEFAULT_MODEL_VALUES_KEY}).`;
    } else if (markOwner) {
      description = `The default, ${listed(marks)}, is managed by ${markOwner}. Move it where ${markOwner} is configured.`;
    } else if (marks.length === 1) {
      description = `The default now is ${marks[0]}. Agents that run on it keep it.`;
    } else {
      description = `There is no default now: ${listed(marks)} are all marked as the default. Checking this makes this model the only one.`;
    }
    body = (
      <Flex direction="column" gap="1">
        <Checkbox
          isSelected={isSelected}
          onChange={onChange}
          isDisabled={Boolean(markOwner)}
        >
          Make this the default model
        </Checkbox>
        <Text variant="body-small" color="secondary">
          {description}
        </Text>
      </Flex>
    );
  }

  return (
    <Card>
      <CardBody>
        <SectionHeader
          variant="title-x-small"
          title="Default model"
          description={`New agents for ${where} start with the default model.`}
        />
        {body}
      </CardBody>
    </Card>
  );
}
