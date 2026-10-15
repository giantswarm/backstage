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
  MoreOptions,
  SectionHeader,
  type FieldValidation,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  isSupportedProvider,
  isVertexAIProvider,
  MODEL_PROVIDER_OPTIONS,
  ModelConfigFieldErrors,
  ModelConfigFormValues,
  PROVIDER_SECRET_KEYS,
  providerHasEndpoint,
  serviceAccountKeySummary,
} from '../../lib/modelConfigs';
import { SecretTextField } from './SecretTextField';
import { ServiceAccountKeyField } from './ServiceAccountKeyField';

export type ModelConfigFormFieldsProps = {
  values: ModelConfigFormValues;
  onChange: (patch: Partial<ModelConfigFormValues>) => void;
  mode: 'create' | 'edit';
  /** Each field's current problem (`modelConfigFieldErrors`). */
  errors?: ModelConfigFieldErrors;
  /**
   * The page's `useFieldValidation`, which decides when a field shows its
   * problem: once the person leaves it, or once a submit was blocked.
   */
  validation: Pick<FieldValidation, 'textFieldProps' | 'errorFor'>;
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
  /** Edit only: the Vertex AI project the model has on the cluster. */
  originalProjectID?: string;
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
        'Agents on this model authenticate with this key. Leave it empty if the endpoint needs none.',
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
      ? `The stored key is for ${providerLabel(originalProvider!)}, not ${providerLabel(provider)}. Enter a new one, or leave empty if the endpoint needs none.`
      : 'Agents on this model authenticate with this key. Leave it empty if the endpoint needs none.',
  };
}

/**
 * What the service account key field says about itself. Unlike an API key it
 * is never optional where the save would write a Secret: kagent accepts only
 * a real key. An edit of a Vertex AI model may keep the stored key.
 */
function serviceAccountKeyCopy({
  mode,
  originalProvider,
  originalProjectID,
}: {
  mode: 'create' | 'edit';
  originalProvider: string | undefined;
  originalProjectID: string | undefined;
}): { description: string; isRequired: boolean; storedKeyProject?: string } {
  const howTo =
    'The JSON key file of a service account that can use Vertex AI. The model runs in the project of the key.';
  if (mode === 'edit' && isVertexAIProvider(originalProvider)) {
    return {
      description: `${howTo} Choose a file only to replace the stored key.`,
      isRequired: false,
      storedKeyProject: originalProjectID || undefined,
    };
  }
  return { description: howTo, isRequired: true };
}

/** The Model field's example, in the provider's own naming. */
function modelPlaceholder(provider: ModelConfigFormValues['provider']): string {
  switch (provider) {
    case 'Ollama':
      return 'e.g. qwen3:8b';
    case 'AnthropicVertexAI':
      return 'e.g. claude-sonnet-4-5@20250929';
    case 'GeminiVertexAI':
    case 'Gemini':
      return 'e.g. gemini-2.5-pro';
    default:
      return 'e.g. claude-sonnet-4-6';
  }
}

/**
 * The fields shared by the create and edit flows (`NewModelPage`). Pure
 * presentation: values and validation live with the page, which hands the
 * problems back as `errors` for each field to show under itself.
 *
 * Plain first, like the agent wizard's first step: what the model is called,
 * the provider and how to reach it, its key, then the model, whose id the
 * provider decides. The technical name is said under the
 * name, with the fact that it cannot be changed (M7, like the agent wizard);
 * its override (create only) and skipping TLS verification wait under More
 * options.
 */
