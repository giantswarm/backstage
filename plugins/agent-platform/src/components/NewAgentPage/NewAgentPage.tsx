import { useNavigate } from 'react-router-dom';
import { Content } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Flex,
  Grid,
  PluginHeader,
  Text,
  TextField,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import AndroidIcon from '@material-ui/icons/Android';

import { DEFAULT_SYSTEM_PROMPT } from '../../lib/agentDefaults';
import { newAgentReviewRouteRef, rootRouteRef } from '../../routes';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { InstallationSelect } from '../InstallationSelect';
import { ModelConfigPicker } from '../ModelConfigPicker';
import { TextAreaField } from './TextAreaField';

const useStyles = makeStyles(theme => ({
  column: {
    maxWidth: 960,
  },
  pageTitle: {
    marginBottom: theme.spacing(1),
  },
  intro: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    marginBottom: theme.spacing(0.5),
  },
  sectionDescription: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(3),
  },
  footerNote: {
    maxWidth: '70ch',
    marginBottom: theme.spacing(2),
  },
}));

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const classes = useStyles();
  return (
    <div>
      <Text
        as="h3"
        variant="title-small"
        weight="bold"
        className={classes.sectionTitle}
      >
        {title}
      </Text>
      <Text as="p" color="secondary" className={classes.sectionDescription}>
        {description}
      </Text>
    </div>
  );
}

export function NewAgentPage() {
  return (
    <ModelConfigsProvider>
      <NewAgentPageContent />
    </ModelConfigsProvider>
  );
}

function NewAgentPageContent() {
  const classes = useStyles();
  const navigate = useNavigate();
  const rootLink = useRouteRef(rootRouteRef);
  const reviewLink = useRouteRef(newAgentReviewRouteRef);
  const {
    state,
    setName,
    setSlug,
    setDescription,
    setSystemMessage,
    isComplete,
  } = useNewAgentForm();

  const actions = (
    <Flex gap="2">
      <Button
        variant="tertiary"
        onPress={() => rootLink && navigate(rootLink())}
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        isDisabled={!isComplete}
        onPress={() => reviewLink && navigate(reviewLink())}
      >
        Review & deploy
      </Button>
    </Flex>
  );

  return (
    <>
      <PluginHeader
        icon={<AndroidIcon fontSize="inherit" />}
        title="Agents"
        customActions={actions}
      />
      <Content>
        <div className={classes.column}>
          <Text
            as="h2"
            variant="title-large"
            weight="bold"
            className={classes.pageTitle}
          >
            Create an agent
          </Text>
          <Text as="p" className={classes.intro}>
            Create an agent for you and your team mates to re-use for certain
            types of tasks.
          </Text>

          <Flex direction="column" gap="4">
            <Card>
              <CardBody>
                <SectionHeader
                  title="Identity"
                  description="How this agent appears across the platform."
                />
                <Flex direction="column" gap="4">
                  <Grid.Root columns={{ initial: '1', sm: '2' }} gap="4">
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
                  description="What powers the agent and shapes how it behaves: where it runs, which model it uses, its system prompt, and (soon) its skills."
                />
                <Flex direction="column" gap="5">
                  <InstallationSelect />
                  <ModelConfigPicker />
                  <TextAreaField
                    label="System prompt"
                    value={state.systemMessage}
                    onChange={setSystemMessage}
                    rows={10}
                    mono
                    description="The agent's system message. Starts from the general-purpose default — edit it to fit the role."
                  />
                  <Alert
                    status="info"
                    title="Skills — coming soon"
                    description="Skills let an agent reuse packaged instructions for specific kinds of tasks. You'll be able to add them here in a later release; new agents start without any."
                  />
                </Flex>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Text as="p" color="secondary" className={classes.footerNote}>
                  The next step composes the Helm values and manifests, and
                  opens them as a pull request for review before anything is
                  deployed.
                </Text>
                {actions}
              </CardBody>
            </Card>
          </Flex>
        </div>
      </Content>
    </>
  );
}

// Re-exported for convenience in tests / stories.
export { DEFAULT_SYSTEM_PROMPT };
