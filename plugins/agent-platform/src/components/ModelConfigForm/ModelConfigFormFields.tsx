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
  FormFieldGrid,
  MoreOptions,
  SectionHeader,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  isSupportedProvider,
  MODEL_PROVIDER_OPTIONS,
  ModelConfigFieldErrors,
  ModelConfigFormValues,
  PROVIDER_SECRET_KEYS,
  providerHasEndpoint,
} from '../../lib/modelConfigs';
import { SecretTextField } from './SecretTextField';

export type ModelConfigFormFieldsProps = {
  values: ModelConfigFormValues;
  onChange: (patch: Partial<ModelConfigFormValues>) => void;
  mode: 'create' | 'edit';
  /**
   * The problems to show on the fields themselves — the page passes them once
   * a submit was blocked (`modelConfigFieldErrors`, `useFieldValidation`).
   */
  errors?: ModelConfigFieldErrors;
  /**
   * Whether "More options" is open. The page owns it, so a blocked submit
   * can open it on a field inside.
   */
  moreOptionsOpen: boolean;
  onMoreOptionsOpenChange: (open: boolean) => void;
  /**
   * Edit only: the provider the model has on the cluster, which decides what
   * an empty API key field means (see `planKeySecret`).
   */
  originalProvider?: string;
};

function providerLabel(provider: string): string {
  return (
    MODEL_PROVIDER_OPTIONS.find(option => option.id === provider)?.label ??
    provider
  );
}

/**
 * What the API key field says about itself. The key is optional throughout:
 * empty means the endpoint needs none on create, and "keep the stored key" on
 * an edit — unless the edit changes the provider, whose runtime does not read
 * the old provider's key, so empty means "none needed" there too.
 */
function apiKeyCopy({
  mode,
  provider,
  originalProvider,
}: {
  mode: 'create' | 'edit';
  provider: ModelConfigFormValues['provider'];
  originalProvider: string | undefined;
}): { placeholder: string; description: string } {
  if (mode === 'create') {
    return {
      placeholder: '',
      description:
        'The provider API key agents on this model authenticate with. Leave it empty if the endpoint needs none.',
    };
  }
  if (originalProvider === provider) {
    return {
      placeholder: 'Leave empty to keep the current key',
      description: 'Enter a value only to replace the stored key.',
    };
  }
  const hadKey =
    isSupportedProvider(originalProvider) &&
    Boolean(PROVIDER_SECRET_KEYS[originalProvider]);
  return {
    placeholder: '',
    description: hadKey
      ? `The stored key is for ${providerLabel(originalProvider!)}, which ${providerLabel(provider)} does not use. Enter its key, or leave it empty if the endpoint needs none.`
      : 'The provider API key agents on this model authenticate with. Leave it empty if the endpoint needs none.',
  };
}

/**
 * The fields shared by the create and edit flows (`NewModelPage`). Pure
 * presentation: values and validation live with the page, which hands the
 * problems back as `errors` for each field to show under itself.
 *
 * Plain first, like the agent wizard's first step: what the model is called,
 * which provider and model, and its key. The technical knobs — the technical
 * name (filled in from the display name) and skipping TLS verification — wait
 * under More options.
 */
