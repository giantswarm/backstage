import { useParams } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import { Alert, Flex } from '@backstage/ui';
import {
  ModelConfig,
  useResource,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  EmptyStateCard,
  LoadingIndicator,
  WizardFrame,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  isListenerRouted,
  LISTENER_PROVIDERS,
  MODEL_CONFIG_NAMESPACE,
  modelConfigEditOwner,
  modelConfigFormValues,
} from '../../lib/modelConfigs';
import type { OrganizationDirectory } from '../../lib/organizations';
import {
  organizationsUndecided,
  useOrganizationDirectory,
} from '../OrganizationDirectoryProvider';
import { useCustomizePaths } from '../../hooks/useCustomizePaths';
import { useCloseHref } from '../../hooks/useCloseHref';
import { NewModelPage } from '../NewModelPage';

/**
 * Why this model has no form, in the sentence the empty state gives — or
 * `undefined` when the portal may write it. The same three cases the detail
 * page withholds Edit for.
 */
function editBlocker(
  modelConfig: ModelConfig,
  mayUpdate: boolean,
  directory: OrganizationDirectory,
  /** Why it cannot be told whether the namespace is an organization's. */
  undecided?: string,
): string | undefined {
  // An organization's model must not be saved as the platform's.
  if (undecided && modelConfig.getNamespace() !== MODEL_CONFIG_NAMESPACE) {
    return `Could not tell whether this model belongs to an organization, whose models are saved through agent-manager. Try again once agent-manager answers. ${undecided}`;
  }
  // An organization's model agent-manager wrote is edited through it.
  const owner = modelConfigEditOwner(modelConfig, directory);
  if (owner) {
    return `This model is asserted by ${owner}, which would revert portal edits on its next run. Change it where ${owner} is configured.`;
  }
  if (!modelConfigFormValues(modelConfig)) {
    return `The edit form covers OpenAI-compatible, Anthropic, Gemini, Vertex AI and Ollama models, and this one uses ${modelConfig.getProvider()}. Manage it with kubectl.`;
  }
  const provider = modelConfig.getProvider();
  if (
    isListenerRouted(modelConfig.getNamespace() ?? '', directory) &&
    !LISTENER_PROVIDERS.some(offered => offered === provider)
  ) {
    return `An organization's models use Anthropic or OpenAI through the platform's LLM gateway, and this one uses ${provider}. Manage it with kubectl.`;
  }
  if (!mayUpdate) {
    return 'You do not have permission to change this model.';
  }
  return undefined;
}

/**
 * Edit a model (`/customize/models/<installation>/<namespace>/<name>/edit`):
 * the Connect-a-model flow, prefilled. Like `EditAgentPage` and
 * `EditSkillPage`, this page only reads what the flow needs — the ModelConfig,
 * and whether the signed-in person may update it — and then hands over to
 * `NewModelPage` in edit mode. A model the portal must not write (asserted by
 * Helm, Flux or another tool; a provider the form does not speak; no RBAC to
 * update it) gets no form, and the page says why.
 */
export function EditModelPage() {
  const { installation = '', namespace = '', name = '' } = useParams();
  const { modelDetail: modelDetailLink } = useCustomizePaths();
  const detailHref = modelDetailLink?.({ installation, namespace, name });
  const closeHref = useCloseHref(detailHref);

  const {
    resource: modelConfig,
    isLoading,
    errors,
  } = useResource(
    installation,
    ModelConfig,
    // We type against a single version (v1alpha3), so skip API discovery —
    // same reasoning as ModelConfigsProvider and the detail page.
    { name, namespace, enableDiscovery: false },
  );
  const { allowed: mayUpdate, isLoading: isCheckingPermission } =
    useSelfSubjectAccessReview(
      installation,
      {
        group: ModelConfig.group,
        resource: ModelConfig.plural,
        namespace,
        // Named, so a grant restricted via `resourceNames` answers accurately.
        name,
        verb: 'update',
      },
      { enabled: Boolean(modelConfig) },
    );

  // Which namespaces are organizations': the form saves an organization's
  // model through agent-manager, so it waits for the answer rather than
  // taking an organization's model for the platform's.
  const organizations = useOrganizationDirectory();
  const { directory, isLoading: isLoadingDirectory } = organizations;

  const shownName = modelConfig?.getDisplayName() || name;

  const backLink = detailHref ? (
    <Link to={detailHref}>Back to the model</Link>
  ) : undefined;

  let body;
  if (
    isLoading ||
    (modelConfig && (isCheckingPermission || isLoadingDirectory))
  ) {
    body = <LoadingIndicator label="Reading the model…" />;
  } else if (!modelConfig) {
    body =
      errors.length > 0 ? (
        <Flex direction="column" gap="3">
          <Alert
            status="danger"
            title="Could not read the model"
            description={`ModelConfig ${namespace}/${name} on ${installation} could not be read. It may have been deleted, or you may not have permission to read it.`}
          />
          {backLink}
        </Flex>
      ) : (
        <EmptyStateCard
          title="Model not found"
          description={`ModelConfig ${namespace}/${name} does not exist on ${installation}.`}
          actions={backLink}
        />
      );
  } else {
    const blocker = editBlocker(
      modelConfig,
      mayUpdate,
      directory,
      organizationsUndecided(organizations, installation),
    );
    if (!blocker) {
      return (
        <NewModelPage
          // A different model is a fresh form, never the previous one's state.
          key={`${installation}/${namespace}/${name}`}
          edit={{
            installation,
            modelConfig,
            detailHref: closeHref,
          }}
        />
      );
    }
    body = (
      <EmptyStateCard
        title="This model cannot be edited from here"
        description={blocker}
        actions={backLink}
      />
    );
  }

  return (
    // Named like the edit form it hands over to, so neither the document
    // title nor the context line shifts when it does.
    <WizardFrame
      title="Edit model"
      documentTitle={[`Edit ${shownName}`, 'Models']}
      context={`Customize / Models / ${shownName}`}
      closeHref={closeHref}
      width="medium"
    >
      {body}
    </WizardFrame>
  );
}
