import {
  Card,
  CardBody,
  Flex,
  NumberField,
  Select,
  Switch,
  Text,
} from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';

import {
  CACHE_TTL_OPTIONS,
  type CacheTTL,
  type ModelSettingsValues,
  providerSettings,
} from '../../lib/modelSettings';

export type ModelSettingsFieldsProps = {
  /** The model's provider: only the settings its models have show. */
  provider: string;
  values: ModelSettingsValues;
  onChange: (patch: Partial<ModelSettingsValues>) => void;
  /** In a card of its own (the model page), or bare (a dialog). */
  framed?: boolean;
};

/**
 * An organization's model's settings: the token limit of an answer (the
 * providers whose block has `maxTokens`) and prompt caching with its cache
 * time (Anthropic). Renders nothing for a provider with neither. The token
 * field holds whole numbers from 1 only; empty is the provider's default.
 */
export function ModelSettingsFields({
  provider,
  values,
  onChange,
  framed = true,
}: ModelSettingsFieldsProps) {
  const { maxTokens, caching } = providerSettings(provider);
  if (!maxTokens && !caching) return null;

  const fields = (
    <Flex direction="column" gap="4">
      {maxTokens && (
        <NumberField
          label="Token limit"
          secondaryLabel="optional"
          placeholder="The provider’s default"
          description="The most tokens one answer may have. Leave it empty for the provider’s default."
          minValue={1}
          step={1}
          formatOptions={{ maximumFractionDigits: 0 }}
          value={values.maxTokens ?? NaN}
          onChange={value =>
            onChange({
              maxTokens:
                Number.isFinite(value) && value >= 1
                  ? Math.round(value)
                  : undefined,
            })
          }
        />
      )}
      {caching && (
        <Flex direction="column" gap="1">
          <Switch
            label="Prompt caching"
            isSelected={values.promptCaching}
            onChange={promptCaching => onChange({ promptCaching })}
          />
          <Text as="p" variant="body-small" color="secondary">
            A long system prompt or history is read from the cache at a fraction
            of the input price.
          </Text>
        </Flex>
      )}
      {caching && values.promptCaching && (
        <Select
          label="Cache time"
          isRequired
          options={CACHE_TTL_OPTIONS}
          selectedKey={values.cacheTTL}
          onSelectionChange={key => {
            if (key) onChange({ cacheTTL: String(key) as CacheTTL });
          }}
          description="1 hour costs more for each cache write. Choose it only for agents whose calls are more than five minutes apart."
        />
      )}
    </Flex>
  );

  if (!framed) return fields;
  return (
    <Card>
      <CardBody>
        <SectionHeader
          variant="title-x-small"
          title="Settings"
          description="How the model answers the organization’s agents."
        />
        {fields}
      </CardBody>
    </Card>
  );
}
