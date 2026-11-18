import { useState } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import type { CredentialCommit } from '../../lib/credentialOperations';
import type { UseDeleteModelConfigResult } from '../../hooks/useDeleteModelConfig';
import { modelsRouteRef } from '../../routes';
import { ModelActionsMenu } from './ModelActionsMenu';

const MODEL = new ModelConfig(
  {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: { name: 'sonnet', namespace: 'agents-payments-x7k2q' },
    spec: { provider: 'Anthropic', model: 'claude-sonnet-4-6' },
  } as ModelConfigInterface,
  'gazelle',
);

const PULL_REQUEST = {
  repository: 'giantswarm/gazelle-configs',
  base: 'main',
  pullRequest: 'https://github.com/giantswarm/gazelle-configs/pull/7',
  number: 7,
};

/**
 * The menu with a deletion as the page hands it: the delete's answer, and
 * the hook's last pull request once the delete opened one.
 */
function Menu({
  answer,
  error,
}: {
  answer: () => Promise<{ commit?: CredentialCommit }>;
  error?: Error;
}) {
  const [pullRequest, setPullRequest] = useState<CredentialCommit>();
  const deletion = {
    isDeletable: true,
    isCheckingDeletable: false,
    checkError: null,
    recheckDeletable: () => undefined,
    owner: undefined,
    deleteModelConfig: async () => {
      const result = await answer();
      setPullRequest(result.commit);
      return result;
    },
    isDeleting: false,
    error: error ?? null,
    pullRequest,
    reset: () => undefined,
  } satisfies UseDeleteModelConfigResult;
  return <ModelActionsMenu modelConfig={MODEL} deletion={deletion} />;
}

async function confirmDelete() {
  await userEvent.click(screen.getByRole('button', { name: 'Model actions' }));
  await userEvent.click(screen.getByRole('menuitem', { name: /Delete model/ }));
  const dialog = await screen.findByRole('dialog');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Delete model' }),
  );
  return dialog;
}

describe('ModelActionsMenu', () => {
  it('keeps the dialog with the pull request a delete opened, and claims nothing is deleted', async () => {
    await renderInTestApp(
      <Menu answer={async () => ({ commit: PULL_REQUEST })} />,
      { mountedRoutes: { '/customize/models': modelsRouteRef } },
    );

    const dialog = await confirmDelete();

    const outcome = await within(dialog).findByTestId(
      'model-delete-pull-request',
    );
    expect(outcome).toHaveTextContent('Pull request #7 opened');
    expect(
      within(outcome).getByRole('link', { name: /Review pull request/ }),
    ).toHaveAttribute('href', PULL_REQUEST.pullRequest);
    expect(screen.queryByText(/deleted/)).toBeNull();
  });

  it("shows agent-manager's refusal, and keeps the delete", async () => {
    const sentence =
      "ModelConfig agents-payments-x7k2q/sonnet was written live, not applied from git, so no file in the organization's content path defines it: change it with mode apply";
    await renderInTestApp(
      <Menu
        answer={async () => Promise.reject(new Error(sentence))}
        error={new Error(sentence)}
      />,
      { mountedRoutes: { '/customize/models': modelsRouteRef } },
    );

    const dialog = await confirmDelete();

    expect(await within(dialog).findByText(sentence)).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Delete model' }),
    ).toBeEnabled();
  });
});
