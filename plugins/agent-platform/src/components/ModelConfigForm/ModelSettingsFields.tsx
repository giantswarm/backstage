import {
  Card,
  CardBody,
  Flex,
  Select,
  Switch,
  Text,
  TextField,
} from '@backstage/ui';
import {
  fieldErrorProps,
  SectionHeader,
  useSelectFieldError,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  CACHE_TTL_OPTIONS,
  type CacheTTL,
  type ModelSettingField,
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
  /**
   * agent-manager's refusal of a setting, under the setting it names
   * (`refusedSettingErrors`); the page clears it once that setting changes.
   */
  errors?: Partial<Record<ModelSettingField, string>>;
};

/** The longest token limit the field takes: nine digits. */
const MAX_TOKEN_DIGITS = 9;

/**
 * An organization's model's settings: the token limit of an answer (the
 * providers whose block has `maxTokens`) and prompt caching with its cache
 * time (Anthropic). Renders nothing for a provider with neither. The token
 * field holds whole numbers from 1 only, keeping digits alone as they are
 * typed, so every keystroke is a change the form can save; empty is the
 * provider's default.
 */
export function ModelSettingsFields({
  provider,
  values,
  onChange,
  framed = true,
  errors = {},
}: ModelSettingsFieldsProps) {
  const cacheTTLError = useSelectFieldError(errors.cacheTTL);
  const { maxTokens, caching } = providerSettings(provider);
  if (!maxTokens && !caching) return null;

  const fields = (
    <Flex direction="column" gap="4">
      {maxTokens && (
        <TextField
          label="Token limit"
          secondaryLabel="optional"
          inputMode="numeric"
          placeholder="The provider’s default"
          description="The most tokens one answer may have, a whole number. Leave it empty for the provider’s default."
          value={values.maxTokens === undefined ? '' : String(values.maxTokens)}
          onChange={text => {
            const digits = text
              .replace(/\D/g, '')
              .replace(/^0+/, '')
              .slice(0, MAX_TOKEN_DIGITS);
            onChange({ maxTokens: digits ? Number(digits) : undefined });
          }}
          {...fieldErrorProps(errors.maxTokens)}
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
          {...cacheTTLError.selectProps}
        />
      )}
      {caching && values.promptCaching && cacheTTLError.message}
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
