import { useEffect } from 'react';
import { Alert, Card, CardBody, Flex, Select } from '@backstage/ui';
import { CircularProgress } from '@material-ui/core';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import { useInstallations } from '@giantswarm/backstage-plugin-gs';

import { useNewAgentForm } from '../NewAgentFormProvider';
import { useModelConfigs } from '../ModelConfigsProvider';
import { UnreachableInstallationsAlert } from '../UnreachableInstallationsAlert';

const description =
  'The management cluster this agent runs on. Determines which models are available and where the agent is deployed.';

export function InstallationSelect() {
  const { state, setInstallation } = useNewAgentForm();
  const { installations } = useInstallations();
  const {
    isLoading,
    hasInstallations,
    availableInstallations,
    unreachableInstallations,
  } = useModelConfigs();

  // With only one installation configured for access, there's nothing to
  // choose — auto-select it and skip the field entirely rather than showing a
  // single-option dropdown. `installations` is empty while useInstallations()
  // is still loading, so this never fires on partial data.
  const singleInstallation =
    installations.length === 1 ? installations[0].name : undefined;

  useEffect(() => {
    if (singleInstallation && state.installation !== singleInstallation) {
      setInstallation(singleInstallation);
    }
  }, [singleInstallation, state.installation, setInstallation]);

  if (singleInstallation) {
    return null;
  }

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
        <Card>
          <CardBody>
            <SectionHeader title="Installation" description={description} />
            <Select
              label="Installation"
              isRequired
              isDisabled
              icon={<CircularProgress size={16} color="inherit" />}
              options={[]}
              placeholder="Finding installations with models…"
            />
          </CardBody>
        </Card>
      );
    }

    if (hasInstallations) {
      return (
        <Card>
          <CardBody>
            <SectionHeader title="Installation" description={description} />
            <Flex direction="column" gap="2">
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
          </CardBody>
        </Card>
      );
    }
  }

  return (
    <Card>
      <CardBody>
        <SectionHeader title="Installation" description={description} />
        <Flex direction="column" gap="2">
          <Select
            label="Installation"
            secondaryLabel={isLoading ? 'still checking…' : undefined}
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
      </CardBody>
    </Card>
  );
}
