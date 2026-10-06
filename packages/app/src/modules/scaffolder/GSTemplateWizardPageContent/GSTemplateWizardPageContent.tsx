import { useCallback, useEffect, useRef, type ComponentType } from 'react';
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
import {
  Content,
  InfoCard,
  MarkdownContent,
  Progress,
} from '@backstage/core-components';
import {
  errorApiRef,
  useApi,
  useRouteRef,
  useRouteRefParams,
} from '@backstage/core-plugin-api';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Alert, Flex, Text } from '@backstage/ui';
import { useStartTemplateTask } from '@giantswarm/backstage-plugin-gs';
import { isSessionExpiredError } from '@giantswarm/backstage-plugin-muster';

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
export function GSTemplateWizardPageContent(props: {
  extensions: FieldExtensionOptions<any, any>[];
  layouts?: LayoutOptions[];
  components?: { ReviewStepComponent?: ComponentType<ReviewStepProps> };
}) {
  const { t } = useTranslationRef(scaffolderReactTranslationRef);
  const styles = useStyles();
  const rootRef = useRouteRef(scaffolderPlugin.routes.root);
  const taskRoute = useRouteRef(scaffolderPlugin.routes.ongoingTask);
  const { namespace, templateName } = useRouteRefParams(
    scaffolderPlugin.routes.selectedTemplate,
  );
  const errorApi = useApi(errorApiRef);
  const navigate = useNavigate();

  const templateRef = stringifyEntityRef({
    kind: 'Template',
    namespace,
    name: templateName,
  });
  const { loading, manifest, error } = useTemplateParameterSchema(templateRef);
  const sortedManifest = useFilteredSchemaProperties(manifest);
  const startTask = useStartTemplateTask(templateRef, sortedManifest);
  const { mutateAsync: start } = startTask;

  useEffect(() => {
    if (error) {
      errorApi.post(new Error(`Failed to load template, ${error}`));
    }
  }, [error, errorApi]);

  const onCreate = useCallback(
    async (formState: Record<string, JsonValue>) => {
      let taskId: string;
      try {
        ({ taskId } = await start(formState));
      } catch {
        // Shown from the mutation's error, with the entries kept.
        return;
      }
      navigate(taskRoute({ taskId }));
    },
    [start, navigate, taskRoute],
  );

  if (error) {
    return <Navigate to={rootRef()} />;
  }

  return (
    <>
      {startTask.isPending && <Progress />}
      {startTask.error && <CreateErrorAlert error={startTask.error} />}
      <Content>
        {loading && <Progress />}
        {sortedManifest && (
          <InfoCard
            title={sortedManifest.title}
            subheader={
              <MarkdownContent
                className={styles.markdown}
                linkTarget="_blank"
                content={
                  sortedManifest.description ?? t('workflow.noDescription')
                }
              />
            }
            noPadding
            titleTypographyProps={{ component: 'h2' }}
          >
            <Stepper
              manifest={sortedManifest}
              onCreate={onCreate}
              extensions={props.extensions}
              layouts={props.layouts}
              components={props.components}
            />
          </InfoCard>
        )}
      </Content>
    </>
  );
}

/**
 * A sign-in that did not complete when Create asked for it: the portal session
 * expired, or the person declined an installation's Login Required prompt or
 * closed its popup.
 */
function isSignInFailure(error: Error): boolean {
  return (
    isSessionExpiredError(error) ||
    error.name === 'RejectedError' ||
    /login failed, popup was closed/i.test(error.message)
  );
}

function CreateErrorAlert(props: { error: Error }) {
  const { error } = props;
  const signIn = isSignInFailure(error);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [error]);

  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      role="alert"
      status={signIn ? 'warning' : 'danger'}
      icon
      mx="6"
      title={signIn ? 'Your sign-in expired' : "Couldn't start the template"}
      description={
        <Flex direction="column" align="start" gap="2">
          <Text as="p" variant="body-small">
            {signIn
              ? 'Nothing was created and your entries are kept. Select Create to sign in again and create it.'
              : 'Nothing was created and your entries are kept. Select Create to try again.'}
          </Text>
          {!signIn && (
            <details>
              <summary>Details</summary>
              <Text as="p" variant="body-small">
                {error.message}
              </Text>
            </details>
          )}
        </Flex>
      }
    />
  );
}
