import {
  Card,
  CardBody,
  Flex,
  Grid,
  Select,
  Switch,
  TextField,
} from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';

import {
  MODEL_PROVIDER_OPTIONS,
  ModelConfigFormValues,
  PROVIDER_SECRET_KEYS,
  providerHasEndpoint,
} from '../../lib/modelConfigs';
import { SecretTextField } from './SecretTextField';

export type ModelConfigFormFieldsProps = {
  values: ModelConfigFormValues;
  onChange: (patch: Partial<ModelConfigFormValues>) => void;
  mode: 'create' | 'edit';
  /** Render every field disabled (tool-owned CR, or no write permission). */
  isReadOnly?: boolean;
};

/**
 * The fields shared by the create and edit forms. Pure presentation: values
 * and validation live with the page (validation errors surface as one alert
 * on submit, the same pattern as the agent create form).
 */
export function ModelConfigFormFields({
  values,
  onChange,
  mode,
  isReadOnly = false,
}: ModelConfigFormFieldsProps) {
  const providerOption = MODEL_PROVIDER_OPTIONS.find(
    option => option.id === values.provider,
  );
  const hasEndpoint = providerHasEndpoint(values.provider);
  const needsKey = Boolean(PROVIDER_SECRET_KEYS[values.provider]);
  const isOllama = values.provider === 'Ollama';

  return (
    <>
      <Card>
        <CardBody>
          <SectionHeader
            title="Identity"
            description="How this model appears to people creating agents."
          />
          <Grid.Root columns={{ initial: '1', sm: '2' }} gap="4">
            <Grid.Item>
              <TextField
                label="Name"
                isRequired
                isDisabled={isReadOnly || mode === 'edit'}
                value={values.name}
                onChange={name => onChange({ name })}
                placeholder="e.g. qwen3-vllm"
                description={
                  mode === 'edit'
                    ? 'The resource name cannot be changed after creation.'
                    : 'Lowercase identifier used as the resource name (and in the key Secret’s name).'
                }
              />
            </Grid.Item>
            <Grid.Item>
              <TextField
                label="Display name"
                secondaryLabel="optional"
                isDisabled={isReadOnly}
                value={values.displayName}
                onChange={displayName => onChange({ displayName })}
                placeholder="e.g. Qwen 3 (lab vLLM)"
                description="Friendly name shown in the model picker. Falls back to the name."
              />
            </Grid.Item>
          </Grid.Root>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionHeader
            title="Provider & model"
            description="Where the model runs and which model to request there."
          />
          <Flex direction="column" gap="4">
            <Grid.Root columns={{ initial: '1', sm: '2' }} gap="4">
              <Grid.Item>
                <Select
                  label="Provider"
                  isRequired
                  isDisabled={isReadOnly}
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
              </Grid.Item>
              <Grid.Item>
                <TextField
                  label="Model"
                  isRequired
                  isDisabled={isReadOnly}
                  value={values.model}
                  onChange={model => onChange({ model })}
                  placeholder={
                    isOllama ? 'e.g. qwen3:8b' : 'e.g. claude-sonnet-4-6'
                  }
                  description="The model id, as the provider names it."
                />
              </Grid.Item>
            </Grid.Root>

            {hasEndpoint && (
              <TextField
                label={isOllama ? 'Host' : 'Base URL'}
                secondaryLabel={isOllama ? undefined : 'optional'}
                isRequired={isOllama}
                isDisabled={isReadOnly}
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
              />
            )}

            {hasEndpoint && (
              <Switch
                label="Skip TLS certificate verification (for endpoints with self-signed certificates)"
                isDisabled={isReadOnly}
                isSelected={values.insecureSkipTlsVerify}
                onChange={insecureSkipTlsVerify =>
                  onChange({ insecureSkipTlsVerify })
                }
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
            <Flex direction="column" gap="4">
              {!values.keyless && (
                <SecretTextField
                  label="API key"
                  isDisabled={isReadOnly}
                  value={values.apiKey}
                  onChange={apiKey => onChange({ apiKey })}
                  placeholder={
                    mode === 'edit' ? 'Leave empty to keep the current key' : ''
                  }
                  description={
                    mode === 'edit'
                      ? 'Enter a value only to replace the stored key.'
                      : 'The provider API key agents on this model authenticate with.'
                  }
                />
              )}
              <Switch
                label="This endpoint requires no API key"
                isDisabled={isReadOnly}
                isSelected={values.keyless}
                onChange={keyless => onChange({ keyless })}
              />
            </Flex>
          </CardBody>
        </Card>
      )}
    </>
  );
}
