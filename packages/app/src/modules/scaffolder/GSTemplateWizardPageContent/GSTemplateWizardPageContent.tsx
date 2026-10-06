import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import type { JsonValue } from '@backstage/types';
import { useNavigate, Navigate } from 'react-router-dom';
import scaffolderPlugin from '@backstage/plugin-scaffolder/alpha';
import {
  type FieldExtensionOptions,
  type LayoutOptions,
  type ReviewStepProps,
  scaffolderApiRef,
  useTemplateSecrets,
} from '@backstage/plugin-scaffolder-react';
import { Workflow } from '@backstage/plugin-scaffolder-react/alpha';
import { Progress } from '@backstage/core-components';
import {
  useApi,
  useRouteRef,
  useRouteRefParams,
} from '@backstage/core-plugin-api';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { useRefreshTemplateSecrets } from '@giantswarm/backstage-plugin-gs';
import { isSessionExpiredError } from '@giantswarm/backstage-plugin-muster';

// Replaces the internal TemplateWizardPageContent using public APIs only,
// built on Workflow from @backstage/plugin-scaffolder-react/alpha.
export function GSTemplateWizardPageContent(props: {
  extensions: FieldExtensionOptions<any, any>[];
  layouts?: LayoutOptions[];
  components?: { ReviewStepComponent?: ComponentType<ReviewStepProps> };
}) {
  const rootRef = useRouteRef(scaffolderPlugin.routes.root);
  const taskRoute = useRouteRef(scaffolderPlugin.routes.ongoingTask);
  const { namespace, templateName } = useRouteRefParams(
    scaffolderPlugin.routes.selectedTemplate,
  );
  const scaffolderApi = useApi(scaffolderApiRef);
  const { secrets } = useTemplateSecrets();
  const refreshSecrets = useRefreshTemplateSecrets();
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<CreateError>();

  const templateRef = stringifyEntityRef({
    kind: 'Template',
    namespace,
    name: templateName,
  });

  const onCreate = useCallback(
    async (formState: Record<string, JsonValue>) => {
      if (isCreating) return;
      setIsCreating(true);
      setCreateError(undefined);
      try {
        const freshSecrets = await refreshSecrets();
        const { taskId } = await scaffolderApi.scaffold({
          templateRef,
          values: formState,
          secrets: { ...secrets, ...freshSecrets },
        });
        navigate(taskRoute({ taskId }));
      } catch (error) {
        setCreateError({
          sessionExpired: isSessionExpiredError(error),
          message: error instanceof Error ? error.message : String(error),
          formState,
        });
      } finally {
        setIsCreating(false);
      }
    },
    [
      isCreating,
      refreshSecrets,
      scaffolderApi,
      templateRef,
      secrets,
      navigate,
      taskRoute,
    ],
  );

  const onError = useCallback(() => <Navigate to={rootRef()} />, [rootRef]);

  return (
    <>
      {isCreating && <Progress />}
      {createError && (
        <CreateErrorAlert
          error={createError}
          isRetrying={isCreating}
          onRetry={() => onCreate(createError.formState)}
        />
      )}
      <Workflow
        namespace={namespace}
        templateName={templateName}
        onCreate={onCreate}
        onError={onError}
        extensions={props.extensions}
        layouts={props.layouts}
        components={props.components}
      />
    </>
  );
}

type CreateError = {
  sessionExpired: boolean;
  message: string;
  formState: Record<string, JsonValue>;
};

function CreateErrorAlert(props: {
  error: CreateError;
  isRetrying: boolean;
  onRetry: () => void;
}) {
  const { error, isRetrying, onRetry } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [error]);

  // The action sits under the text rather than in `customActions`, whose row
  // layout squeezes the text to a sliver on narrow screens.
  return (
    <Alert
      ref={ref}
      tabIndex={-1}
      role="alert"
      status={error.sessionExpired ? 'warning' : 'danger'}
      icon
      mx="6"
      title={
        error.sessionExpired
          ? 'Your sign-in expired'
          : "Couldn't start the template"
      }
      description={
        <Flex direction="column" align="start" gap="2">
          <Text as="p" variant="body-small">
            {error.sessionExpired
              ? 'Nothing was created and your entries are kept. Sign in again to create it.'
              : 'Nothing was created and your entries are kept.'}
          </Text>
          {!error.sessionExpired && (
            <details>
              <summary>Details</summary>
              <Text as="p" variant="body-small">
                {error.message}
              </Text>
            </details>
          )}
          <Button size="small" isPending={isRetrying} onPress={onRetry}>
            {error.sessionExpired ? 'Sign in and create' : 'Try again'}
          </Button>
        </Flex>
      }
    />
  );
}
