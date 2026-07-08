import { Alert, Flex, Select, Text } from '@backstage/ui';
import { CircularProgress } from '@material-ui/core';

import { useNewAgentForm } from '../NewAgentFormProvider';
import { useModelConfigs } from '../ModelConfigsProvider';

export function InstallationSelect() {
  const { state, setInstallation } = useNewAgentForm();
  const { isLoading, hasInstallations, availableInstallations } =
    useModelConfigs();

  const description =
    'The management cluster this agent runs on. Determines which models are available and where the GitOps pull request lands.';

  // Installations resolve one by one across the fleet, so offer each as soon as
  // it responds rather than waiting for the slowest one. Only fall back to the
  // loading/empty states while nothing is available yet.
  if (availableInstallations.length === 0) {
    if (isLoading) {
      return (
        <Select
          label="Installation"
          description={description}
          isRequired
          isDisabled
          icon={<CircularProgress size={16} color="inherit" />}
          options={[]}
          placeholder="Finding installations with models…"
        />
      );
    }

    if (hasInstallations) {
      return (
        <Flex direction="column" gap="2">
          <Text weight="bold">Installation</Text>
          <Alert
            status="info"
            title="No installations with models"
            description="None of the configured installations have a kagent ModelConfig provisioned yet. A platform admin needs to add one before you can create an agent."
          />
        </Flex>
      );
    }
  }

  return (
    <Select
      label="Installation"
      secondaryLabel={isLoading ? 'still checking…' : undefined}
      description={description}
      isRequired
      options={availableInstallations.map(name => ({ id: name, label: name }))}
      selectedKey={state.installation ?? null}
      onSelectionChange={key => setInstallation(key ? String(key) : undefined)}
    />
  );
}
