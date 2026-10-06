import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
} from 'react';
import type { JsonValue } from '@backstage/types';
import { useNavigate, Navigate } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import {
  type FieldExtensionOptions,
  type LayoutOptions,
  type ReviewStepProps,
  scaffolderReactTranslationRef,
} from '@backstage/plugin-scaffolder-react';
import {
  Stepper,
  useFilteredSchemaProperties,
  useTemplateParameterSchema,
} from '@backstage/plugin-scaffolder-react/alpha';
import { MarkdownContent, Progress } from '@backstage/core-components';
import {
  errorApiRef,
  useApi,
  useRouteRef,
  useRouteRefParams,
} from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  Alert,
  Card,
  CardBody,
  CardHeader,
  Container,
  Flex,
  Text,
} from '@backstage/ui';
import {
  TemplateSignInError,
  useStartTemplateTask,
} from '@giantswarm/backstage-plugin-gs';

const useStyles = makeStyles({
  markdown: {
    '& :first-child': { marginTop: 0 },
    '& :last-child': { marginBottom: 0 },
  },
});

// Replaces the internal TemplateWizardPageContent using public APIs only.
// Upstream's Workflow is not used: it reports a created task whenever
// `onCreate` resolves, and `Stepper` leaves a rejection unhandled, so a failed
// submit would be either counted as created or raised as an app-wide error.
type WizardProps = {
  extensions: FieldExtensionOptions<any, any>[];
  layouts?: LayoutOptions[];
  components: { ReviewStepComponent: ComponentType<ReviewStepProps> };
};

export function GSTemplateWizardPageContent(props: WizardProps) {
  const { namespace, templateName } = useRouteRefParams(
    scaffolderPlugin.routes.selectedTemplate,
  );
  const templateRef = stringifyEntityRef({
    kind: 'Template',
    namespace,
    name: templateName,
  });
  // React Router reuses this element when only the template changes; the key
  // keeps one template's entries and failed Create out of the next one.
  return (
    <TemplateWizard key={templateRef} templateRef={templateRef} {...props} />
  );
}

type CreateState = {
  ReviewStepComponent: ComponentType<ReviewStepProps>;
  isPending: boolean;
  error: Error | null;
  reset: () => void;
};

const CreateStateContext = createContext<CreateState | undefined>(undefined);

function TemplateWizard(props: WizardProps & { templateRef: string }) {
  const { templateRef } = props;
  const { t } = useTranslationRef(scaffolderReactTranslationRef);
  const styles = useStyles();
  const rootRef = useRouteRef(scaffolderPlugin.routes.root);
  const taskRoute = useRouteRef(scaffolderPlugin.routes.ongoingTask);
  const errorApi = useApi(errorApiRef);
  const navigate = useNavigate();

  const { loading, manifest, error } = useTemplateParameterSchema(templateRef);
  const sortedManifest = useFilteredSchemaProperties(manifest);
  const startTask = useStartTemplateTask(templateRef);
  const { mutateAsync: start, isPending, reset } = startTask;
  // Set synchronously, so a second click before the re-render that disables
  // Create does not start a second task.
  const creating = useRef(false);

  useEffect(() => {
    if (error) {
      errorApi.post(new Error(`Failed to load template, ${error}`));
    }
  }, [error, errorApi]);

  const onCreate = useCallback(
    async (formState: Record<string, JsonValue>) => {
      if (creating.current) {
        return;
      }
      creating.current = true;
      let taskId: string;
      try {
        ({ taskId } = await start(formState));
      } catch {
        // Shown on the review step from the mutation's error.
        return;
      } finally {
        creating.current = false;
      }
      navigate(taskRoute({ taskId }));
    },
    [start, navigate, taskRoute],
  );

  const createState = useMemo<CreateState>(
    () => ({
      ReviewStepComponent: props.components.ReviewStepComponent,
      isPending,
      error: startTask.error,
      reset,
    }),
    [props.components.ReviewStepComponent, isPending, startTask.error, reset],
  );

  if (error) {
    return <Navigate to={rootRef()} />;
  }

  return (
    <CreateStateContext.Provider value={createState}>
      {isPending && <Progress />}
      <Container py="6">
        {loading && <Progress />}
        {sortedManifest && (
          <Card>
            <CardHeader>
              <Flex direction="column" gap="2">
                <Text as="h2" variant="title-small" weight="bold">
                  {sortedManifest.title}
                </Text>
                <MarkdownContent
                  className={styles.markdown}
                  linkTarget="_blank"
                  content={
                    sortedManifest.description ?? t('workflow.noDescription')
                  }
                />
              </Flex>
            </CardHeader>
            <CardBody>
              <Stepper
                manifest={sortedManifest}
                onCreate={onCreate}
                extensions={props.extensions}
                layouts={props.layouts}
                components={{ ReviewStepComponent: CreateReviewStep }}
              />
            </CardBody>
          </Card>
        )}
      </Container>
    </CreateStateContext.Provider>
  );
}

/**
 * The template's review step, with Create disabled while a submit is under
 * way and a failed Create's alert above it. Leaving the step clears the alert.
 */
function CreateReviewStep(props: ReviewStepProps) {
  const state = useContext(CreateStateContext);
  if (!state) {
    throw new Error('CreateReviewStep is rendered outside TemplateWizard');
  }
  const { ReviewStepComponent, isPending, error, reset } = state;

  useEffect(() => reset, [reset]);

  return (
    <Flex direction="column" gap="4">
      {error && <CreateErrorAlert error={error} />}
      <ReviewStepComponent
        {...props}
        disableButtons={props.disableButtons || isPending}
      />
    </Flex>
  );
}

function errorCopy(error: Error): {
  status: 'warning' | 'danger';
  title: string;
  text: string;
  details?: string;
} {
  if (error instanceof TemplateSignInError) {
    if (error.reason === 'session-expired') {
      return {
        status: 'warning',
        title: 'Your sign-in expired',
        text: 'Nothing was created and your entries are kept. Select Create to sign in again and create it.',
      };
    }
    return {
      status: 'warning',
      title: 'Sign-in needed',
      text: `This template needs you to sign in to ${error.installations.join(
        ', ',
      )}. Nothing was created and your entries are kept. Select Create and complete the sign-in.`,
    };
  }
  return {
    status: 'danger',
    title: "Couldn't start the template",
    text: 'Nothing was created and your entries are kept. Select Create to try again.',
    details: error.message,
  };
}

function CreateErrorAlert(props: { error: Error }) {
  const { error } = props;
  const { status, title, text, details } = errorCopy(error);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [error]);

  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      role="alert"
      status={status}
      icon
      title={title}
      description={
        <Flex direction="column" align="start" gap="2">
          <Text as="p" variant="body-small">
            {text}
          </Text>
          {details && (
            <details>
              <summary>Details</summary>
              <Text as="p" variant="body-small">
                {details}
              </Text>
            </details>
          )}
        </Flex>
      }
    />
  );
}
