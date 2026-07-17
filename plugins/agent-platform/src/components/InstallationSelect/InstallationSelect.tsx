import { Alert, Flex, Select, Text } from '@backstage/ui';
import { CircularProgress } from '@material-ui/core';

import { useNewAgentForm } from '../NewAgentFormProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

export function InstallationSelect() {
  const { state, setInstallation } = useNewAgentForm();
  const {
    isLoading,
    hasInstallations,
    availableInstallations,
    unreachableInstallations,
  } = useModelConfigs();

  const description =
    'The management cluster this agent runs on. Determines which models are available and where the agent is deployed.';

  const unreachableNote = (
    <UnreachableInstallationsAlert
      installations={unreachableInstallations}
      resourceName="ModelConfigs"
    />
  );

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
          {/* If every queried installation errored, the warning explains it;
              only claim "no models" when reads actually succeeded. */}
          {unreachableNote}
          {unreachableInstallations.length === 0 && (
            <Alert
              status="info"
              title="No installations with models"
              description="None of the reachable installations have a kagent ModelConfig provisioned yet. A platform admin needs to add one before you can create an agent."
            />
          )}
        </Flex>
      );
    }
  }

  return (
    <Flex direction="column" gap="2">
      <Select
        label="Installation"
        secondaryLabel={isLoading ? 'still checking…' : undefined}
        description={description}
        isRequired
        options={availableInstallations.map(name => ({
          id: name,
          label: name,
        }))}
        selectedKey={state.installation ?? null}
        onSelectionChange={key =>
          setInstallation(key ? String(key) : undefined)
        }
      />
      {unreachableNote}
    </Flex>
  );
}
