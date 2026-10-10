import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  Grid,
  Text,
  TextField,
} from '@backstage/ui';
import {
  SectionHeader,
  useProvidePageHeaderActions,
  WizardStepHeading,
} from '@giantswarm/backstage-plugin-ui-react';

import { newAgentSkillsRouteRef, newAgentToolsRouteRef } from '../../routes';
import { useSkillCatalog } from '../../hooks/useSkillCatalog';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { CreateAgentAssist } from '../CreateAgentAssist';
import { AgentAvatarPreview } from '../AgentAvatarPreview';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { InstallationSelect } from '../InstallationSelect';
import { ModelConfigPicker } from '../ModelConfigPicker';
import { HarnessPicker } from '../HarnessPicker';
import { AgentWizardFrame } from '../AgentWizardFrame';
import { TextAreaField } from './TextAreaField';
import { egressProblem, parseEgressText } from '../../lib/egress';
import {
  MAX_SYSTEM_MESSAGE_LENGTH,
  systemMessageProblem,
} from '../../lib/systemMessage';

export function NewAgentPage() {
  return (
    <ModelConfigsProvider>
      <NewAgentPageContent />
    </ModelConfigsProvider>
  );
}

function NewAgentPageContent() {
  const navigate = useNavigate();
  const skillsLink = useRouteRef(newAgentSkillsRouteRef);
  const toolsLink = useRouteRef(newAgentToolsRouteRef);
  // Called here for two reasons beyond this page's own rendering: it starts the
  // (backend, git-tree-walking) skill discovery while the user is still filling
  // in this form, so step 2 usually has its catalogue ready instead of showing
  // "Discovering skills…"; and `hasRepositories` decides whether step 2 exists
  // at all. The query key doesn't depend on any form state, so the warm-up is
  // never wasted, and it doesn't fire when no repositories are configured.
  const { hasRepositories } = useSkillCatalog();
  const {
    state,
    setName,
    setSlug,
    setDescription,
    setSystemMessage,
    setEgressText,
    validationErrors,
  } = useNewAgentForm();

  // Show validation feedback only once the user has tried to proceed, so the
  // form doesn't shout about empty fields before they've done anything.
  const [showValidation, setShowValidation] = useState(false);

  // The submit button stays enabled: clicking it with an invalid form surfaces
  // what's wrong (below) rather than silently doing nothing.
  const errorCount = validationErrors.length;
  // Skip the skills step when no repositories are configured — it would be an
  // empty page whose only advice is admin-side app-config the person creating
  // an agent usually can't change. The Tools step always exists: every agent
  // declares a toolset.
  const nextLink = hasRepositories ? skillsLink : toolsLink;
  const onContinue = useCallback(() => {
    if (errorCount > 0) {
      setShowValidation(true);
      return;
    }
    if (nextLink) {
      navigate(nextLink());
    }
  }, [errorCount, nextLink, navigate]);

  // Memoized so the frame's footer slot only updates when the handlers actually
  // change, not on every keystroke in the form (see useProvidePageHeaderActions).
  // Cancel belongs to the frame's footer, so only the primary lives here.
  const actions = useMemo(
    () => (
      <Button variant="primary" onPress={onContinue}>
        Continue
      </Button>
    ),
    [onContinue],
  );

  useProvidePageHeaderActions(actions);

  return (
    <AgentWizardFrame step="details">
      <WizardStepHeading title="Create an agent">
        Create an agent for you and your team mates to re-use for certain types
        of tasks.
      </WizardStepHeading>

      {/* The "with Swarm Operator" assist (W6): renders nothing unless the
          agentManagement meta-agent role resolves — see CreateAgentAssist. */}
      <CreateAgentAssist />

      <InstallationSelect />

      <Card>
        <CardBody>
          <SectionHeader
            title="Identity"
            description="How this agent appears across the platform."
          />
          <Flex direction="column" gap="4">
            <Flex align="start" gap="4">
              <AgentAvatarPreview />
              <Grid.Root
                columns={{ initial: '1', sm: '2' }}
                gap="4"
                style={{ flex: 1 }}
              >
                <Grid.Item>
                  <TextField
                    label="Name"
                    isRequired
                    value={state.name}
                    onChange={setName}
                    placeholder="e.g. Go service reviewer"
                    description="The user-friendly name humans will use to refer to this agent."
                  />
                </Grid.Item>
                <Grid.Item>
                  <TextField
                    label="Slug"
                    secondaryLabel="auto-derived"
                    isRequired
                    value={state.slug}
                    onChange={setSlug}
                    placeholder="go-service-reviewer"
                    description="URL-friendly identifier used in links and resource names."
                  />
                </Grid.Item>
              </Grid.Root>
            </Flex>
            <TextAreaField
              label="Description"
              value={state.description}
              onChange={setDescription}
              rows={4}
              placeholder="What this agent is good at, what it's not for, example tasks…"
              description="Describe this agent so team mates know what to use it for."
            />
          </Flex>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionHeader
            title="Configuration"
            description="What powers the agent and shapes how it behaves: its system prompt, the model it uses and what runs it."
          />
          <Flex direction="column" gap="5">
            <TextAreaField
              label="System prompt"
              secondaryLabel="optional"
              value={state.systemMessage}
              onChange={setSystemMessage}
              rows={10}
              mono
              placeholder="Leave empty to use the chart's default prompt."
              description="The agent's system message. Write one to fit the role, or leave it empty: agent-manager then keeps the chart's default prompt. Put long reference material in a skill; the prompt is limited in length."
              maxLength={MAX_SYSTEM_MESSAGE_LENGTH}
              error={systemMessageProblem(state.systemMessage)}
            />
            <ModelConfigPicker />
            <HarnessPicker />
            <TextAreaField
              label="Extra egress origins"
              secondaryLabel="optional"
              value={state.egressText}
              onChange={setEgressText}
              rows={3}
              mono
              placeholder={
                'https://github.com:443\nhttps://*.githubusercontent.com'
              }
              description="Hosts the agent may reach beyond what it already has: its model, its connectors, its skill and plugin sources and telemetry need no entry. One http(s) origin per line; a leading * matches one host label."
              error={egressProblem(parseEgressText(state.egressText))}
            />
          </Flex>
        </CardBody>
      </Card>

      <Flex direction="column" gap="3">
        <Text as="p" color="secondary">
          {hasRepositories
            ? 'The next steps let you pick skills and the tools for this agent, then review and deploy it.'
            : 'The next step chooses the tools for this agent; then you review and deploy it.'}
        </Text>
        {showValidation && validationErrors.length > 0 && (
          <Alert
            status="danger"
            title="Please fix the following before continuing"
            description={validationErrors.join('. ')}
          />
        )}
      </Flex>
    </AgentWizardFrame>
  );
}