export function ModelConfigFormFields({
  values,
  onChange,
  mode,
  errors = {},
  moreOptionsOpen,
  onMoreOptionsOpenChange,
  originalProvider,
}: ModelConfigFormFieldsProps) {
  const providerOption = MODEL_PROVIDER_OPTIONS.find(
    option => option.id === values.provider,
  );
  const hasEndpoint = providerHasEndpoint(values.provider);
  const needsKey = Boolean(PROVIDER_SECRET_KEYS[values.provider]);
  const isOllama = values.provider === 'Ollama';
  const keyCopy = apiKeyCopy({
    mode,
    provider: values.provider,
    originalProvider,
  });

  // The disclosure's one line of what it holds now.
  const moreOptionsSummary = [
    values.name ? `technical name ${values.name}` : undefined,
    hasEndpoint && values.insecureSkipTlsVerify
      ? 'TLS verification skipped'
      : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <Card>
        <CardBody>
          <SectionHeader
            title="Name"
            description="How this model appears to people creating agents."
          />
          <TextField
            label="Display name"
            isRequired={mode === 'create'}
            value={values.displayName}
            onChange={displayName => onChange({ displayName })}
            placeholder="e.g. Sonnet 4.5"
            description="What people see when they choose a model."
            {...fieldErrorProps(errors.displayName)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionHeader
            title="Provider & model"
            description="Where the model runs and which model to request there."
          />
          <Flex direction="column" gap="4">
            <FormFieldGrid>
              <Select
                label="Provider"
                isRequired
                options={MODEL_PROVIDER_OPTIONS.map(option => ({
                  id: option.id,
                  label: option.label,
                }))}
                selectedKey={values.provider}
                onSelectionChange={key => {
                  if (key) {
                    onChange({
                      provider: String(
                        key,
                      ) as ModelConfigFormValues['provider'],
                    });
                  }
                }}
                description={providerOption?.description}
              />
              <TextField
                label="Model"
                isRequired
                value={values.model}
                onChange={model => onChange({ model })}
                placeholder={
                  isOllama ? 'e.g. qwen3:8b' : 'e.g. claude-sonnet-4-6'
                }
                description="The model id, as the provider names it."
                {...fieldErrorProps(errors.model)}
              />
            </FormFieldGrid>

            {hasEndpoint && (
              <TextField
                label={isOllama ? 'Host' : 'Base URL'}
                secondaryLabel={isOllama ? undefined : 'optional'}
                isRequired={isOllama}
                value={values.endpoint}
                onChange={endpoint => onChange({ endpoint })}
                placeholder={
                  isOllama
                    ? 'http://ollama.ollama:11434'
                    : 'https://vllm.example.com/v1'
                }
                description={
                  isOllama
                    ? 'The Ollama server to talk to.'
                    : 'Leave empty for the provider’s own endpoint. Set it for a compatible endpoint like vLLM, llama.cpp or OpenRouter.'
                }
                {...fieldErrorProps(errors.endpoint)}
              />
            )}
          </Flex>
        </CardBody>
      </Card>

      {needsKey && (
        <Card>
          <CardBody>
            <SectionHeader
              title="API key"
              description="Stored as a Kubernetes Secret next to the model config and never shown again — this form only ever writes it."
            />
            <SecretTextField
              label="API key"
              secondaryLabel="optional"
              value={values.apiKey}
              onChange={apiKey => onChange({ apiKey })}
              placeholder={keyCopy.placeholder}
              description={keyCopy.description}
            />
          </CardBody>
        </Card>
      )}

      <MoreOptions
        open={moreOptionsOpen}
        onOpenChange={onMoreOptionsOpenChange}
        summary={moreOptionsSummary || undefined}
      >
        <Text variant="body-small" color="secondary">
          The defaults work for most models.
        </Text>
        {mode === 'edit' ? (
          <TextField
            label="Technical name"
            secondaryLabel="fixed"
            isReadOnly
            value={values.name}
            description="Names the resource and its key Secret. It can't be changed."
          />
        ) : (
          <TextField
            label="Technical name"
            secondaryLabel="filled in from the display name"
            isRequired
            value={values.name}
            onChange={name => onChange({ name })}
            placeholder="e.g. sonnet-4-5"
            description="Lowercase letters, numbers and hyphens. Names the resource and its key Secret; it can't be changed later."
            {...fieldErrorProps(errors.name)}
          />
        )}
        {hasEndpoint && (
          <Switch
            label="Skip TLS certificate verification (for endpoints with self-signed certificates)"
            isSelected={values.insecureSkipTlsVerify}
            onChange={insecureSkipTlsVerify =>
              onChange({ insecureSkipTlsVerify })
            }
          />
        )}
      </MoreOptions>
    </>
  );
}