export function ModelConfigFormFields({
  values,
  onChange,
  mode,
  errors = {},
  validation,
  moreOptionsOpen,
  onMoreOptionsOpenChange,
  originalProvider,
  originalProjectID,
}: ModelConfigFormFieldsProps) {
  const providerOption = MODEL_PROVIDER_OPTIONS.find(
    option => option.id === values.provider,
  );
  const hasEndpoint = providerHasEndpoint(values.provider);
  const needsKey = Boolean(PROVIDER_SECRET_KEYS[values.provider]);
  const isOllama = values.provider === 'Ollama';
  const { textFieldProps, errorFor } = validation;
  const isVertexAI = isVertexAIProvider(values.provider);
  const keyCopy = apiKeyCopy({
    mode,
    provider: values.provider,
    originalProvider,
  });

  // The disclosure's one line of what it holds now.
  const moreOptionsSummary = [
    values.name && mode === 'create'
      ? `technical name ${values.name}`
      : undefined,
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
            variant="title-x-small"
            title="Name"
            description="People creating agents see the model under this name."
          />
          <TextField
            label="Name"
            isRequired={mode === 'create'}
            value={values.displayName}
            onChange={displayName => onChange({ displayName })}
            placeholder="e.g. Sonnet 4.5"
            {...textFieldProps('displayName', errors.displayName)}
          />
          {values.name && (
            <Text
              as="p"
              variant="body-small"
              color="secondary"
              style={{
                marginTop: 'var(--bui-space-1)',
                overflowWrap: 'anywhere',
              }}
            >
              Its technical name is <code>{values.name}</code>;{' '}
              {mode === 'edit'
                ? 'it cannot be changed.'
                : 'it cannot be changed once the model exists.'}
            </Text>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionHeader
            variant="title-x-small"
            title="Provider"
            description="Choose where the model runs."
          />
          <Flex direction="column" gap="4">
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
                    provider: String(key) as ModelConfigFormValues['provider'],
                  });
                }
              }}
              description={providerOption?.description}
            />
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
                    ? 'Enter the Ollama server to talk to.'
                    : 'Leave empty for the provider’s own endpoint, or set a compatible one like vLLM, llama.cpp or OpenRouter.'
                }
                {...textFieldProps('endpoint', errors.endpoint)}
              />
            )}

            {isVertexAI && (
              <TextField
                label="Location"
                isRequired
                value={values.location}
                onChange={location => onChange({ location })}
                placeholder="e.g. europe-west4"
                description="Where Vertex AI serves the model: global, the us or eu multi-region, or a region such as europe-west4. The model must be offered there."
                {...textFieldProps('location', errors.location)}
              />
            )}
          </Flex>
        </CardBody>
      </Card>

      {isVertexAI && (
        <Card>
          <CardBody>
            <SectionHeader
              variant="title-x-small"
              title="Service account key"
              description="Stored as a Kubernetes Secret next to the model config; never shown again. Agents never see it: the platform exchanges it for short-lived tokens."
            />
            <ServiceAccountKeyField
              value={values.apiKey}
              // The project is the key's: kagent refuses a key of another.
              onChange={apiKey =>
                onChange({
                  apiKey,
                  projectID: apiKey
                    ? (serviceAccountKeySummary(apiKey)?.projectID ?? '')
                    : (originalProjectID ?? ''),
                })
              }
              // A chosen file is a selection, complete once made: its
              // problem shows at once. A missing one waits for the submit.
              error={
                values.apiKey
                  ? errors.apiKey
                  : errorFor('apiKey', errors.apiKey)
              }
              {...serviceAccountKeyCopy({
                mode,
                originalProvider,
                originalProjectID,
              })}
            />
          </CardBody>
        </Card>
      )}

      {needsKey && !isVertexAI && (
        <Card>
          <CardBody>
            <SectionHeader
              variant="title-x-small"
              title="API key"
              description="Stored as a Kubernetes Secret next to the model config; never shown again."
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

      <Card>
        <CardBody>
          <SectionHeader variant="title-x-small" title="Model" />
          <TextField
            label="Model"
            isRequired
            value={values.model}
            onChange={model => onChange({ model })}
            placeholder={modelPlaceholder(values.provider)}
            description="Enter the model id as the provider names it."
            {...textFieldProps('model', errors.model)}
          />
        </CardBody>
      </Card>

      {/* Edit keeps nothing here without an endpoint: the technical name is
          locked and said under the name. */}
      {(mode === 'create' || hasEndpoint) && (
        <MoreOptions
          open={moreOptionsOpen}
          onOpenChange={onMoreOptionsOpenChange}
          summary={moreOptionsSummary || undefined}
        >
          <Text variant="body-small" color="secondary">
            The defaults work for most models.
          </Text>
          {mode === 'create' && (
            <TextField
              label="Technical name"
              secondaryLabel="filled in from the name"
              isRequired
              value={values.name}
              onChange={name => onChange({ name })}
              placeholder="e.g. sonnet-4-5"
              description="Lowercase letters, numbers and hyphens. Names the resource and its key Secret."
              {...textFieldProps('name', errors.name)}
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
      )}
    </>
  );
}
