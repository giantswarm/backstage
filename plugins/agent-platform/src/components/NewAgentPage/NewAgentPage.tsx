import { useEffect, useRef, useState } from 'react';
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

import { newAgentReviewRouteRef, rootRouteRef } from '../../routes';
import { useAgentChart } from '../../hooks/useAgentChart';
import { useNewAgentForm } from '../NewAgentFormProvider';
import { ModelConfigsProvider } from '../ModelConfigsProvider';
import { InstallationSelect } from '../InstallationSelect';
import { ModelConfigPicker } from '../ModelConfigPicker';
import { SkillPicker } from '../SkillPicker';
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
    validationErrors,
  } = useNewAgentForm();

  // Show validation feedback only once the user has tried to proceed, so the
  // form doesn't shout about empty fields before they've done anything.
  const [showValidation, setShowValidation] = useState(false);

  // Seed the system prompt from the chart's default the first time it resolves,
  // and only while the field is still untouched — a ref makes this a one-shot so
  // it never fights the user's edits or loops.
  const { defaultSystemMessage, isLoading: isChartLoading } = useAgentChart();
  const seededPrompt = useRef(false);
  useEffect(() => {
    if (!seededPrompt.current && defaultSystemMessage) {
      seededPrompt.current = true;
      if (!state.systemMessage) {
        setSystemMessage(defaultSystemMessage);
      }
    }
    // Runs once when defaultSystemMessage first becomes available; the ref guards
    // re-entry, so state.systemMessage is intentionally read but not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSystemMessage]);

  // The submit button stays enabled: clicking it with an invalid form surfaces
  // what's wrong (below) rather than silently doing nothing.
  const onReview = () => {
    if (validationErrors.length > 0) {
      setShowValidation(true);
      return;
    }
    if (reviewLink) {
      navigate(reviewLink());
    }
  };

  const actions = (
    <Flex gap="2">
      <Button
        variant="tertiary"
        onPress={() => rootLink && navigate(rootLink())}
      >
        Cancel
      </Button>
      <Button variant="primary" onPress={onReview}>
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
                  description="What powers the agent and shapes how it behaves: where it runs, which model it uses, its system prompt, and its skills."
                />
                <Flex direction="column" gap="5">
                  <TextAreaField
                    label="System prompt"
                    secondaryLabel="optional"
                    value={state.systemMessage}
                    onChange={setSystemMessage}
                    rows={10}
                    mono
                    placeholder={
                      isChartLoading
                        ? 'Loading the chart default…'
                        : "Leave empty to use the chart's default prompt."
                    }
                    description="The agent's system message. Pre-filled from the chart's default — edit it to fit the role, or leave it empty to keep the default."
                  />
                  <InstallationSelect />
                  <ModelConfigPicker />
                  <SkillPicker />
                </Flex>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Flex direction="column" gap="3">
                  <Text as="p" color="secondary" className={classes.footerNote}>
                    The next step composes the Helm values and manifests so you
                    can review them before the agent is deployed.
                  </Text>
                  {showValidation && validationErrors.length > 0 && (
                    <Alert
                      status="danger"
                      title="Please fix the following before continuing"
                      description={validationErrors.join('. ')}
                    />
                  )}
                  {actions}
                </Flex>
              </CardBody>
            </Card>
          </Flex>
        </div>
      </Content>
    </>
  );
}
