import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';

import type { ClusterManagerCommit } from '../../lib/clusterManager';
import { ClusterManagerCommitOutcome } from './ClusterManagerCommitOutcome';

const commit: ClusterManagerCommit = {
  repository: 'giantswarm/acme-gitops',
  directory: 'management-clusters/inst-1/organizations/acme',
  base: 'main',
  branch: 'delete-cluster-demo1',
  prune: true,
  files: [],
  pullRequest: 'https://github.com/giantswarm/acme-gitops/pull/9',
  number: 9,
  liveSteps: ['delete_cluster in mode apply deletes the Kustomization'],
};

describe('ClusterManagerCommitOutcome', () => {
  it('names the place "installation" by default, as the classic Clusters page does on main', async () => {
    await renderInTestApp(<ClusterManagerCommitOutcome commit={commit} />);

    expect(screen.getByTestId('live-steps')).toHaveTextContent(
      'After the merge, the installation still needs:',
    );
  });

  it('names it "environment" where the agent platform asks for it', async () => {
    await renderInTestApp(
      <ClusterManagerCommitOutcome commit={commit} placeNoun="environment" />,
    );

    expect(screen.getByTestId('live-steps')).toHaveTextContent(
      'After the merge, the environment still needs:',
    );
  });
});
