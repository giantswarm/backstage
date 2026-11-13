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
  isVertexAIProvider,
  MODEL_PROVIDER_OPTIONS,
  ModelConfigFieldErrors,
  type ModelProvider,
  ModelConfigFormValues,
  providerHasEndpoint,
} from '../../lib/modelConfigs';

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
  /** The providers to offer; every one the form speaks when absent. */
  providers?: readonly ModelProvider[];
  /**
   * Organization models use managed endpoints; the form asks for no override.
   */
  routed?: boolean;
  /**
   * Whether the save asks for a new key on the credential form.
   */
  replaceKey?: boolean;
  onReplaceKeyChange?: (replaceKey: boolean) => void;
};

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
 */
export function ModelConfigFormFields({
  values,
  onChange,
  mode,
  errors = {},
  validation,
  moreOptionsOpen,
  onMoreOptionsOpenChange,
  providers,
  routed = false,
  replaceKey = false,
  onReplaceKeyChange,
}: ModelConfigFormFieldsProps) {
  const providerOption = MODEL_PROVIDER_OPTIONS.find(
    option => option.id === values.provider,
  );
  const providerOptions = providers
    ? MODEL_PROVIDER_OPTIONS.filter(option => providers.includes(option.id))
    : MODEL_PROVIDER_OPTIONS;
  const hasEndpoint = providerHasEndpoint(values.provider) && !routed;
  const isOllama = values.provider === 'Ollama';
  const { textFieldProps } = validation;
  const isVertexAI = isVertexAIProvider(values.provider);

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

  // A stored credential is bound to its provider.
  const providerLocked = mode === 'edit';
  let providerDescription = providerOption?.description;
  if (providerLocked) {
    providerDescription =
      'It cannot be changed: the stored key is this provider’s. For another provider, add a model.';
  } else if (isVertexAI) {
    providerDescription =
      'Calls use Google Vertex AI through the platform credential provider. LLM gateway usage and spend are not available yet.';
  } else if (routed) {
    providerDescription =
      'Calls go through the platform’s LLM gateway, which passes your key on and counts the usage for your organization.';
  }

  return (
    <>
      {routed ? (
        <Card>
          <CardBody>
            <SectionHeader
              variant="title-x-small"
              title="Name"
              description="People creating agents in the organization see the model under this name."
            />
            {mode === 'create' ? (
              <TextField
                label="Name"
                isRequired
                value={values.name}
                onChange={name => onChange({ name })}
                placeholder="e.g. claude-sonnet"
                description="Lowercase letters, numbers and hyphens. It cannot be changed once the model exists."
                {...textFieldProps('name', errors.name)}
              />
            ) : (
              <Text as="p" style={{ overflowWrap: 'anywhere' }}>
                <code>{values.name}</code>. It cannot be changed.
              </Text>
            )}
          </CardBody>
        </Card>
      ) : (
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
      )}

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
              options={providerOptions.map(option => ({
                id: option.id,
                label: option.label,
              }))}
              selectedKey={values.provider}
              isDisabled={providerLocked}
              onSelectionChange={key => {
                if (key) {
                  onChange({
                    provider: String(key) as ModelConfigFormValues['provider'],
                  });
                }
              }}
              description={providerDescription}
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
                label="Google Cloud project"
                value={values.projectID}
                onChange={projectID => onChange({ projectID })}
                description={
                  mode === 'edit'
                    ? 'The project belongs to the existing credential. Add another model to use a different project.'
                    : 'The project that owns the service-account key you will upload.'
                }
                isDisabled={mode === 'edit'}
                {...textFieldProps('projectID', errors.projectID)}
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

      {values.provider !== 'Ollama' && (
        <Card>
          <CardBody>
            <SectionHeader
              variant="title-x-small"
              title="Credential"
              description="Entered on the credential form and never shown again."
            />
            {mode === 'create' && values.provider === 'OpenAI' && (
              <Switch
                label="Endpoint requires no credential"
                isSelected={values.noCredential}
                onChange={noCredential => onChange({ noCredential })}
              />
            )}
            {values.noCredential ? (
              <Text>This endpoint is used without a credential.</Text>
            ) : null}
            {!values.noCredential && mode === 'create' && (
              <Text>
                You enter the credential on the next page, the credential form,
                once you continue.
              </Text>
            )}
            {!values.noCredential && mode === 'edit' && (
              <Switch
                label="Enter a new key on the next page"
                isSelected={replaceKey}
                onChange={selected => onReplaceKeyChange?.(selected)}
              />
            )}
            {mode === 'edit' && (
              <Text
                as="p"
                variant="body-small"
                color="secondary"
                style={{ marginTop: 'var(--bui-space-1)' }}
              >
                Leave it off to keep the current key. A new key replaces it once
                you save it on the credential form, for every model, connector
                or egress policy that uses the same credential.
              </Text>
            )}
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
      {((mode === 'create' && !routed) || hasEndpoint) && (
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
