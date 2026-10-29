import { Text, VisuallyHidden } from '@backstage/ui';

export type ModelChipProps = {
  /** The model's label, as `AgentRow.model` carries it. */
  model?: string;
};

/** The model an agent runs on, named beside the agent picker. */
export function ModelChip({ model }: ModelChipProps) {
  if (!model) {
    return null;
  }
  return (
    <Text variant="body-small" color="secondary" title="Model">
      <VisuallyHidden>Model: </VisuallyHidden>
      {model}
    </Text>
  );
}
